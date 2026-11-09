// The $.state contract of progress-eta. Declares the values the mod keeps for
// the session; the hooks module and the pane import these types from '../types'.
//
// Nothing here is ever written to $.store except ProgressHistoryEntry, whose
// key is a hash of the run's label, never the label or any prompt text.

/** What a row tracks. */
export type ProgressKind = 'agent' | 'workflow' | 'shell' | 'main'

/** How a row ended. A row that has not ended has no outcome. */
export type ProgressOutcome = 'done' | 'failed' | 'stopped'

/** One tracked piece of work. Plain JSON: it lives in $.state. */
export type ProgressRow = {
  /** Unique id of this row (a UUID minted when the row is created). */
  id: string
  kind: ProgressKind
  /** What the pane shows: the agent's description, the workflow's name, the command's description. */
  label: string
  /** History bucket: a hash for agents, workflows and commands; 'main' for the main reply. */
  key: string
  startedAt: number
  /** Last tool call, progress report or child activity, in clock milliseconds. */
  lastActivityAt: number
  /** Tool calls so far, not counting the progress tool itself. */
  toolCalls: number
  /** Tool calls started and not finished. */
  inFlight: number
  lastTool?: string
  /** Latest progress report: steps finished and steps in the plan. */
  step?: number
  total?: number
  stepLabel?: string
  /** The loop id events carry as agentId, once the spawn has answered. */
  agentId?: string
  /** The spawning agent's loop id; absent when the main loop spawned it. */
  parentId?: string
  /** Workflow row this agent belongs to. */
  groupId?: string
  /** Background task id, for shell and workflow rows. */
  taskId?: string
  /** Workflow run id (wf_...). */
  runId?: string
  /** Turn id of a main reply. */
  turnId?: string
  /** Workflow rows: agents started and agents finished. */
  agentsStarted?: number
  agentsDone?: number
  /** True when the work runs in the background (so the spawner does not wait on it). */
  isBackground?: boolean
  /** Shell rows: the loop (agent id, or 'main') whose final response ends the command. */
  endsWith?: string
  endedAt?: number
  outcome?: ProgressOutcome
}

/** Everything the pane and the status line are drawn from. */
export type ProgressTracker = {
  rows: ProgressRow[]
  /** The clock at the last event or tick; the pane draws from this, not from a live clock. */
  now: number
  /** True once the pane was placed unasked, so it is not forced open again. */
  autoOpened: boolean
}

/** One finished run, as kept in $.store. Exactly these five fields. */
export type ProgressHistoryEntry = {
  kind: ProgressKind
  key: string
  durationMs: number
  toolCalls: number
  /** The last total the run reported; 0 when it reported none. */
  totalSteps: number
}

declare module 'claude-code' {
  interface PluginState {
    'progress-eta': {
      tracker: Shaped<ProgressTracker>
      history: Shaped<ProgressHistoryEntry[]>
    }
  }
}
