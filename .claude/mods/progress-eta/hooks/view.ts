// What the pane and the status line say. Pure functions of the tracker, the history and the clock
// the tracker last read; nothing here talks to the engine.
import type { ProgressHistoryEntry, ProgressRow, ProgressTracker } from '../types'
import { elapsedOf, estimate, isQuiet, quietMs } from './estimate'
import type { Estimate } from './estimate'
import { bar, cleanLabel, fmtAgo, fmtApprox, fmtDuration, fmtTypical, plural, shortTool } from './format'
import { isShown, KEEP_FINISHED_MS } from './tracker'

export type Tone = 'normal' | 'dim' | 'warning' | 'error'

export type RowView = {
  id: string
  indent: boolean
  isFinished: boolean
  title: string
  tag: string
  facts: string
  factsTone: Tone
  activity: string | null
  activityTone: Tone
  /** "3 of 8" with a text bar, once the work has reported its steps. */
  bar: string | null
  stepLabel: string | null
  /** Time left, or empty for a finished row. */
  left: string
  leftTone: Tone
}

export type PaneView = {
  /** The status line's words, or empty when nothing runs. */
  header: string
  isEmpty: boolean
  rows: RowView[]
}

function isRunning(row: ProgressRow): boolean {
  return row.endedAt === undefined
}

function isVisible(row: ProgressRow, now: number): boolean {
  if (!isShown(row, now)) return false
  return row.endedAt === undefined || now - row.endedAt < KEEP_FINISHED_MS
}

function tagOf(row: ProgressRow): string {
  switch (row.kind) {
    case 'main':
      return ''
    case 'agent':
      return row.isBackground === true ? 'background agent' : 'agent'
    case 'workflow':
      return 'workflow'
    case 'shell':
      return 'background command'
  }
}

/** The words for an estimate. A finished row says nothing about time left. */
export function leftOf(guess: Estimate): { text: string; tone: Tone } {
  switch (guess.kind) {
    case 'pace':
      return { text: `${fmtApprox(guess.leftMs)} left`, tone: 'normal' }
    case 'typical':
      return { text: `${fmtApprox(guess.leftMs)} left (typical)`, tone: 'normal' }
    case 'over':
      return { text: `running longer than usual (typical ${fmtTypical(guess.typicalMs)})`, tone: 'warning' }
    case 'none':
      return { text: 'no estimate yet', tone: 'dim' }
  }
}

/** How long since the row last did anything; "quiet for N min" once that passes five minutes. */
export function activityOf(row: ProgressRow, now: number): { text: string | null; tone: Tone } {
  if (row.kind === 'shell') return { text: null, tone: 'normal' }
  const silence = quietMs(row, now)
  if (isQuiet(row, now)) {
    const minutes = Math.floor(silence / 60_000)
    const tool = row.lastTool === undefined ? '' : shortTool(row.lastTool)
    let tail = ''
    if (tool !== '') tail = row.inFlight > 0 ? `, ${tool} still running` : `, last tool ${tool}`
    return { text: `quiet for ${minutes} min${tail}`, tone: 'warning' }
  }
  if (row.kind === 'workflow') return { text: `last activity ${fmtAgo(silence)}`, tone: 'normal' }
  if (row.lastTool === undefined) return { text: 'no tool calls yet', tone: 'normal' }
  return { text: `last tool ${shortTool(row.lastTool)}, ${fmtAgo(silence)}`, tone: 'normal' }
}

function factsOf(row: ProgressRow, now: number): { text: string; tone: Tone } {
  const elapsed = fmtDuration(elapsedOf(row, now))
  if (row.endedAt !== undefined) {
    const verb = row.outcome === 'failed' ? 'failed after' : row.outcome === 'stopped' ? 'stopped after' : 'done in'
    let text = `${verb} ${elapsed}`
    if ((row.kind === 'main' || row.kind === 'agent') && row.toolCalls > 0) text += `, ${plural(row.toolCalls, 'tool call')}`
    if (row.kind === 'workflow') text += `, ${row.agentsDone ?? 0} of ${row.agentsStarted ?? 0} agents`
    return { text, tone: row.outcome === 'failed' ? 'error' : 'dim' }
  }
  switch (row.kind) {
    case 'workflow':
      return { text: `${elapsed}, ${row.agentsDone ?? 0} of ${row.agentsStarted ?? 0} agents done`, tone: 'normal' }
    case 'shell':
      return { text: `${elapsed}, running in the background`, tone: 'normal' }
    default:
      return { text: `${elapsed}, ${plural(row.toolCalls, 'tool call')}`, tone: 'normal' }
  }
}

export function rowView(row: ProgressRow, now: number, history: readonly ProgressHistoryEntry[], barWidth: number, indent: boolean): RowView {
  const finished = !isRunning(row)
  const facts = factsOf(row, now)
  const hasSteps = !finished && row.step !== undefined && row.total !== undefined
  const activity = finished ? { text: null, tone: 'normal' as Tone } : activityOf(row, now)
  const left = finished ? { text: '', tone: 'normal' as Tone } : leftOf(estimate(row, now, history))
  return {
    id: row.id,
    indent,
    isFinished: finished,
    title: cleanLabel(row.label),
    tag: tagOf(row),
    facts: facts.text,
    factsTone: facts.tone,
    activity: activity.text,
    activityTone: activity.tone,
    bar: hasSteps ? `${bar(row.step ?? 0, row.total ?? 1, barWidth)} ${row.step ?? 0} of ${row.total ?? 1}` : null,
    stepLabel: hasSteps && row.stepLabel !== undefined ? row.stepLabel : null,
    left: left.text,
    leftTone: left.tone,
  }
}

/**
 * "2 running, about 14 min left": the count of running tasks (a workflow counts once)
 * and the longest estimate among them. Undefined when nothing runs, so the line clears.
 */
export function statusText(state: ProgressTracker, history: readonly ProgressHistoryEntry[]): string | undefined {
  const running = state.rows.filter(row => isRunning(row) && isShown(row, state.now))
  const tasks = running.filter(row => row.groupId === undefined)
  if (tasks.length === 0) return undefined
  const guesses = running.map(row => estimate(row, state.now, history))
  const lefts: number[] = []
  for (const guess of guesses) {
    if (guess.kind === 'pace' || guess.kind === 'typical') lefts.push(guess.leftMs)
  }
  const head = `${tasks.length} running`
  if (lefts.length > 0) return `${head}, ${fmtApprox(Math.max(...lefts))} left`
  if (guesses.some(guess => guess.kind === 'over')) return `${head}, running longer than usual`
  return `${head}, no estimate yet`
}

function order(a: ProgressRow, b: ProgressRow): number {
  const aRunning = isRunning(a)
  const bRunning = isRunning(b)
  if (aRunning !== bRunning) return aRunning ? -1 : 1
  if (aRunning) return a.startedAt - b.startedAt
  return (b.endedAt ?? 0) - (a.endedAt ?? 0)
}

/** Rows in display order: running first, each workflow followed by its own agents. */
function listRows(state: ProgressTracker): { row: ProgressRow; indent: boolean }[] {
  const visible = state.rows.filter(row => isVisible(row, state.now))
  const listed: { row: ProgressRow; indent: boolean }[] = []
  for (const row of visible.filter(item => item.groupId === undefined).sort(order)) {
    listed.push({ row, indent: false })
    if (row.kind !== 'workflow') continue
    for (const child of visible.filter(item => item.groupId === row.id).sort(order)) listed.push({ row: child, indent: true })
  }
  return listed
}

export function buildPane(state: ProgressTracker, history: readonly ProgressHistoryEntry[], bodyColumns: number): PaneView {
  const listed = listRows(state)
  const width = Math.max(6, Math.min(20, bodyColumns - 12))
  const rows = listed.map(item => rowView(item.row, state.now, history, width, item.indent))
  return {
    header: statusText(state, history) ?? (rows.length > 0 ? 'Nothing running' : ''),
    isEmpty: rows.length === 0,
    rows,
  }
}

/** The pane's content as plain lines, for /progress where no pane can be drawn. */
export function summaryText(state: ProgressTracker, history: readonly ProgressHistoryEntry[]): string {
  const listed = listRows(state)
  if (listed.length === 0) return 'Nothing is running.'
  const lines = [statusText(state, history) ?? 'Nothing running']
  for (const item of listed.slice(0, 12)) {
    const view = rowView(item.row, state.now, history, 10, item.indent)
    const parts = [view.facts]
    if (view.activity !== null) parts.push(view.activity)
    if (view.left !== '') parts.push(view.left)
    const tag = view.tag === '' ? '' : ` (${view.tag})`
    lines.push(`${item.indent ? '    ' : '  '}${view.title}${tag}: ${parts.join(', ')}`)
  }
  return lines.join('\n')
}
