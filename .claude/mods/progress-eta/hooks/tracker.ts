// The tracker: a pure reducer over the rows the mod follows.
// Every change to what is running goes through step(). No engine calls here, so
// the same code runs in a session and in a test.
import type { ProgressHistoryEntry, ProgressOutcome, ProgressRow, ProgressTracker } from '../types'
import { nameKey } from './estimate'

/** Finished rows stay on the pane this long, dimmed. */
export const KEEP_FINISHED_MS = 10 * 60_000

/** A main reply counts as worth showing after this long, or at its first tool call. */
export const MAIN_SHOW_AFTER_MS = 10_000

/** Newest history entries kept in $.store. */
export const HISTORY_CAP = 300

export const EMPTY_TRACKER: ProgressTracker = { rows: [], now: 0, autoOpened: false }

/** Which running row an event is about. */
export type Match =
  | { by: 'agent'; agentId: string }
  | { by: 'main' }
  /** A background task id: a shell or workflow row's taskId, or an agent's id. */
  | { by: 'task'; taskId: string }
  | { by: 'row'; rowId: string }

export type TrackerEvent =
  | { type: 'add'; row: ProgressRow }
  | { type: 'tool-start'; agentId?: string; tool: string; now: number }
  | { type: 'tool-end'; agentId?: string; now: number }
  | { type: 'progress'; agentId?: string; step: number; total: number; label?: string; now: number }
  | { type: 'workflow-ensure'; rowId: string; runId?: string; taskId?: string; label?: string; now: number }
  | { type: 'finish'; match: Match; outcome: ProgressOutcome; now: number }
  | { type: 'tick'; now: number }
  | { type: 'reset'; now: number }
  | { type: 'opened'; value: boolean }

export type StepResult = {
  state: ProgressTracker
  /** False when the event named something the tracker does not hold (an unknown agent, a missing row). */
  applied: boolean
  /** True when the status line or the list of rows may read differently afterwards. */
  isStructural: boolean
  /** Finished runs to remember in the history. */
  record: ProgressHistoryEntry[]
}

const PLACEHOLDER_WORKFLOW = 'workflow'

function noop(state: ProgressTracker): StepResult {
  return { state, applied: false, isStructural: false, record: [] }
}

function done(state: ProgressTracker, rows: ProgressRow[], now: number, isStructural: boolean, record: ProgressHistoryEntry[] = []): StepResult {
  return { state: { ...state, rows, now: Math.max(state.now, now) }, applied: true, isStructural, record }
}

function matches(row: ProgressRow, match: Match): boolean {
  switch (match.by) {
    case 'agent':
      return row.kind === 'agent' && row.agentId === match.agentId
    case 'main':
      return row.kind === 'main'
    case 'task':
      return row.taskId === match.taskId || (row.kind === 'agent' && row.agentId === match.taskId)
    case 'row':
      return row.id === match.rowId
  }
}

/** Index of the running row for a loop: the main reply when agentId is absent, else the agent bound to it. */
function loopIndex(rows: readonly ProgressRow[], agentId: string | undefined): number {
  if (agentId === undefined) return rows.findIndex(row => row.kind === 'main' && row.endedAt === undefined)
  return rows.findIndex(row => row.kind === 'agent' && row.agentId === agentId && row.endedAt === undefined)
}

/** A main reply is worth keeping once it used a tool, reported steps, or ran past the show-after time. */
export function isSignificantMain(row: ProgressRow, at: number): boolean {
  return row.toolCalls > 0 || row.step !== undefined || at - row.startedAt >= MAIN_SHOW_AFTER_MS
}

/** Whether a row belongs on the pane and in the count of running work. */
export function isShown(row: ProgressRow, now: number): boolean {
  if (row.kind !== 'main' || row.endedAt !== undefined) return true
  return isSignificantMain(row, now)
}

function endRow(row: ProgressRow, at: number, outcome: ProgressOutcome): ProgressRow {
  return { ...row, endedAt: at, outcome, inFlight: 0 }
}

/**
 * Marks activity on a row, on the workflow it belongs to, and up the chain of
 * spawners that are waiting on it (a foreground agent keeps its parent busy).
 */
function touch(rows: ProgressRow[], id: string, now: number): ProgressRow[] {
  const ids = new Set<string>()
  let current: ProgressRow | undefined = rows.find(row => row.id === id)
  for (let depth = 0; current !== undefined && depth < 8; depth++) {
    const here: ProgressRow = current
    ids.add(here.id)
    if (here.groupId !== undefined) ids.add(here.groupId)
    if (here.isBackground === true || here.kind === 'main') break
    current =
      here.parentId !== undefined
        ? rows.find(row => row.kind === 'agent' && row.agentId === here.parentId && row.endedAt === undefined)
        : rows.find(row => row.kind === 'main' && row.endedAt === undefined)
  }
  return rows.map(row => (ids.has(row.id) && row.endedAt === undefined ? { ...row, lastActivityAt: Math.max(row.lastActivityAt, now) } : row))
}

/** Whether a finished row earns a place in the history: it ended on its own, not cut short. */
function isRecordable(row: ProgressRow): boolean {
  if (row.outcome === 'done') return true
  return row.outcome === 'failed' && (row.kind === 'shell' || row.kind === 'workflow')
}

function entryOf(row: ProgressRow): ProgressHistoryEntry {
  return {
    kind: row.kind,
    key: row.key,
    durationMs: Math.max(0, Math.round((row.endedAt ?? row.startedAt) - row.startedAt)),
    toolCalls: row.toolCalls,
    totalSteps: row.total ?? 0,
  }
}

function add(state: ProgressTracker, row: ProgressRow): StepResult {
  if (state.rows.some(existing => existing.id === row.id)) return noop(state)
  let rows = state.rows
  if (row.kind === 'main') {
    // A new reply starts: whatever reply was still open is over.
    rows = rows.flatMap(old => {
      if (old.kind !== 'main' || old.endedAt !== undefined) return [old]
      return isSignificantMain(old, row.startedAt) ? [endRow(old, row.startedAt, 'stopped')] : []
    })
  }
  rows = [...rows, row]
  if (row.groupId !== undefined) {
    rows = rows.map(old => (old.id === row.groupId ? { ...old, agentsStarted: (old.agentsStarted ?? 0) + 1 } : old))
  }
  return done(state, touch(rows, row.id, row.startedAt), row.startedAt, true)
}

function toolStart(state: ProgressTracker, ev: Extract<TrackerEvent, { type: 'tool-start' }>): StepResult {
  const at = loopIndex(state.rows, ev.agentId)
  if (at < 0) return noop(state)
  const row = state.rows[at]
  if (row === undefined) return noop(state)
  const isFirstOfMain = row.kind === 'main' && row.toolCalls === 0
  const updated: ProgressRow = { ...row, toolCalls: row.toolCalls + 1, inFlight: row.inFlight + 1, lastTool: ev.tool, lastActivityAt: Math.max(row.lastActivityAt, ev.now) }
  const rows = touch(
    state.rows.map((old, index) => (index === at ? updated : old)),
    row.id,
    ev.now,
  )
  return done(state, rows, ev.now, isFirstOfMain)
}

function toolEnd(state: ProgressTracker, ev: Extract<TrackerEvent, { type: 'tool-end' }>): StepResult {
  const at = loopIndex(state.rows, ev.agentId)
  if (at < 0) return noop(state)
  const row = state.rows[at]
  if (row === undefined) return noop(state)
  const updated: ProgressRow = { ...row, inFlight: Math.max(0, row.inFlight - 1), lastActivityAt: Math.max(row.lastActivityAt, ev.now) }
  const rows = touch(
    state.rows.map((old, index) => (index === at ? updated : old)),
    row.id,
    ev.now,
  )
  return done(state, rows, ev.now, false)
}

function progress(state: ProgressTracker, ev: Extract<TrackerEvent, { type: 'progress' }>): StepResult {
  const at = loopIndex(state.rows, ev.agentId)
  if (at < 0) return noop(state)
  const row = state.rows[at]
  if (row === undefined) return noop(state)
  const step = Math.max(0, Math.floor(ev.step))
  const total = Math.max(1, Math.floor(ev.total), step)
  const { stepLabel: _previousLabel, ...rest } = row
  const updated: ProgressRow = { ...rest, step, total, lastActivityAt: Math.max(row.lastActivityAt, ev.now) }
  if (ev.label !== undefined && ev.label !== '') updated.stepLabel = ev.label
  const rows = touch(
    state.rows.map((old, index) => (index === at ? updated : old)),
    row.id,
    ev.now,
  )
  return done(state, rows, ev.now, true)
}

function workflowEnsure(state: ProgressTracker, ev: Extract<TrackerEvent, { type: 'workflow-ensure' }>): StepResult {
  const existing = state.rows.find(row => row.id === ev.rowId)
  const label = ev.label !== undefined && ev.label !== '' ? ev.label : undefined
  const isNamed = label !== undefined && label !== PLACEHOLDER_WORKFLOW

  if (existing !== undefined && existing.endedAt === undefined) {
    // The run is already tracked: take the better label and the task id when they arrive.
    const named = isNamed ? { label: label as string, key: nameKey(label as string) } : {}
    const withTask = ev.taskId !== undefined ? { taskId: ev.taskId } : {}
    const withRun = ev.runId !== undefined ? { runId: ev.runId } : {}
    const rows = state.rows.map(row => (row.id === ev.rowId ? { ...row, ...named, ...withTask, ...withRun } : row))
    return done(state, rows, ev.now, true)
  }

  // A new run, or a resumed run that reuses a finished run's id: start a fresh row and drop the old run's agents.
  const name = label ?? PLACEHOLDER_WORKFLOW
  const fresh: ProgressRow = {
    id: ev.rowId,
    kind: 'workflow',
    label: name,
    key: nameKey(name),
    startedAt: ev.now,
    lastActivityAt: ev.now,
    toolCalls: 0,
    inFlight: 0,
    agentsStarted: 0,
    agentsDone: 0,
    isBackground: true,
  }
  if (ev.runId !== undefined) fresh.runId = ev.runId
  if (ev.taskId !== undefined) fresh.taskId = ev.taskId
  const rows = [...state.rows.filter(row => row.id !== ev.rowId && row.groupId !== ev.rowId), fresh]
  return done(state, rows, ev.now, true)
}

function finish(state: ProgressTracker, ev: Extract<TrackerEvent, { type: 'finish' }>): StepResult {
  const at = state.rows.findIndex(row => row.endedAt === undefined && matches(row, ev.match))
  if (at < 0) return noop(state)
  const row = state.rows[at]
  if (row === undefined) return noop(state)

  const ended = endRow(row, ev.now, ev.outcome)
  const record: ProgressHistoryEntry[] = []
  let rows = state.rows.map((old, index) => (index === at ? ended : old))

  if (row.kind === 'main' && !isSignificantMain(ended, ev.now)) {
    // A reply that answered at once leaves no row and no history.
    rows = rows.filter(old => old.id !== row.id)
  } else if (isRecordable(ended)) {
    record.push(entryOf(ended))
  }

  if (row.kind === 'workflow') {
    // The run is over, so any agent still marked running ended with it.
    const childOutcome: ProgressOutcome = ev.outcome === 'done' ? 'done' : 'stopped'
    rows = rows.map(old => {
      if (old.id === row.id) return { ...old, agentsDone: old.agentsStarted ?? 0 }
      return old.groupId === row.id && old.endedAt === undefined ? endRow(old, ev.now, childOutcome) : old
    })
  }
  if (row.groupId !== undefined) {
    rows = rows.map(old => (old.id === row.groupId ? { ...old, agentsDone: (old.agentsDone ?? 0) + 1 } : old))
  }

  // A background command that is killed with its caller's final response ends here too.
  const loop = row.kind === 'main' ? 'main' : row.agentId
  if (loop !== undefined) {
    rows = rows.map(old => (old.kind === 'shell' && old.endedAt === undefined && old.endsWith === loop ? endRow(old, ev.now, 'stopped') : old))
  }

  return done(state, rows, ev.now, true, record)
}

function tick(state: ProgressTracker, now: number): StepResult {
  const rows = state.rows.filter(row => row.endedAt === undefined || now - row.endedAt < KEEP_FINISHED_MS)
  return done(state, rows, now, true)
}

/** Applies one event. Pure: returns the next state and what to remember; never mutates its input. */
export function step(state: ProgressTracker, ev: TrackerEvent): StepResult {
  switch (ev.type) {
    case 'add':
      return add(state, ev.row)
    case 'tool-start':
      return toolStart(state, ev)
    case 'tool-end':
      return toolEnd(state, ev)
    case 'progress':
      return progress(state, ev)
    case 'workflow-ensure':
      return workflowEnsure(state, ev)
    case 'finish':
      return finish(state, ev)
    case 'tick':
      return tick(state, ev.now)
    case 'reset':
      return { state: { ...state, rows: [], now: Math.max(state.now, ev.now) }, applied: true, isStructural: true, record: [] }
    case 'opened':
      return { state: { ...state, autoOpened: ev.value }, applied: true, isStructural: false, record: [] }
  }
}

/** Appends an entry and keeps only the newest HISTORY_CAP. */
export function appendHistory(history: readonly ProgressHistoryEntry[], entry: ProgressHistoryEntry): ProgressHistoryEntry[] {
  return [...history, entry].slice(-HISTORY_CAP)
}

/** Keeps only well-formed entries from whatever $.store held, newest HISTORY_CAP. */
export function cleanHistory(stored: unknown): ProgressHistoryEntry[] {
  if (!Array.isArray(stored)) return []
  const kinds = new Set(['agent', 'workflow', 'shell', 'main'])
  const kept: ProgressHistoryEntry[] = []
  for (const item of stored as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    if (typeof entry.kind !== 'string' || !kinds.has(entry.kind)) continue
    if (typeof entry.key !== 'string') continue
    if (typeof entry.durationMs !== 'number' || !Number.isFinite(entry.durationMs) || entry.durationMs < 0) continue
    kept.push({
      kind: entry.kind as ProgressHistoryEntry['kind'],
      key: entry.key,
      durationMs: entry.durationMs,
      toolCalls: typeof entry.toolCalls === 'number' && Number.isFinite(entry.toolCalls) ? entry.toolCalls : 0,
      totalSteps: typeof entry.totalSteps === 'number' && Number.isFinite(entry.totalSteps) ? entry.totalSteps : 0,
    })
  }
  return kept.slice(-HISTORY_CAP)
}
