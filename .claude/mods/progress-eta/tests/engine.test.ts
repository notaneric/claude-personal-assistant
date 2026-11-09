// The mod end to end, through the engine's own events. Nothing sits beneath the plugin but
// the hooks each test registers, so every answer below is one the test chose.
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { AgentSpawnInput, On, RegisteredToolSpec } from 'claude-code'

import { agentKey, programKey } from '../hooks/estimate'
import type { ProgressHistoryEntry, ProgressRow, ProgressTracker } from '../types'

const PROGRESS = 'mcp__progress-eta__progress'
const MINUTE = 60_000
const START = 1_000_000
const SESSION = { cwd: '/', surface: 'vscode', isInteractive: true } as const
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

type Rig = {
  /** The plugin's own key-value store, as the engine would keep it. */
  store: Record<string, unknown>
  /** The newest value written to each $.state key, by "plugin.key". */
  state: Record<string, unknown>
  tracker: () => ProgressTracker
  rows: () => ProgressRow[]
  history: () => ProgressHistoryEntry[]
  /** Overrides what the engine answers a tool call with; return undefined to use the default. */
  answer?: (input: Record<string, unknown>) => unknown
  clock: MockClock
  statuses: (string | undefined)[]
  registered: RegisteredToolSpec[]
  commands: string[]
  opens: number
  isPlaced: boolean
  /** Agent spawns as the engine received them, after any rewrite by the plugin. */
  spawned: AgentSpawnInput[]
  /** Tools that reached the engine; the progress tool never does. */
  called: string[]
  gate?: Promise<void>
}

/** Registers the engine's side of every call the plugin makes, and records what it was asked. */
function setup(on: On, options: { store?: Record<string, unknown> } = {}): Rig {
  const clock = mock.clock(on, { now: START })
  const store: Record<string, unknown> = JSON.parse(JSON.stringify(options.store ?? {}))
  const state: Record<string, unknown> = {}
  const rig: Rig = {
    store,
    state,
    tracker: () => (state['progress-eta.tracker'] as { value: ProgressTracker }).value,
    rows: () => rig.tracker().rows,
    history: () => (store.history ?? []) as ProgressHistoryEntry[],
    clock,
    statuses: [],
    registered: [],
    commands: [],
    opens: 0,
    isPlaced: true,
    spawned: [],
    called: [],
  }
  let agents = 0
  let shells = 0
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))
  // The kit keeps $.state; this hook only watches what is written on its way down.
  on('state.set', (_, e, next) => {
    state[`${e.plugin}.${e.key}`] = e.value
    return next(e)
  })
  on('ui.status', (_, e) => {
    rig.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => {
    rig.opens++
    return { value: rig.isPlaced ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'too narrow' } }
  })
  on('tool.register', (_, e) => {
    rig.registered.push(e)
    return { value: { tool: `mcp__progress-eta__${e.name}` } }
  })
  on('command.register', (_, e) => {
    rig.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', async (_, e) => {
    rig.spawned.push(e)
    agents += 1
    const agentId = `agent-${agents}`
    if (rig.gate !== undefined) await rig.gate
    return { model: 'sonnet', agentId }
  })
  on('tool.call', (_, e) => {
    const input = e as unknown as Record<string, unknown>
    rig.called.push(String(input.tool))
    const override = rig.answer?.(input)
    if (override !== undefined) return { result: override }
    if (input.tool === 'Bash' && input.run_in_background === true) {
      shells += 1
      return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `bg-${shells}` } }
    }
    if (input.tool === 'Workflow') {
      return { result: { status: 'async_launched', taskId: 'wf-task-1', runId: 'wf_1', workflowName: 'code-review' } }
    }
    return { result: { stdout: 'ok' } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  return rig
}

function spawnInput(label: string, extra: Partial<AgentSpawnInput> = {}): AgentSpawnInput {
  return {
    tool_use_id: `toolu_${label}`,
    prompt: `Do the ${label} task.`,
    description: label,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false,
    ...extra,
  }
}

function finishAgent($: Engine, agentId: string, reason: 'answer' | 'aborted' = 'answer') {
  return $.turn.complete({ answer: 'done', durationMs: 1, isAborted: reason === 'aborted', turnId: `turn-${agentId}`, agentId, reason })
}

function notice(taskId: string, status: string): string {
  return `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n<summary>finished</summary>\n</task-notification>`
}

const PANE = {
  plugin: 'progress-eta',
  component: 'Pane',
  requestId: 'progress-eta',
  props: { title: 'Progress', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('session start registers the progress tool and the command, and loads saved history', async ($, on) => {
  const saved = [{ kind: 'agent', key: 'k', durationMs: 5, toolCalls: 1, totalSteps: 0 }]
  const rig = setup(on, { store: { history: saved } })
  await $.session.start(SESSION)
  expect(rig.registered).toHaveLength(1)
  expect(rig.registered[0]).toMatchObject({ name: 'progress', isDeferred: false })
  expect(rig.registered[0]?.inputSchema).toMatchObject({ required: ['step', 'total'] })
  expect(rig.commands).toEqual(['progress'])
  // The status line is synced once at load: nothing is running, so it is cleared.
  expect(rig.statuses).toEqual([undefined])
})

test('a progress call is attributed to the loop that made it, by agentId', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.agent.spawn(spawnInput('first'))
  await $.agent.spawn(spawnInput('second'))

  const reply = await $.tool.call({ tool: PROGRESS, step: 2, total: 8, label: 'reading', agentId: 'agent-2' })
  expect(reply.result).toBe('Recorded step 2 of 8.')
  await $.tool.call({ tool: PROGRESS, step: 1, total: 3 })

  const rows = rig.rows()
  const named = (label: string) => rows.find(row => row.label === label)
  expect(named('second')).toMatchObject({ step: 2, total: 8, stepLabel: 'reading' })
  expect(named('first')?.step).toBeUndefined()
  expect(named('Main reply')).toMatchObject({ step: 1, total: 3 })
  expect(rig.called).toEqual([])
})

test('a progress call that arrives before its agent is known is held, then applied', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  let release: () => void = () => undefined
  rig.gate = new Promise<void>(resolve => {
    release = resolve
  })
  const spawning = $.agent.spawn(spawnInput('slow start'))
  await rig.clock.settle()

  // The agent is already working, but its spawn has not answered, so nobody knows its id yet.
  await $.tool.call({ tool: PROGRESS, step: 1, total: 4, agentId: 'agent-1' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })
  expect(rig.state['progress-eta.tracker']).toBeUndefined()

  release()
  await spawning
  expect(rig.rows()[0]).toMatchObject({ label: 'slow start', agentId: 'agent-1', toolCalls: 1, step: 1, total: 4, lastTool: 'Bash' })
  expect(rig.rows()[0]?.inFlight).toBe(0)
})

test('tool calls from loops the mod does not track reach the engine untouched and write nothing', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  for (let i = 0; i < 5; i++) {
    const ran = await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'someone-else' })
    expect(ran.result).toEqual({ stdout: 'ok' })
  }
  expect(rig.called).toEqual(['Read', 'Read', 'Read', 'Read', 'Read'])
  expect(rig.state['progress-eta.tracker']).toBeUndefined()
})

// A project blocks tool calls with settings hooks (PreToolUse, exit 2). The tracker sits above them and must never
// answer a call itself, or a gate's refusal would be skipped. The kit's classic.PreToolUse stands for those hooks.
test('a call a settings hook refuses stays refused, and never reaches the engine', async ($, on) => {
  const rig = setup(on)
  on('classic.PreToolUse', () => ({ deny: 'blocked by a settings hook' }))
  await $.session.start(SESSION)
  const ran = (await $.tool.call({ tool: 'Bash', command: 'echo hi' })) as unknown as { isError?: boolean; deny?: string }
  expect(ran.isError === true || ran.deny !== undefined).toBe(true)
  expect(rig.called).toEqual([])
})

test('a malformed progress call is answered, not failed, and recorded as nothing', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('quiet one'))
  const reply = await $.tool.call({ tool: PROGRESS, step: 'abc', total: 4, agentId: 'agent-1' })
  expect(reply.result).toBe('Not recorded: step and total must be numbers.')
  expect((rig.rows())[0]?.step).toBeUndefined()
})

test('a finished agent adds one five-field entry to the history in the store', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('map the schema', { subagentType: 'Explore' }))
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' })
  await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'agent-1' })
  await $.tool.call({ tool: PROGRESS, step: 3, total: 6, agentId: 'agent-1' })
  await rig.clock.advance(90_000)
  await finishAgent($, 'agent-1')

  const history = rig.history()
  expect(history).toEqual([{ kind: 'agent', key: agentKey('Explore', 'map the schema'), durationMs: 90_000, toolCalls: 2, totalSteps: 6 }])
  expect(Object.keys(history[0] ?? {}).sort()).toEqual(['durationMs', 'key', 'kind', 'toolCalls', 'totalSteps'])
  // Only a hash of the description reaches the store, never the words.
  expect(JSON.stringify(history)).not.toContain('schema')
  expect(rig.statuses.at(-1)).toBeUndefined()
})

test('an agent that was interrupted is not remembered', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('cut short'))
  await finishAgent($, 'agent-1', 'aborted')
  expect(rig.history()).toEqual([])
  expect((rig.rows())[0]).toMatchObject({ outcome: 'stopped' })
})

test('the history keeps the newest 300 entries', async ($, on) => {
  const old: ProgressHistoryEntry[] = Array.from({ length: 299 }, (_, i) => ({ kind: 'agent', key: 'old', durationMs: i + 1, toolCalls: 0, totalSteps: 0 }))
  const rig = setup(on, { store: { history: old } })
  await $.session.start(SESSION)
  for (const [index, label] of ['one', 'two', 'three'].entries()) {
    await $.agent.spawn(spawnInput(label))
    await rig.clock.advance(30_000)
    await finishAgent($, `agent-${index + 1}`)
  }
  const history = rig.history()
  expect(history).toHaveLength(300)
  expect(history[0]?.durationMs).toBe(3)
  // 299 old + 3 new = 302: the two oldest (1 and 2) are gone, the newest three are last.
  expect(history[296]).toMatchObject({ key: 'old', durationMs: 299 })
  expect(history.slice(297).map(entry => entry.key)).toEqual([
    agentKey('general-purpose', 'one'),
    agentKey('general-purpose', 'two'),
    agentKey('general-purpose', 'three'),
  ])
  expect(history[299]).toMatchObject({ durationMs: 30_000 })
})

test('status line: nothing, one, many', async ($, on) => {
  const rig = setup(on)
  const last = () => rig.statuses.at(-1)
  await $.session.start(SESSION)
  expect(last()).toBeUndefined()

  await $.agent.spawn(spawnInput('one'))
  expect(last()).toBe('1 running, no estimate yet')

  await rig.clock.advance(210_000)
  await $.tool.call({ tool: PROGRESS, step: 1, total: 5, agentId: 'agent-1' })
  expect(last()).toBe('1 running, about 14 min left')

  await $.agent.spawn(spawnInput('two'))
  expect(last()).toBe('2 running, about 14 min left')

  await finishAgent($, 'agent-1')
  await finishAgent($, 'agent-2')
  expect(last()).toBeUndefined()
})

test('the main reply is followed from its first tool call to its answer', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.turn.start({ text: 'go', turnId: 't1' })
  // A reply that has done nothing yet is not news: no status text, no pane.
  expect(rig.statuses.filter(text => text !== undefined)).toEqual([])
  expect(rig.opens).toBe(0)

  await rig.clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  expect(rig.statuses.at(-1)).toBe('1 running, no estimate yet')
  expect(rig.opens).toBe(1)
  expect((rig.rows())[0]).toMatchObject({ kind: 'main', toolCalls: 1, lastTool: 'Read' })

  await rig.clock.advance(28_000)
  await $.turn.complete({ answer: 'x', durationMs: 30_000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(rig.statuses.at(-1)).toBeUndefined()
  expect(rig.history()).toEqual([{ kind: 'main', key: 'main', durationMs: 30_000, toolCalls: 1, totalSteps: 0 }])
  // The pane is opened once per session, not for every later task.
  await $.agent.spawn(spawnInput('later'))
  expect(rig.opens).toBe(1)
})

test('a background command ends on its task notification, and only on the engine\'s own', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: 'cd /work && npm test', description: 'Run the unit tests', run_in_background: true })
  let rows = rig.rows()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ kind: 'shell', label: 'Run the unit tests', taskId: 'bg-1' })
  expect(rows[0]?.endedAt).toBeUndefined()
  expect(rig.statuses.at(-1)).toBe('1 running, no estimate yet')

  // Someone typing the same words ends nothing.
  await $.prompt.submit({ text: notice('bg-1', 'completed'), wait: false, origin: { kind: 'composer' } })
  expect((rig.rows())[0]?.endedAt).toBeUndefined()

  await rig.clock.advance(2 * MINUTE)
  await $.prompt.submit({ text: notice('bg-1', 'completed'), wait: false, origin: { kind: 'task-notification' } })
  rows = rig.rows()
  expect(rows[0]).toMatchObject({ outcome: 'done' })
  expect(rig.statuses.at(-1)).toBeUndefined()
  expect(rig.history()).toEqual([{ kind: 'shell', key: programKey('cd /work && npm test'), durationMs: 2 * MINUTE, toolCalls: 0, totalSteps: 0 }])
})

test('the stored notification row ends a command too, and a killed one is not remembered', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: 'sleep 600', run_in_background: true })
  await rig.clock.advance(MINUTE)
  await $.session.append({
    message: { type: 'user', isMeta: true, content: [{ type: 'text', text: notice('bg-1', 'killed') }] },
    door: 'prompt',
    origin: { kind: 'task-notification' },
    uuid: 'row-1',
  })
  expect((rig.rows())[0]).toMatchObject({ outcome: 'stopped' })
  expect(rig.history()).toEqual([])
})

test('a command started in the foreground and then backgrounded is tracked from the call', async ($, on) => {
  const rig = setup(on)
  rig.answer = () => ({ stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-9', timedOutAfterMs: 120_000 })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: 'make all' })
  expect((rig.rows())[0]).toMatchObject({ kind: 'shell', taskId: 'bg-9', label: 'make' })
  expect(rig.statuses.at(-1)).toBe('1 running, no estimate yet')
})

test('a workflow is one row with its agents under it, and ends with its notification', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Workflow', name: 'code-review' })
  await $.agent.spawn(spawnInput('check types', { workflow: { runId: 'wf_1', agentIndex: 1 } }))
  await $.agent.spawn(spawnInput('check tests', { workflow: { runId: 'wf_1', agentIndex: 2 } }))

  let rows = rig.rows()
  const flow = rows.find(row => row.kind === 'workflow')
  expect(flow).toMatchObject({ label: 'code-review', taskId: 'wf-task-1', runId: 'wf_1', agentsStarted: 2, agentsDone: 0 })
  expect(rows.filter(row => row.groupId === flow?.id)).toHaveLength(2)
  expect(rig.statuses.at(-1)).toBe('1 running, no estimate yet')

  await rig.clock.advance(MINUTE)
  await finishAgent($, 'agent-1')
  rows = rig.rows()
  expect(rows.find(row => row.kind === 'workflow')).toMatchObject({ agentsDone: 1 })

  await $.prompt.submit({ text: notice('wf-task-1', 'completed'), wait: false, origin: { kind: 'task-notification' } })
  rows = rig.rows()
  expect(rows.every(row => row.endedAt !== undefined)).toBe(true)
  expect(rows.find(row => row.kind === 'workflow')).toMatchObject({ outcome: 'done', agentsDone: 2 })
  expect(rig.statuses.at(-1)).toBeUndefined()
  expect((rig.history()).map(entry => entry.kind).sort()).toEqual(['agent', 'workflow'])
})

test('TaskStop ends the task it names', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })
  rig.answer = input => (input.tool === 'TaskStop' ? { message: 'stopped', task_id: 'bg-1', task_type: 'local_bash' } : undefined)
  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-1' })
  expect((rig.rows())[0]).toMatchObject({ outcome: 'stopped' })
  expect(rig.statuses.at(-1)).toBeUndefined()
})

test('every new agent is told to report progress once; resumes and teammates are left alone', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('plain'))
  await $.agent.spawn(spawnInput('mentions it', { prompt: 'Call mcp__progress-eta__progress yourself.' }))
  await $.agent.spawn(spawnInput('resumed', { resume: { agentId: 'agent-1' } }))
  await $.agent.spawn(spawnInput('mate', { isTeammate: true }))
  const [plain, mentions, resumed, mate] = rig.spawned
  expect(plain?.prompt.startsWith('Do the plain task.')).toBe(true)
  expect(plain?.prompt).toContain('call it first with step 0 and total set to the number of steps this job needs')
  expect(plain?.prompt.match(/Progress reporting/g)).toHaveLength(1)
  expect(mentions?.prompt).toBe('Call mcp__progress-eta__progress yourself.')
  expect(resumed?.prompt).toBe('Do the resumed task.')
  expect(mate?.prompt).toBe('Do the mate task.')
  // A teammate is not tracked as a task.
  expect((rig.rows()).map(row => row.label)).toEqual(['plain', 'mentions it', 'resumed'])
})

test('the main reply gets the same short instruction in its system prompt, last', async ($, on) => {
  setup(on)
  const prompt = {
    model: 'opus',
    promptModel: 'opus',
    surfaces: ['vscode'] as const,
    tools: [] as readonly string[],
    outputStyle: null,
  }
  const composed = await $.prompt.compose({ ...prompt, traits: [] })
  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'progress-eta:reporting'])
  expect(composed.sections[1]).toMatchObject({ scope: 'session' })
  expect(composed.sections[1]?.text).toContain('call it first with step 0')
  const bare = await $.prompt.compose({ ...prompt, traits: ['bare'] })
  expect(bare.sections.map(section => section.id)).toEqual(['intro'])
})

test('/progress opens the pane, or lists what is running where none can be drawn', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  const run = () => $.command.run({ command: 'progress', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect((await run()).text).toBe('Progress panel opened.')
  expect(rig.tracker().autoOpened).toBe(true)

  rig.isPlaced = false
  await $.agent.spawn(spawnInput('slow job'))
  const text = (await run()).text ?? ''
  expect(text).toContain('1 running, no estimate yet')
  expect(text).toContain('slow job (background agent)')
  expect(text).toContain('could not be placed here: too narrow')
})

test('the first task opens the pane; a pane that could not be placed is tried again at the next task', async ($, on) => {
  const rig = setup(on)
  rig.isPlaced = false
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('one'))
  expect(rig.opens).toBe(1)
  expect(rig.tracker().autoOpened).toBe(false)
  rig.isPlaced = true
  await $.agent.spawn(spawnInput('two'))
  expect(rig.opens).toBe(2)
  expect(rig.tracker().autoOpened).toBe(true)
  await $.agent.spawn(spawnInput('three'))
  expect(rig.opens).toBe(2)
})

test('the pane draws every row on every surface', async ($, on) => {
  const key = agentKey('general-purpose', 'slow job')
  const history = [1, 2, 3].map(minutes => ({ kind: 'agent', key, durationMs: minutes * MINUTE, toolCalls: 4, totalSteps: 0 }))
  const rig = setup(on, { store: { history } })
  await $.session.start(SESSION)

  for (const surface of SURFACES) {
    const empty = await $.ui.mount({ ...PANE, surface })
    expect(await empty.find({ type: 'Text', text: 'Nothing is running.' })).toBeDefined()
    await empty.unmount()
  }

  await $.agent.spawn(spawnInput('slow job'))
  await $.agent.spawn(spawnInput('stepper'))
  await $.tool.call({ tool: PROGRESS, step: 1, total: 4, label: 'reading the schema', agentId: 'agent-2' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-2' })
  await rig.clock.advance(6 * MINUTE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = async (pattern: RegExp | string) => (await ui.find({ type: 'Text', text: pattern }))?.text
    expect(await text('2 running, about 18 min left')).toBe('2 running, about 18 min left')
    expect(await text(/^slow job$/)).toBe('slow job')
    expect(await text(/^running longer than usual \(typical 2 min\)$/)).toBeDefined()
    expect(await text(/^quiet for 6 min, last tool Bash$/)).toBeDefined()
    expect(await text(/^quiet for 6 min$/)).toBeDefined()
    expect(await text(/^█+░* 1 of 4$/)).toBeDefined()
    expect(await text('reading the schema')).toBe('reading the schema')
    expect(await text(/^about 18 min left$/)).toBe('about 18 min left')
    await ui.unmount()
  }
})

test('finished rows stay on the pane, dimmed, for ten minutes', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('quick job'))
  await rig.clock.advance(75_000)
  await finishAgent($, 'agent-1')

  for (const minutes of [1, 9]) {
    await rig.clock.advance(minutes === 1 ? MINUTE : 8 * MINUTE)
    const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
    const facts = await ui.find({ type: 'Text', text: /^done in 1 min 15 s$/ })
    expect(facts?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: 'quick job' })).toBeDefined()
    await ui.unmount()
  }

  await rig.clock.advance(2 * MINUTE)
  const gone = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await gone.find({ type: 'Text', text: 'quick job' })).toBeUndefined()
  expect(await gone.find({ type: 'Text', text: 'Nothing is running.' })).toBeDefined()
  await gone.unmount()
})

test('the tick moves the clock the pane and the status line read', async ($, on) => {
  const key = agentKey('general-purpose', 'timed job')
  const history = [1, 2, 3].map(minutes => ({ kind: 'agent', key, durationMs: minutes * MINUTE, toolCalls: 1, totalSteps: 0 }))
  const rig = setup(on, { store: { history } })
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('timed job'))
  expect(rig.statuses.at(-1)).toBe('1 running, about 2 min left')
  await rig.clock.advance(MINUTE)
  expect(rig.statuses.at(-1)).toBe('1 running, about 1 min left')
  await rig.clock.advance(MINUTE + 30_000)
  expect(rig.statuses.at(-1)).toBe('1 running, running longer than usual')
  expect(rig.tracker().now).toBe(START + 2.5 * MINUTE)
})

test('/clear drops the rows of the old conversation', async ($, on) => {
  const rig = setup(on)
  await $.session.start(SESSION)
  await $.agent.spawn(spawnInput('old work'))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(rig.rows()).toEqual([])
  expect(rig.statuses.at(-1)).toBeUndefined()
})

test('bookkeeping that throws never stops an event: next is still called and its result returned', async ($, on) => {
  // The clock is down, so everything the mod does that reads the time throws.
  const seen: Record<string, number> = {}
  const count = (name: string) => {
    seen[name] = (seen[name] ?? 0) + 1
  }
  let promptSeen = ''
  on('clock.now', () => ({ deny: 'clock down' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', (_, e) => {
    count('tool.call')
    return { result: { stdout: `ran ${String(e.tool)}` } }
  })
  on('agent.spawn', (_, e) => {
    count('agent.spawn')
    promptSeen = e.prompt
    return { model: 'sonnet', agentId: 'agent-1' }
  })
  on('turn.start', (_, e) => {
    count('turn.start')
    return { turnId: e.turnId }
  })
  on('turn.complete', () => {
    count('turn.complete')
    return { text: 'the answer' }
  })
  on('prompt.submit', (_, e) => {
    count('prompt.submit')
    return { text: e.text }
  })
  on('prompt.compose', () => {
    count('prompt.compose')
    return { sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }
  })

  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(seen['tool.call']).toBe(1)
  expect(ran.result).toEqual({ stdout: 'ran Bash' })

  const started = await $.agent.spawn(spawnInput('whatever'))
  expect(seen['agent.spawn']).toBe(1)
  expect(started).toMatchObject({ model: 'sonnet', agentId: 'agent-1' })
  expect(promptSeen).toBe('Do the whatever task.')

  expect(await $.turn.start({ text: 'go', turnId: 't1' })).toEqual({ turnId: 't1' })
  expect(seen['turn.start']).toBe(1)
  expect(await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })).toMatchObject({ text: 'the answer' })
  expect(seen['turn.complete']).toBe(1)

  const submitted = await $.prompt.submit({ text: notice('bg-1', 'completed'), wait: false, origin: { kind: 'task-notification' } })
  expect(seen['prompt.submit']).toBe(1)
  expect(submitted).toMatchObject({ text: notice('bg-1', 'completed') })

  // A hook that throws inside its own try (traits missing) still hands back what was composed.
  const broken = { model: 'opus', promptModel: 'opus', surfaces: ['vscode'] as const, tools: [] as readonly string[], outputStyle: null }
  const composed = await $.prompt.compose({ ...broken, traits: undefined as never })
  expect(seen['prompt.compose']).toBe(1)
  expect(composed.sections.map(section => section.id)).toEqual(['intro'])

  // The mod's own tool still answers when it cannot record anything.
  const reply = await $.tool.call({ tool: PROGRESS, step: 1, total: 2 })
  expect(typeof reply.result).toBe('string')
})
