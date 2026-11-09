// The pane's tree. Only Box and Text, which every surface carries, so the same
// drawing works on the terminal, the desktop app, VS Code and the phone app.
// Colors are theme keys, so the pane follows the person's theme.
import type { Elements } from 'claude-code'

import type { PaneView, RowView, Tone } from './view'

type Tags = Pick<Elements['vscode'], 'Box' | 'Text'>

/** Style props for a tone. Normal adds none; no prop is ever passed as undefined. */
function toneProps(tone: Tone): { color?: string; dimColor?: boolean } {
  switch (tone) {
    case 'warning':
      return { color: 'warning' }
    case 'error':
      return { color: 'error' }
    case 'dim':
      return { dimColor: true }
    default:
      return {}
  }
}

function rowTree(tags: Tags, row: RowView) {
  const { Box, Text } = tags
  return (
    <Box key={`row:${row.id}`} flexDirection="column" paddingLeft={row.indent ? 2 : 0}>
      <Text>
        <Text weight="bold" dimColor={row.isFinished}>
          {row.title}
        </Text>
        {row.tag !== '' ? <Text dimColor>{`  ${row.tag}`}</Text> : null}
      </Text>
      <Text {...toneProps(row.factsTone)}>{row.facts}</Text>
      {row.activity !== null ? <Text {...toneProps(row.activityTone)}>{row.activity}</Text> : null}
      {row.bar !== null ? <Text>{row.bar}</Text> : null}
      {row.stepLabel !== null ? <Text dimColor>{row.stepLabel}</Text> : null}
      {row.left !== '' ? <Text {...toneProps(row.leftTone)}>{row.left}</Text> : null}
    </Box>
  )
}

export function paneTree(tags: Tags, view: PaneView) {
  const { Box, Text } = tags
  if (view.isEmpty) {
    return (
      <Box flexDirection="column">
        <Text weight="bold">Nothing is running.</Text>
        <Text dimColor>Agents, workflows, background commands and long replies show up here with the time left.</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      <Text weight="bold">{view.header}</Text>
      {view.rows.map(row => rowTree(tags, row))}
    </Box>
  )
}
