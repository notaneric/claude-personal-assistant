// Plain text helpers for the pane and the status line.
// House rules: no emoji, no em dashes. Short words, units spelled the same way everywhere.

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Exact, to the second under an hour: "45 s", "1 min 20 s", "1 h 5 min". */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** A rounded time left: "about 14 min", "under 1 min", "about 1 h 30 min". */
export function fmtApprox(ms: number): string {
  if (ms < 60_000) return 'under 1 min'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `about ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `about ${hours} h` : `about ${hours} h ${rest} min`
}

/** A typical run length: "40 s", "3 min", "1 h 5 min". */
export function fmtTypical(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** How long ago: "just now", "12 s ago", "3 min ago". */
export function fmtAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 1) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  return `${Math.floor(seconds / 60)} min ago`
}

/** A text bar, filled in proportion to step / total. */
export function bar(step: number, total: number, width: number): string {
  const cells = Math.max(4, Math.floor(width))
  const share = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0
  const filled = Math.round(share * cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

/** One line of display text: control characters and runs of space collapsed, cut to `max` characters. */
export function cleanLabel(text: string, max = 70): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  if (chars.length <= max) return flat
  return `${chars.slice(0, Math.max(1, max - 3)).join('')}...`
}

/** The tool name as a person would say it: the last part of an mcp__server__tool name. */
export function shortTool(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.split('__')
  return parts[parts.length - 1] || name
}
