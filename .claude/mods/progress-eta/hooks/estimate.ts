// The estimate: how long a running piece of work has left.
// Pure functions of a row, the clock and the history. No engine calls.
import type { ProgressHistoryEntry, ProgressRow } from '../types'

/** Finished runs of the same kind and key needed before history is trusted. */
export const MIN_SAMPLES = 3

/** Silence longer than this reads as a possible stall. */
export const QUIET_AFTER_MS = 5 * 60_000

export type Estimate =
  /** From reported steps: pace so far times the steps left. */
  | { kind: 'pace'; leftMs: number }
  /** From earlier runs: their median, minus the time already spent. */
  | { kind: 'typical'; leftMs: number; typicalMs: number; samples: number }
  /** Past the median of earlier runs. */
  | { kind: 'over'; typicalMs: number; samples: number }
  | { kind: 'none' }

/** Time the row has run, or ran for if it ended. */
export function elapsedOf(row: ProgressRow, now: number): number {
  return Math.max(0, (row.endedAt ?? now) - row.startedAt)
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[mid - 1] ?? upper
  return (lower + upper) / 2
}

/**
 * Time left, in order of trust:
 *  (a) steps reported with step >= 1: pace = elapsed / step, left = pace x (total - step);
 *  (b) the median of at least MIN_SAMPLES finished runs of the same kind and key, minus elapsed;
 *  (c) nothing to go on.
 */
export function estimate(row: ProgressRow, now: number, history: readonly ProgressHistoryEntry[]): Estimate {
  const elapsed = elapsedOf(row, now)

  if (row.step !== undefined && row.total !== undefined && row.step >= 1) {
    const pace = elapsed / row.step
    return { kind: 'pace', leftMs: Math.max(0, pace * (row.total - row.step)) }
  }

  const samples: number[] = []
  for (const entry of history) {
    if (entry.kind === row.kind && entry.key === row.key) samples.push(entry.durationMs)
  }
  if (samples.length >= MIN_SAMPLES) {
    const typicalMs = median(samples)
    if (elapsed > typicalMs) return { kind: 'over', typicalMs, samples: samples.length }
    return { kind: 'typical', leftMs: typicalMs - elapsed, typicalMs, samples: samples.length }
  }

  return { kind: 'none' }
}

/** Milliseconds since the row last did anything. */
export function quietMs(row: ProgressRow, now: number): number {
  return Math.max(0, now - row.lastActivityAt)
}

/** True once the silence is past five minutes. */
export function isQuiet(row: ProgressRow, now: number): boolean {
  return row.endedAt === undefined && quietMs(row, now) > QUIET_AFTER_MS
}

// History keys. Free text from a task description or a workflow name never reaches
// $.store: only a short hash of its normalized words does.

function cyrb53(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function hashKey(text: string): string {
  return cyrb53(text).toString(36)
}

const FILLER = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'and', 'in', 'on', 'with', 'from', 'all', 'any', 'my', 'this', 'that'])

/** The words of a description that identify the job: lowercase, no filler, unique, sorted, at most eight. */
export function wordsOf(text: string): string[] {
  const found = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const words = new Set<string>()
  for (const word of found) {
    if (word.length >= 2 && !FILLER.has(word)) words.add(word)
  }
  return [...words].sort().slice(0, 8)
}

/** History key of an agent: its type plus the words of its description. */
export function agentKey(subagentType: string, description: string): string {
  return hashKey(`${subagentType.toLowerCase()}|${wordsOf(description).join(' ')}`)
}

/** History key of a workflow: its name. */
export function nameKey(name: string): string {
  return hashKey(`name|${wordsOf(name).join(' ')}`)
}

/** A segment that starts with one of these only sets the scene; the real program comes later. */
const SCENE_SETTERS = new Set(['cd', 'pushd', 'popd', 'export', 'set', 'source', '.', 'unset', 'alias'])

/** Words that sit in front of the program they launch. */
const LAUNCHERS = new Set(['sudo', 'time', 'env', '&', 'call', 'exec', 'nohup'])

/** The program a shell command runs: the first real command, skipping cd, exports and env assignments. */
export function programOf(command: string): string {
  for (const segment of command.split(/&&|\|\||;|\n|\|/)) {
    const tokens = segment.trim().split(/\s+/).filter(token => token !== '')
    let at = 0
    while (at < tokens.length) {
      const token = tokens[at] ?? ''
      if (!LAUNCHERS.has(token.toLowerCase()) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) break
      at++
    }
    const first = tokens[at]
    if (first === undefined || SCENE_SETTERS.has(first.toLowerCase())) continue
    const bare = first.replace(/^["'(]+|["')]+$/g, '')
    const base = bare.split(/[\\/]/).pop() ?? bare
    const name = base.replace(/\.(exe|cmd|bat|ps1|sh)$/i, '').toLowerCase()
    if (name !== '') return name
  }
  return 'command'
}

/** History key of a background command: the program it runs. */
export function programKey(command: string): string {
  return hashKey(`program|${programOf(command)}`)
}
