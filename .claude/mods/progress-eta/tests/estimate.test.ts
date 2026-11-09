// The estimate and its words. Pure functions: no engine, no clock, so every number below is exact.
import { expect, test } from 'claude-code/testing'

import { estimate, isQuiet, median, programOf, QUIET_AFTER_MS, wordsOf } from '../hooks/estimate'
import { fmtApprox, fmtDuration } from '../hooks/format'
import { parseProgressArgs, parseTaskNotifications } from '../hooks/inputs'
import { appendHistory, cleanHistory, HISTORY_CAP } from '../hooks/tracker'
import { activityOf, leftOf } from '../hooks/view'
import type { ProgressHistoryEntry, ProgressRow } from '../types'

const MINUTE = 60_000

function row(extra: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 'r1',
    kind: 'agent',
    label: 'Explore auth code',
    key: 'k-explore',
    startedAt: 0,
    lastActivityAt: 0,
    toolCalls: 0,
    inFlight: 0,
    ...extra,
  }
}

function runs(kind: ProgressHistoryEntry['kind'], key: string, minutes: number[]): ProgressHistoryEntry[] {
  return minutes.map(m => ({ kind, key, durationMs: m * MINUTE, toolCalls: 3, totalSteps: 0 }))
}

test('pace: 2 steps of 10 done in 60 s leaves 240 s', () => {
  // pace = elapsed / step = 30 s per step; left = pace x (total - step) = 30 s x 8
  const guess = estimate(row({ step: 2, total: 10 }), 60_000, [])
  expect(guess).toEqual({ kind: 'pace', leftMs: 240_000 })
  expect(leftOf(guess).text).toBe('about 4 min left')
})

test('pace: the estimate grows while no new step is reported', () => {
  const early = estimate(row({ step: 1, total: 4 }), 30_000, [])
  const late = estimate(row({ step: 1, total: 4 }), 90_000, [])
  expect(early).toEqual({ kind: 'pace', leftMs: 90_000 })
  expect(late).toEqual({ kind: 'pace', leftMs: 270_000 })
})

test('pace: all steps done leaves nothing, and step 0 is not a pace', () => {
  expect(estimate(row({ step: 5, total: 5 }), 100_000, [])).toEqual({ kind: 'pace', leftMs: 0 })
  expect(estimate(row({ step: 0, total: 5 }), 100_000, [])).toEqual({ kind: 'none' })
})

test('pace beats history when both exist', () => {
  const history = runs('agent', 'k-explore', [1, 1, 1])
  expect(estimate(row({ step: 1, total: 2 }), 30_000, history).kind).toBe('pace')
})

test('history: three finished runs give the median minus elapsed, labelled typical', () => {
  const history = runs('agent', 'k-explore', [2, 3, 4])
  const guess = estimate(row(), MINUTE, history)
  expect(guess).toEqual({ kind: 'typical', leftMs: 2 * MINUTE, typicalMs: 3 * MINUTE, samples: 3 })
  expect(leftOf(guess).text).toBe('about 2 min left (typical)')
})

test('history: two runs are not enough, no estimate', () => {
  const history = runs('agent', 'k-explore', [2, 3])
  expect(estimate(row(), MINUTE, history)).toEqual({ kind: 'none' })
  expect(leftOf(estimate(row(), MINUTE, history)).text).toBe('no estimate yet')
})

test('history: only runs of the same kind and key count', () => {
  const history = [...runs('agent', 'k-other', [2, 3, 4]), ...runs('shell', 'k-explore', [2, 3, 4]), ...runs('agent', 'k-explore', [2, 3])]
  expect(estimate(row(), MINUTE, history)).toEqual({ kind: 'none' })
})

test('history: past the median it says running longer than usual', () => {
  const history = runs('agent', 'k-explore', [2, 3, 4])
  const guess = estimate(row(), 4 * MINUTE, history)
  expect(guess).toEqual({ kind: 'over', typicalMs: 3 * MINUTE, samples: 3 })
  expect(leftOf(guess).text).toBe('running longer than usual (typical 3 min)')
})

test('median of an even count is the mean of the middle two', () => {
  expect(median([400, 100, 300, 200])).toBe(250)
  expect(median([5])).toBe(5)
})

test('stall: quiet only once the silence is past five minutes', () => {
  const idle = row({ lastTool: 'Bash' })
  expect(QUIET_AFTER_MS).toBe(5 * MINUTE)
  expect(isQuiet(idle, 5 * MINUTE)).toBe(false)
  expect(isQuiet(idle, 5 * MINUTE + 1000)).toBe(true)
  expect(activityOf(idle, 5 * MINUTE).text).toBe('last tool Bash, 5 min ago')
  expect(activityOf(idle, 5 * MINUTE + 1000)).toEqual({ text: 'quiet for 5 min, last tool Bash', tone: 'warning' })
  expect(activityOf(row({ lastTool: 'Bash', inFlight: 1 }), 7 * MINUTE).text).toBe('quiet for 7 min, Bash still running')
})

test('a finished row is never quiet', () => {
  expect(isQuiet(row({ endedAt: 1000, outcome: 'done' }), 60 * MINUTE)).toBe(false)
})

test('history keeps the newest 300', () => {
  let history: ProgressHistoryEntry[] = []
  for (let i = 0; i < 305; i++) history = appendHistory(history, { kind: 'agent', key: 'k', durationMs: i, toolCalls: 0, totalSteps: 0 })
  expect(history).toHaveLength(HISTORY_CAP)
  expect(history[0]?.durationMs).toBe(5)
  expect(history[299]?.durationMs).toBe(304)
})

test('stored history is cleaned: bad entries dropped, shape kept', () => {
  const stored = [
    { kind: 'agent', key: 'a', durationMs: 5, toolCalls: 1, totalSteps: 2, secret: 'dropped' },
    { kind: 'robot', key: 'a', durationMs: 5 },
    { kind: 'shell', key: 'b', durationMs: -1 },
    'text',
    null,
  ]
  expect(cleanHistory(stored)).toEqual([{ kind: 'agent', key: 'a', durationMs: 5, toolCalls: 1, totalSteps: 2 }])
  expect(cleanHistory('nonsense')).toEqual([])
})

test('time words', () => {
  expect(fmtDuration(45_000)).toBe('45 s')
  expect(fmtDuration(80_000)).toBe('1 min 20 s')
  expect(fmtDuration(3_900_000)).toBe('1 h 5 min')
  expect(fmtApprox(14 * MINUTE)).toBe('about 14 min')
  expect(fmtApprox(30_000)).toBe('under 1 min')
  expect(fmtApprox(90 * MINUTE)).toBe('about 1 h 30 min')
})

test('history keys ignore word order and filler, programs skip cd and exports', () => {
  expect(wordsOf('Fix the auth bug in the API')).toEqual(['api', 'auth', 'bug', 'fix'])
  expect(programOf('cd /work && npm test 2>&1 | tail -20')).toBe('npm')
  expect(programOf('FOO=1 python3 build.py')).toBe('python3')
  expect(programOf('C:\\tools\\Build.exe --fast')).toBe('build')
  expect(programOf('')).toBe('command')
})

test('progress arguments: whole numbers, total at least step and at least 1', () => {
  expect(parseProgressArgs({ step: 2.7, total: 5 })).toEqual({ step: 2, total: 5 })
  expect(parseProgressArgs({ step: 6, total: 4 })).toEqual({ step: 6, total: 6 })
  expect(parseProgressArgs({ step: -1, total: 0 })).toEqual({ step: 0, total: 1 })
  expect(parseProgressArgs({ step: '3', total: '9', label: '  reading  ' })).toEqual({ step: 3, total: 9, label: 'reading' })
  expect(parseProgressArgs({ step: 'x', total: 3 })).toBeUndefined()
  expect(parseProgressArgs({ total: 3 })).toBeUndefined()
})

test('task notifications: id and outcome, several in one delivery, never text alone', () => {
  const one = '<task-notification>\n<task-id>b123</task-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>'
  expect(parseTaskNotifications(one)).toEqual([{ taskId: 'b123', status: 'completed', outcome: 'done' }])
  const two = `${one}\n<task-notification><task-id>w9</task-id><status>killed</status></task-notification>`
  expect(parseTaskNotifications(two).map(n => [n.taskId, n.outcome])).toEqual([
    ['b123', 'done'],
    ['w9', 'stopped'],
  ])
  expect(parseTaskNotifications('<task-notification><task-id>x</task-id><status>failed</status></task-notification>')[0]?.outcome).toBe('failed')
  expect(parseTaskNotifications('Background command finished')).toEqual([])
})

test('task notifications: the envelope in the order the engine writes it, even when the result quotes tags', () => {
  // Synthetic, in the shape seen in real transcripts: id, tool use, output file, status, summary, then note, result, usage.
  const envelope = [
    '<task-notification>',
    '<task-id>a1b2c3</task-id>',
    '<tool-use-id>toolu_01</tool-use-id>',
    '<output-file>/tmp/a1b2c3.output</output-file>',
    '<status>completed</status>',
    '<summary>Agent finished</summary>',
    '<note>kept short</note>',
    '<result>The log said <status>failed</status> and <task-id>zzz</task-id>.</result>',
    '<usage><total_tokens>10</total_tokens></usage>',
    '</task-notification>',
  ].join('\n')
  expect(parseTaskNotifications(envelope)).toEqual([{ taskId: 'a1b2c3', status: 'completed', outcome: 'done', toolUseId: 'toolu_01' }])
  expect(parseTaskNotifications(envelope.replace('completed', 'killed'))[0]?.outcome).toBe('stopped')
})
