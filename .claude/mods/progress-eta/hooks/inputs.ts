// Reading what the engine hands the mod: task notifications, tool inputs, tool results.
// All pure, all tolerant: anything unexpected reads as "nothing found", never as an error.
import type { ProgressOutcome } from '../types'
import { cleanLabel } from './format'

export type TaskNotice = {
  taskId: string
  /** The status word as the notification spelled it. */
  status: string
  outcome: ProgressOutcome
  toolUseId?: string
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function tagText(body: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`).exec(body)
  const text = match?.[1]?.trim()
  return text === undefined || text === '' ? undefined : text
}

/** completed -> done; failed -> failed; killed or stopped -> stopped; any other word -> done. */
export function outcomeOfStatus(status: string | undefined): ProgressOutcome {
  const word = (status ?? '').trim().toLowerCase()
  if (word === 'failed' || word === 'error' || word === 'errored') return 'failed'
  if (word === 'killed' || word === 'stopped' || word === 'cancelled' || word === 'canceled' || word === 'aborted') return 'stopped'
  return 'done'
}

/**
 * The background tasks a notification text reports finished. A notification is
 * `<task-notification><task-id>..</task-id><status>..</status>..</task-notification>`;
 * several can arrive in one delivery. The caller has already checked that the
 * delivery's origin is a task notification: text alone is never trusted.
 */
export function parseTaskNotifications(text: string): TaskNotice[] {
  const notices: TaskNotice[] = []
  const bodies = [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].map(match => match[1] ?? '')
  if (bodies.length === 0 && text.includes('<task-id>')) bodies.push(text)
  for (const body of bodies) {
    const taskId = tagText(body, 'task-id')
    if (taskId === undefined) continue
    const status = tagText(body, 'status') ?? 'completed'
    const notice: TaskNotice = { taskId, status, outcome: outcomeOfStatus(status) }
    const toolUseId = tagText(body, 'tool-use-id')
    if (toolUseId !== undefined) notice.toolUseId = toolUseId
    notices.push(notice)
  }
  return notices
}

/** The task id a finished Bash or PowerShell call handed back when the command went to the background. */
export function backgroundTaskIdOf(result: unknown): string | undefined {
  const record = asRecord(result)
  const id = record?.backgroundTaskId
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** True when the command is killed at its caller's final response, so no notification will follow. */
export function endsWithFinalResponse(result: unknown): boolean {
  return asRecord(result)?.backgroundEndsWithFinalResponse === true
}

/** A workflow's name from a Workflow call's input: `name`, else `meta.name` of the script, else the script file's name. */
export function workflowNameOf(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.name === 'string' && input.name.trim() !== '') return cleanLabel(input.name, 60)
  if (typeof input.script === 'string') {
    const meta = /\bname\s*:\s*(['"`])([^'"`\r\n]{1,80})\1/.exec(input.script.slice(0, 4000))
    if (meta?.[2] !== undefined) return cleanLabel(meta[2], 60)
  }
  if (typeof input.scriptPath === 'string') {
    const base = input.scriptPath.split(/[\\/]/).pop() ?? ''
    const bare = base.replace(/\.[A-Za-z0-9]+$/, '')
    if (bare !== '') return cleanLabel(bare, 60)
  }
  return 'workflow'
}

export type ProgressArgs = { step: number; total: number; label?: string }

/** The progress tool's input, checked: whole numbers, total at least 1 and at least step. */
export function parseProgressArgs(input: Record<string, unknown>): ProgressArgs | undefined {
  const rawStep = typeof input.step === 'string' ? Number(input.step) : input.step
  const rawTotal = typeof input.total === 'string' ? Number(input.total) : input.total
  if (typeof rawStep !== 'number' || typeof rawTotal !== 'number') return undefined
  if (!Number.isFinite(rawStep) || !Number.isFinite(rawTotal)) return undefined
  const step = Math.max(0, Math.floor(rawStep))
  const total = Math.max(1, Math.floor(rawTotal), step)
  const args: ProgressArgs = { step, total }
  if (typeof input.label === 'string' && input.label.trim() !== '') args.label = cleanLabel(input.label, 60)
  return args
}
