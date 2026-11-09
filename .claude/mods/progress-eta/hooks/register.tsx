// progress-eta: live progress and time left for agents, workflows, background commands
// and the main reply, in a side panel and the status line.
//
// Safety rule for every hook below that watches the session: the event is always handed
// on. Bookkeeping runs inside guard(), which swallows its own errors, and next() is
// called exactly once whether the bookkeeping worked or not. The only hooks that answer
// without next are the ones for this mod's own tool (progress), own command (/progress) and
// own pane, because nothing beneath them could.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { ProgressHistoryEntry, ProgressRow } from '../types'
import { agentKey, programKey, programOf } from './estimate'
import { cleanLabel } from './format'
import {
  asRecord,
  backgroundTaskIdOf,
  endsWithFinalResponse,
  parseProgressArgs,
  parseTaskNotifications,
  workflowNameOf,
} from './inputs'
import { paneTree } from './pane'
import { appendHistory, cleanHistory, EMPTY_TRACKER, isShown, step } from './tracker'
import type { StepResult, TrackerEvent } from './tracker'
import { buildPane, statusText, summaryText } from './view'

type Dollar = EngineInterface

// The two values the mod keeps in $.state; they outlive a hot reload of the code. They are declared here, in the
// module that reads and writes them, because the validator's scan of $.state calls reads atoms from the same file.
// Change a shape tag when the fields of its value change: new code then reads what old code stored as empty.
const trackerAtom = atom({ plugin: 'progress-eta', key: 'tracker' } as const, EMPTY_TRACKER, { shape: 'tracker-1' })
const historyAtom = atom({ plugin: 'progress-eta', key: 'history' } as const, [] as ProgressHistoryEntry[], { shape: 'history-1' })

/** Events that can arrive from an agent before its spawn has answered, and are held until it does. */
type Stashable = Extract<TrackerEvent, { type: 'tool-start' | 'tool-end' | 'progress' | 'finish' }>

const PANE_ID = 'progress-eta'
const TOOL_NAME = 'progress'
// Must equal mcp__<plugin name>__<tool name>; the tool.call matcher below spells it out.
const FULL_TOOL_NAME = 'mcp__progress-eta__progress'
const HISTORY_KEY = 'history'
const TICK_MS = 5_000
const ORPHAN_TTL_MS = 60_000
const ORPHAN_MAX_IDS = 40
const ORPHAN_MAX_EVENTS = 100
const WORKFLOW_NAMES_MAX = 20

const TOOL_DESCRIPTION =
  'Report progress on the job you are doing so a time estimate can be shown. Call it with step 0 and total set to ' +
  'the number of steps the job needs before you start, then call it again each time a step completes. Revise total ' +
  'if the plan changes. It only records the numbers and changes no files.'

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    step: { type: 'number', description: 'Steps finished so far. Use 0 at the start.' },
    total: { type: 'number', description: 'Steps the whole job needs. Revise it if the plan changes.' },
    label: { type: 'string', description: 'Optional: a few words naming the step now in progress.' },
  },
  required: ['step', 'total'],
}

const AGENT_NOTE =
  '\n\nProgress reporting: if you have a tool named progress (mcp__progress-eta__progress), call it first with step 0 ' +
  'and total set to the number of steps this job needs, call it again as each step completes, and revise total if ' +
  'your plan changes. If you do not have that tool, ignore this note.'

const MAIN_NOTE =
  'Progress reporting: when a reply will take more than a few tool calls, and you have a tool named progress ' +
  '(mcp__progress-eta__progress), call it first with step 0 and total set to the number of steps you expect, call it ' +
  'again as each step completes, and revise total if your plan changes. Skip it for short answers.'

// Module variables are lost on a hot reload, which is fine: everything that matters lives in $.state.
let lastStatus: string | undefined
let hasStatus = false
let ticker: { cancel: () => void } | undefined
let persisting: Promise<void> = Promise.resolve()
let bindCount = 0
let registeredName: string | undefined
const orphans = new Map<string, { at: number; events: Stashable[] }>()
const workflowNames = new Map<string, string>()

/** Runs bookkeeping so that nothing it does can break the session: errors are logged to the debug log only. */
async function guard($: Dollar, what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (error) {
    try {
      $.ui.log(`progress-eta: ${what} failed (${error instanceof Error ? error.name : 'error'})`, { to: 'debug' })
    } catch {
      // Not even the log line worked; there is nothing more to do.
    }
  }
}

function rememberWorkflowName(toolUseId: unknown, name: string): void {
  if (typeof toolUseId !== 'string') return
  if (workflowNames.size >= WORKFLOW_NAMES_MAX) {
    const oldest = workflowNames.keys().next().value
    if (oldest !== undefined) workflowNames.delete(oldest)
  }
  workflowNames.set(toolUseId, name)
}

function stash(agentId: string, ev: Stashable): void {
  for (const [id, held] of orphans) {
    if (ev.now - held.at > ORPHAN_TTL_MS) orphans.delete(id)
  }
  if (!orphans.has(agentId) && orphans.size >= ORPHAN_MAX_IDS) {
    const oldest = orphans.keys().next().value
    if (oldest !== undefined) orphans.delete(oldest)
  }
  const held = orphans.get(agentId) ?? { at: ev.now, events: [] }
  held.events.push(ev)
  if (held.events.length > ORPHAN_MAX_EVENTS) held.events.shift()
  orphans.set(agentId, held)
}

/** Applies what was held for an agent once its spawn has answered and the row knows its id. */
async function drain($: Dollar, agentId: string): Promise<void> {
  const held = orphans.get(agentId)
  if (held === undefined) return
  orphans.delete(agentId)
  for (const ev of held.events) await dispatch($, ev)
}

/** Appends to the history in $.state, then writes it to $.store, one write at a time. */
async function remember($: Dollar, entry: ProgressHistoryEntry): Promise<void> {
  await update($, historyAtom, list => appendHistory(list, entry))
  persisting = persisting
    .then(async () => {
      const latest = await read($, historyAtom)
      await $.store.set(HISTORY_KEY, latest)
    })
    .catch(() => undefined)
  await persisting
}

/** Writes the status line when its words changed; an empty tracker clears it. */
async function refresh($: Dollar): Promise<void> {
  const state = await read($, trackerAtom)
  const history = await read($, historyAtom)
  const text = statusText(state, history)
  if (hasStatus && text === lastStatus) return
  hasStatus = true
  lastStatus = text
  $.ui.status(text)
}

/** Opens the pane the first time work is worth showing; later work leaves it as the person set it. */
async function maybeOpen($: Dollar): Promise<void> {
  const state = await read($, trackerAtom)
  if (state.autoOpened) return
  if (!state.rows.some(row => row.endedAt === undefined && isShown(row, state.now))) return
  const claim = { won: false }
  await update($, trackerAtom, current => {
    claim.won = !current.autoOpened
    return current.autoOpened ? current : { ...current, autoOpened: true }
  })
  if (!claim.won) return
  let isPlaced = false
  try {
    isPlaced = (await $.ui.open({ id: PANE_ID, title: 'Progress' })).isPlaced
  } catch {
    isPlaced = false
  }
  // Not drawn (a narrow window, no surface yet): try again when the next task starts.
  if (!isPlaced) await update($, trackerAtom, current => ({ ...current, autoOpened: false }))
}

/** Applies one event to the tracker, remembers finished runs, and refreshes the status line. */
async function dispatch($: Dollar, ev: TrackerEvent): Promise<boolean> {
  const box: { out?: StepResult } = {}
  await update($, trackerAtom, current => {
    box.out = step(current, ev)
    return box.out.state
  })
  const out = box.out
  if (out === undefined) return false
  for (const entry of out.record) await remember($, entry)
  if (out.isStructural) await refresh($)
  if (out.applied && (ev.type === 'add' || ev.type === 'workflow-ensure' || (ev.type === 'tool-start' && out.isStructural))) {
    await maybeOpen($)
  }
  return out.applied
}

/**
 * Applies an event about a running loop: the main reply when agentId is absent, else that agent.
 * An agent the tracker does not know yet (its spawn has not answered) has its events held.
 */
async function dispatchLoop($: Dollar, agentId: string | undefined, ev: Stashable): Promise<void> {
  const bindsSeen = bindCount
  const before = await read($, trackerAtom)
  if (step(before, ev).applied) {
    await dispatch($, ev)
    return
  }
  if (agentId === undefined) return
  stash(agentId, ev)
  // The spawn answered while we were looking: nobody else will apply what was just held.
  if (bindCount !== bindsSeen) await drain($, agentId)
}

/** Every 5 seconds: move the clock the pane draws from, drop rows past their 10 minutes. */
async function tick($: Dollar): Promise<void> {
  const state = await read($, trackerAtom)
  if (state.rows.length === 0) return
  await dispatch($, { type: 'tick', now: await $.clock.now() })
}

async function loadHistory($: Dollar): Promise<void> {
  const stored = await $.store.get(HISTORY_KEY)
  const cleaned = cleanHistory(stored)
  await update($, historyAtom, () => cleaned)
}

/** The progress tool. Answers every call, including a malformed one: the model must never see it fail. */
async function serveProgress($: Dollar, input: Readonly<Record<string, unknown>>): Promise<{ result: string }> {
  try {
    const args = parseProgressArgs(input)
    if (args === undefined) return { result: 'Not recorded: step and total must be numbers.' }
    const agentId = typeof input.agentId === 'string' ? input.agentId : undefined
    const now = await $.clock.now()
    const ev: Stashable = { type: 'progress', step: args.step, total: args.total, now }
    if (agentId !== undefined) ev.agentId = agentId
    if (args.label !== undefined) ev.label = args.label
    await dispatchLoop($, agentId, ev)
    return { result: `Recorded step ${args.step} of ${args.total}.` }
  } catch {
    return { result: 'Progress could not be recorded. Carry on.' }
  }
}

function workflowRowId(runId: string | undefined, taskId: string | undefined): string {
  return `wf:${runId ?? `task-${taskId ?? 'unknown'}`}`
}

/** What a finished tool call starts or ends: a background command, a workflow run, a stopped task. */
async function afterTool($: Dollar, input: Readonly<Record<string, unknown>>, ran: ToolCallResult, startedAt: number, now: number): Promise<void> {
  if (ran.deny !== undefined) return
  const tool = String(input.tool)
  const agentId = typeof input.agentId === 'string' ? input.agentId : undefined

  if (tool === 'Bash' || tool === 'PowerShell') {
    const taskId = backgroundTaskIdOf(ran.result)
    if (taskId === undefined) return
    const command = typeof input.command === 'string' ? input.command : ''
    const description = typeof input.description === 'string' ? input.description : ''
    const row: ProgressRow = {
      id: `sh:${taskId}`,
      kind: 'shell',
      label: cleanLabel(description !== '' ? description : programOf(command)),
      key: programKey(command),
      startedAt,
      lastActivityAt: now,
      toolCalls: 0,
      inFlight: 0,
      taskId,
      isBackground: true,
    }
    if (agentId !== undefined) row.parentId = agentId
    if (endsWithFinalResponse(ran.result)) row.endsWith = agentId ?? 'main'
    await dispatch($, { type: 'add', row })
    return
  }

  if (tool === 'Workflow') {
    const record = asRecord(ran.result)
    if (record === undefined || record.error !== undefined) return
    const runId = typeof record.runId === 'string' ? record.runId : undefined
    const taskId = typeof record.taskId === 'string' ? record.taskId : undefined
    if (runId === undefined && taskId === undefined) return
    const toolUseId = typeof input.tool_use_id === 'string' ? input.tool_use_id : ''
    const label =
      typeof record.workflowName === 'string' && record.workflowName !== ''
        ? cleanLabel(record.workflowName, 60)
        : (workflowNames.get(toolUseId) ?? workflowNameOf(input))
    const ev: TrackerEvent = { type: 'workflow-ensure', rowId: workflowRowId(runId, taskId), label, now }
    if (runId !== undefined) ev.runId = runId
    if (taskId !== undefined) ev.taskId = taskId
    await dispatch($, ev)
    return
  }

  if (tool === 'TaskStop' && ran.isError !== true) {
    const record = asRecord(ran.result)
    const named = [record?.task_id, input.task_id, input.shell_id].find((value): value is string => typeof value === 'string' && value !== '')
    if (named !== undefined) await dispatch($, { type: 'finish', match: { by: 'task', taskId: named }, outcome: 'stopped', now })
  }
}

/** A background task reported finished by a notification the engine delivered. */
async function noteNotifications($: Dollar, text: string): Promise<void> {
  const notices = parseTaskNotifications(text)
  if (notices.length === 0) return
  const now = await $.clock.now()
  for (const notice of notices) {
    await dispatch($, { type: 'finish', match: { by: 'task', taskId: notice.taskId }, outcome: notice.outcome, now })
  }
}

function textOfBlocks(content: readonly unknown[]): string {
  let text = ''
  for (const block of content) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') text += `${record.text}\n`
  }
  return text
}

export const register: Register = on => {
  // A load starts from nothing: module variables never carry over from an earlier load.
  lastStatus = undefined
  hasStatus = false
  ticker = undefined
  persisting = Promise.resolve()
  bindCount = 0
  registeredName = undefined
  orphans.clear()
  workflowNames.clear()

  on('session.start', async ($, e, next) => {
    await guard($, 'register tool', async () => {
      const registered = await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
      registeredName = registered.tool
      if (registered.tool !== FULL_TOOL_NAME) $.ui.log(`progress-eta: the engine named the tool ${registered.tool}`, { to: 'debug' })
    })
    await guard($, 'register command', async () => {
      await $.command.register({ name: 'progress', description: 'Show running work and the time left in a side panel' })
    })
    await guard($, 'load history', () => loadHistory($))
    await guard($, 'start timer', async () => {
      ticker?.cancel()
      ticker = $.clock.every(TICK_MS, () => {
        void guard($, 'tick', () => tick($))
      })
    })
    // Bring the status line in step with what the tracker holds, once per load (after a reload it may be stale).
    await guard($, 'sync status', () => refresh($))
    return next(e)
  })

  // The progress tool itself. This is the one tool call the mod answers rather than hands on: it is the mod's own.
  on('tool.call', { tool: 'mcp__progress-eta__progress' }, ($, e) => serveProgress($, e))

  // Every other tool call is counted and handed on untouched.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (registeredName !== undefined && registeredName !== FULL_TOOL_NAME && tool === registeredName) return serveProgress($, e)

    const agentId = typeof e.agentId === 'string' ? e.agentId : undefined
    let startedAt = 0
    const before = guard($, 'tool start', async () => {
      startedAt = await $.clock.now()
      if (tool === 'Workflow') rememberWorkflowName(e.tool_use_id, workflowNameOf(e))
      const ev: Stashable = { type: 'tool-start', tool, now: startedAt }
      if (agentId !== undefined) ev.agentId = agentId
      await dispatchLoop($, agentId, ev)
    })
    const finish = async (ran: ToolCallResult | undefined): Promise<void> => {
      await before
      await guard($, 'tool end', async () => {
        const now = await $.clock.now()
        const ev: Stashable = { type: 'tool-end', now }
        if (agentId !== undefined) ev.agentId = agentId
        await dispatchLoop($, agentId, ev)
        // If the clock could not be read before the call, the call counts from the moment it ended.
        if (ran !== undefined) await afterTool($, e, ran, startedAt > 0 ? startedAt : now, now)
      })
    }

    let ran: ToolCallResult
    try {
      ran = await next(e)
    } catch (error) {
      await finish(undefined)
      throw error
    }
    await finish(ran)
    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    // Before the spawn: only read the clock and decide on the note. Nothing here can stop the agent starting.
    let startedAt = 0
    let isTracked = false
    let outgoing = e
    try {
      if (e.isTeammate !== true) {
        startedAt = await $.clock.now()
        isTracked = true
        // A resumed run already carries the note from its first prompt; a prompt that mentions the tool needs no second one.
        if (e.resume === undefined && !e.prompt.includes(FULL_TOOL_NAME)) outgoing = { ...e, prompt: `${e.prompt}${AGENT_NOTE}` }
      }
    } catch {
      isTracked = false
      outgoing = e
    }

    const started = await next(outgoing)

    // After it: make the row, with the id the spawn answered, and apply whatever the agent did meanwhile.
    if (isTracked) {
      await guard($, 'track agent', async () => {
        if (started.deny !== undefined || started.agentId === undefined) return
        const agentId = started.agentId
        const workflow = e.workflow
        const row: ProgressRow = {
          id: crypto.randomUUID(),
          kind: 'agent',
          label: cleanLabel(e.description !== '' ? e.description : e.subagentType),
          key: agentKey(e.subagentType, e.description),
          startedAt,
          lastActivityAt: startedAt,
          toolCalls: 0,
          inFlight: 0,
          agentId,
          isBackground: e.background || workflow !== undefined,
        }
        if (e.parentAgentId !== undefined) row.parentId = e.parentAgentId
        if (workflow !== undefined) {
          row.groupId = workflowRowId(workflow.runId, undefined)
          await dispatch($, {
            type: 'workflow-ensure',
            rowId: row.groupId,
            runId: workflow.runId,
            label: workflowNames.get(e.tool_use_id) ?? 'workflow',
            now: startedAt,
          })
        }
        await dispatch($, { type: 'add', row })
        bindCount++
        await drain($, agentId)
      })
    }
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await guard($, 'main reply start', async () => {
        const now = await $.clock.now()
        const row: ProgressRow = {
          id: `main:${e.turnId}`,
          kind: 'main',
          label: 'Main reply',
          key: 'main',
          startedAt: now,
          lastActivityAt: now,
          toolCalls: 0,
          inFlight: 0,
          turnId: e.turnId,
        }
        await dispatch($, { type: 'add', row })
      })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await guard($, 'turn end', async () => {
      const now = await $.clock.now()
      const outcome = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      if (e.agentId === undefined) {
        await dispatchLoop($, undefined, { type: 'finish', match: { by: 'main' }, outcome, now })
        return
      }
      await dispatchLoop($, e.agentId, { type: 'finish', match: { by: 'agent', agentId: e.agentId }, outcome, now })
    })
    return next(e)
  })

  // A background command, workflow or agent reported finished: the engine delivers a task notification.
  on('prompt.submit', { origin: { kind: 'task-notification' } }, async ($, e, next) => {
    await guard($, 'notification', () => noteNotifications($, e.text))
    return next(e)
  })

  on('session.append', { origin: { kind: 'task-notification' } }, async ($, e, next) => {
    await guard($, 'notification row', () => noteNotifications($, textOfBlocks(e.message.content)))
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    try {
      if (e.traits.includes('bare')) return composed
      return { sections: [...composed.sections, { id: 'progress-eta:reporting', text: MAIN_NOTE, scope: 'session' as const }] }
    } catch {
      return composed
    }
  })

  on('command.run', { command: 'progress' }, async $ => {
    let isPlaced = false
    let reason = ''
    try {
      const opened = await $.ui.open({ id: PANE_ID, title: 'Progress' })
      isPlaced = opened.isPlaced
      if (!opened.isPlaced) reason = opened.reason
    } catch (error) {
      reason = error instanceof Error ? error.name : 'error'
    }
    // Asked for by hand: the pane is not forced open again later.
    await guard($, 'mark opened', () => update($, trackerAtom, current => (current.autoOpened ? current : { ...current, autoOpened: true })))
    if (isPlaced) return { text: 'Progress panel opened.' }
    await guard($, 'tick', () => tick($))
    const state = await read($, trackerAtom)
    const history = await read($, historyAtom)
    const note = reason === '' ? '' : `\n(The panel could not be placed here: ${reason}.)`
    return { text: `${summaryText(state, history)}${note}` }
  })

  on('ui.render', { component: 'Pane', requestId: 'progress-eta' }, async ($, e, next) => {
    try {
      const state = await read($, trackerAtom)
      const history = await read($, historyAtom)
      return paneTree($.ui.resolve(e), buildPane(state, history, e.props.bodyColumns))
    } catch {
      return next(e)
    }
  })

  // /clear starts a new conversation: rows from the old one cannot be followed any more.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await guard($, 'reset', async () => {
        await dispatch($, { type: 'reset', now: await $.clock.now() })
        orphans.clear()
      })
    }
    return next(e)
  })
}
