// The tracker's reducer and the words built from it. Pure: no engine, no clock.
import { expect, test } from 'claude-code/testing'

import { EMPTY_TRACKER, KEEP_FINISHED_MS, step } from '../hooks/tracker'
import type { TrackerEvent } from '../hooks/tracker'
import { buildPane, statusText } from '../hooks/view'
import type { ProgressHistoryEntry, ProgressRow, ProgressTracker } from '../types'

const SECOND = 1000
const MINUTE = 60_000

function agentRow(id: string, extra: Partial<ProgressRow> = {}): ProgressRow {
  return { id, kind: 'agent', label: id, key: `key-${id}`, startedAt: 0, lastActivityAt: 0, toolCalls: 0, inFlight: 0, agentId: `loop-${id}`, ...extra }
}

function mainRow(extra: Partial<ProgressRow> = {}): ProgressRow {
  return { id: 'main:t1', kind: 'main', label: 'Main reply', key: 'main', startedAt: 0, lastActivityAt: 0, toolCalls: 0, inFlight: 0, turnId: 't1', ...extra }
}

function run(events: TrackerEvent[], from: ProgressTracker = EMPTY_TRACKER) {
  let state = from
  const record: ProgressHistoryEntry[] = []
  for (const ev of events) {
    const out = step(state, ev)
    state = out.state
    record.push(...out.record)
  }
  return { state, record }
}

test('tool calls and progress go to the loop that made them', () => {
  const { state } = run([
    { type: 'add', row: mainRow() },
    { type: 'add', row: agentRow('a') },
    { type: 'add', row: agentRow('b') },
    { type: 'tool-start', tool: 'Read', now: 1000 },
    { type: 'tool-start', agentId: 'loop-a', tool: 'Grep', now: 2000 },
    { type: 'tool-start', agentId: 'loop-a', tool: 'Bash', now: 3000 },
    { type: 'progress', agentId: 'loop-b', step: 2, total: 8, label: 'reading', now: 4000 },
  ])
  const byId = (id: string) => state.rows.find(row => row.id === id)
  expect(byId('main:t1')).toMatchObject({ toolCalls: 1, lastTool: 'Read' })
  expect(byId('a')).toMatchObject({ toolCalls: 2, lastTool: 'Bash' })
  expect(byId('b')).toMatchObject({ toolCalls: 0, step: 2, total: 8, stepLabel: 'reading' })
  expect(byId('main:t1')?.step).toBeUndefined()
  expect(byId('a')?.step).toBeUndefined()
})

test('an agent the tracker does not know is not applied and changes nothing', () => {
  const start = run([{ type: 'add', row: agentRow('a') }]).state
  for (const ev of [
    { type: 'tool-start', agentId: 'loop-zzz', tool: 'Bash', now: 5 },
    { type: 'progress', agentId: 'loop-zzz', step: 1, total: 2, now: 5 },
    { type: 'finish', match: { by: 'agent', agentId: 'loop-zzz' }, outcome: 'done', now: 5 },
  ] as const) {
    const out = step(start, ev)
    expect(out.applied).toBe(false)
    expect(out.state).toBe(start)
    expect(out.record).toEqual([])
  }
})

test('progress: total is revised, never below step or 1', () => {
  const base = run([{ type: 'add', row: agentRow('a') }]).state
  const rowAfter = (ev: TrackerEvent) => step(base, ev).state.rows[0]
  expect(rowAfter({ type: 'progress', agentId: 'loop-a', step: 3, total: 2, now: 1 })).toMatchObject({ step: 3, total: 3 })
  expect(rowAfter({ type: 'progress', agentId: 'loop-a', step: 0, total: 0, now: 1 })).toMatchObject({ step: 0, total: 1 })
})

test('a finished agent leaves exactly one five-field history entry', () => {
  const { state, record } = run([
    { type: 'add', row: agentRow('a', { startedAt: 1000 }) },
    { type: 'tool-start', agentId: 'loop-a', tool: 'Bash', now: 2000 },
    { type: 'tool-end', agentId: 'loop-a', now: 3000 },
    { type: 'progress', agentId: 'loop-a', step: 3, total: 6, now: 4000 },
    { type: 'finish', match: { by: 'agent', agentId: 'loop-a' }, outcome: 'done', now: 91_000 },
    // a second end for the same agent (the notification after turn.complete) must not record again
    { type: 'finish', match: { by: 'task', taskId: 'loop-a' }, outcome: 'done', now: 92_000 },
  ])
  expect(record).toEqual([{ kind: 'agent', key: 'key-a', durationMs: 90_000, toolCalls: 1, totalSteps: 6 }])
  expect(Object.keys(record[0] ?? {}).sort()).toEqual(['durationMs', 'key', 'kind', 'toolCalls', 'totalSteps'])
  expect(state.rows[0]).toMatchObject({ outcome: 'done', endedAt: 91_000 })
})

test('only runs that ended on their own are remembered', () => {
  const finishWith = (row: ProgressRow, outcome: 'done' | 'failed' | 'stopped') =>
    run([{ type: 'add', row }, { type: 'finish', match: { by: 'row', rowId: row.id }, outcome, now: 5000 }]).record.length
  const shell = (id: string): ProgressRow => ({ id, kind: 'shell', label: 'npm test', key: 'k-npm', startedAt: 0, lastActivityAt: 0, toolCalls: 0, inFlight: 0, taskId: id })
  expect(finishWith(agentRow('a'), 'done')).toBe(1)
  expect(finishWith(agentRow('b'), 'stopped')).toBe(0)
  expect(finishWith(agentRow('c'), 'failed')).toBe(0)
  expect(finishWith(shell('s1'), 'done')).toBe(1)
  expect(finishWith(shell('s2'), 'failed')).toBe(1)
  expect(finishWith(shell('s3'), 'stopped')).toBe(0)
})

test('a main reply that answered at once leaves no row and no history; one that worked does', () => {
  const quick = run([{ type: 'add', row: mainRow() }, { type: 'finish', match: { by: 'main' }, outcome: 'done', now: 3 * SECOND }])
  expect(quick.state.rows).toEqual([])
  expect(quick.record).toEqual([])

  const worked = run([
    { type: 'add', row: mainRow() },
    { type: 'tool-start', tool: 'Read', now: 1000 },
    { type: 'finish', match: { by: 'main' }, outcome: 'done', now: 30 * SECOND },
  ])
  expect(worked.state.rows).toHaveLength(1)
  expect(worked.record).toEqual([{ kind: 'main', key: 'main', durationMs: 30_000, toolCalls: 1, totalSteps: 0 }])

  const slow = run([{ type: 'add', row: mainRow() }, { type: 'finish', match: { by: 'main' }, outcome: 'done', now: 11 * SECOND }])
  expect(slow.record).toHaveLength(1)
})

test('a main reply shows after its first tool call or 10 s, not before', () => {
  const state = run([{ type: 'add', row: mainRow() }]).state
  expect(statusText({ ...state, now: 9 * SECOND }, [])).toBeUndefined()
  expect(statusText({ ...state, now: 10 * SECOND }, [])).toBe('1 running, no estimate yet')
  const used = run([{ type: 'tool-start', tool: 'Bash', now: 1000 }], state).state
  expect(statusText(used, [])).toBe('1 running, no estimate yet')
})

test('a foreground agent keeps its parent from looking stalled; a background one does not', () => {
  const start = run([
    { type: 'add', row: mainRow() },
    { type: 'add', row: agentRow('fg') },
    { type: 'add', row: agentRow('bg', { isBackground: true }) },
  ]).state
  const fg = run([{ type: 'tool-start', agentId: 'loop-fg', tool: 'Grep', now: 200_000 }], start).state
  expect(fg.rows.find(row => row.kind === 'main')?.lastActivityAt).toBe(200_000)
  const bg = run([{ type: 'tool-start', agentId: 'loop-bg', tool: 'Grep', now: 200_000 }], start).state
  expect(bg.rows.find(row => row.kind === 'main')?.lastActivityAt).toBe(0)
})

test('a workflow groups its agents, counts them, and closes them when it ends', () => {
  const workflow = (extra: Partial<ProgressRow> = {}): ProgressRow => ({
    id: 'wf:wf_1',
    kind: 'workflow',
    label: 'code-review',
    key: 'k-wf',
    startedAt: 0,
    lastActivityAt: 0,
    toolCalls: 0,
    inFlight: 0,
    agentsStarted: 0,
    agentsDone: 0,
    isBackground: true,
    taskId: 'task-1',
    ...extra,
  })
  const child = (id: string): ProgressRow => agentRow(id, { groupId: 'wf:wf_1', isBackground: true })
  const afterTwo = run([
    { type: 'add', row: workflow() },
    { type: 'add', row: child('x') },
    { type: 'add', row: child('y') },
    { type: 'finish', match: { by: 'agent', agentId: 'loop-x' }, outcome: 'done', now: 40 * SECOND },
  ]).state
  expect(afterTwo.rows.find(row => row.kind === 'workflow')).toMatchObject({ agentsStarted: 2, agentsDone: 1 })

  const ended = run([{ type: 'finish', match: { by: 'task', taskId: 'task-1' }, outcome: 'done', now: 60 * SECOND }], afterTwo)
  expect(ended.state.rows.every(row => row.endedAt === 60 * SECOND)).toBe(false) // x ended earlier
  expect(ended.state.rows.filter(row => row.endedAt === undefined)).toEqual([])
  expect(ended.state.rows.find(row => row.kind === 'workflow')).toMatchObject({ outcome: 'done', agentsDone: 2 })
  expect(ended.record.map(entry => entry.kind)).toEqual(['workflow'])
})

test('a resumed workflow run replaces the finished one and drops its old agents', () => {
  const ensure = (now: number): TrackerEvent => ({ type: 'workflow-ensure', rowId: 'wf:wf_1', runId: 'wf_1', label: 'code-review', now })
  const first = run([ensure(0), { type: 'add', row: agentRow('x', { groupId: 'wf:wf_1', isBackground: true }) }, { type: 'finish', match: { by: 'row', rowId: 'wf:wf_1' }, outcome: 'done', now: SECOND }]).state
  const again = run([ensure(5 * SECOND)], first).state
  expect(again.rows).toHaveLength(1)
  expect(again.rows[0]).toMatchObject({ kind: 'workflow', startedAt: 5 * SECOND, agentsStarted: 0 })
  expect(again.rows[0]?.endedAt).toBeUndefined()
})

test('a workflow learns its name and task id after its agents started', () => {
  const { state } = run([
    { type: 'workflow-ensure', rowId: 'wf:wf_1', runId: 'wf_1', label: 'workflow', now: 0 },
    { type: 'workflow-ensure', rowId: 'wf:wf_1', runId: 'wf_1', taskId: 'task-9', label: 'code-review', now: SECOND },
    { type: 'workflow-ensure', rowId: 'wf:wf_1', label: 'workflow', now: 2 * SECOND },
  ])
  expect(state.rows).toHaveLength(1)
  expect(state.rows[0]).toMatchObject({ label: 'code-review', taskId: 'task-9', runId: 'wf_1' })
})

test('a background command that dies with its caller ends when the caller does', () => {
  const shell: ProgressRow = { id: 'sh:b1', kind: 'shell', label: 'watch', key: 'k', startedAt: 0, lastActivityAt: 0, toolCalls: 0, inFlight: 0, taskId: 'b1', endsWith: 'loop-a' }
  const { state, record } = run([{ type: 'add', row: agentRow('a') }, { type: 'add', row: shell }, { type: 'finish', match: { by: 'agent', agentId: 'loop-a' }, outcome: 'done', now: 9000 }])
  expect(state.rows.find(row => row.kind === 'shell')).toMatchObject({ outcome: 'stopped', endedAt: 9000 })
  expect(record.map(entry => entry.kind)).toEqual(['agent'])
})

test('finished rows stay for ten minutes, then go', () => {
  const finished = run([{ type: 'add', row: agentRow('a') }, { type: 'finish', match: { by: 'row', rowId: 'a' }, outcome: 'done', now: 1000 }]).state
  const justBefore = run([{ type: 'tick', now: 1000 + KEEP_FINISHED_MS - 1 }], finished).state
  expect(justBefore.rows).toHaveLength(1)
  expect(buildPane(justBefore, [], 40).rows).toHaveLength(1)
  const after = run([{ type: 'tick', now: 1000 + KEEP_FINISHED_MS }], finished).state
  expect(after.rows).toEqual([])
  // Even before a tick prunes it, the pane no longer draws a row past its ten minutes.
  expect(buildPane({ ...finished, now: 1000 + KEEP_FINISHED_MS }, [], 40).isEmpty).toBe(true)
})

test('a finished row shows its final duration, dimmed words and no time left', () => {
  const finished = run([{ type: 'add', row: agentRow('a') }, { type: 'tool-start', agentId: 'loop-a', tool: 'Bash', now: 1000 }, { type: 'finish', match: { by: 'row', rowId: 'a' }, outcome: 'done', now: 200_000 }]).state
  const view = buildPane({ ...finished, now: 210_000 }, [], 40).rows[0]
  expect(view).toMatchObject({ isFinished: true, facts: 'done in 3 min 20 s, 1 tool call', factsTone: 'dim', left: '' })
  const failed = run([{ type: 'add', row: agentRow('b') }, { type: 'finish', match: { by: 'row', rowId: 'b' }, outcome: 'failed', now: 5000 }]).state
  expect(buildPane(failed, [], 40).rows[0]).toMatchObject({ facts: 'failed after 5 s', factsTone: 'error' })
})

test('status line: nothing, one, many', () => {
  const none = run([]).state
  expect(statusText(none, [])).toBeUndefined()

  const one = run([{ type: 'add', row: agentRow('a') }]).state
  expect(statusText(one, [])).toBe('1 running, no estimate yet')

  // Two agents with steps: the longest estimate wins. a: 1 of 5 after 210 s -> 840 s left; b: 2 of 3 -> 105 s left.
  const many = run(
    [
      { type: 'add', row: agentRow('a') },
      { type: 'add', row: agentRow('b') },
      { type: 'progress', agentId: 'loop-a', step: 1, total: 5, now: 210_000 },
      { type: 'progress', agentId: 'loop-b', step: 2, total: 3, now: 210_000 },
    ],
    run([]).state,
  ).state
  expect(statusText(many, [])).toBe('2 running, about 14 min left')

  // A third task with nothing to go on does not change the longest estimate; it only raises the count.
  const three = run([{ type: 'add', row: agentRow('c', { startedAt: 200_000 }) }], many).state
  expect(statusText(three, [])).toBe('3 running, about 14 min left')

  const allDone = run(
    [
      { type: 'finish', match: { by: 'row', rowId: 'a' }, outcome: 'done', now: 220_000 },
      { type: 'finish', match: { by: 'row', rowId: 'b' }, outcome: 'done', now: 220_000 },
      { type: 'finish', match: { by: 'row', rowId: 'c' }, outcome: 'done', now: 220_000 },
    ],
    three,
  ).state
  expect(statusText(allDone, [])).toBeUndefined()
})

test('status line: a task past its typical time says so when nothing else has an estimate', () => {
  const history: ProgressHistoryEntry[] = [1, 2, 3].map(m => ({ kind: 'agent', key: 'key-a', durationMs: m * MINUTE, toolCalls: 1, totalSteps: 0 }))
  const state = run([{ type: 'add', row: agentRow('a') }, { type: 'tick', now: 5 * MINUTE }]).state
  expect(statusText(state, history)).toBe('1 running, running longer than usual')
})

test('/clear drops every row', () => {
  const state = run([{ type: 'add', row: agentRow('a') }, { type: 'reset', now: 5 }]).state
  expect(state.rows).toEqual([])
})
