export type IOType = 'string' | 'string[]'

export interface InputDef {
  key: string
  label: string
  type: IOType
  required: boolean
  placeholder?: string
}

export interface OutputDef {
  key: string
  label: string
  type: IOType
  description?: string
}

export interface PluginCapability {
  action: string
  label: string
  description: string
  inputs: InputDef[]
  outputs: OutputDef[]
  /** If true, this step pauses and waits for explicit user confirmation */
  requiresApproval?: boolean
}

export interface ExecutionContext {
  walletAddress?: string
  templateVars?: Record<string, string>
}

export interface PluginResult {
  status: 'done' | 'error' | 'waiting'
  outputs?: Record<string, string | string[]>
  display?: string
  error?: string
  txHash?: string
  link?: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  /** What this plugin can do — shown to the AI */
  aiDescription: string
  icon: string
  /** tldraw color token */
  color: string
  /** 'hard' = built-in code plugin; 'soft' = user-built API chain */
  category?: 'hard' | 'soft'
  prizeTrack?: string
  /**
   * For manifest-based plugins: the executeUrl (may contain {{variable}} placeholders).
   * Exposed so the executor can scan it for template variables.
   */
  executeUrl?: string
  capabilities: PluginCapability[]
  execute(
    action: string,
    inputs: Record<string, string | string[]>,
    ctx: ExecutionContext,
  ): Promise<PluginResult>
}

/**
 * A JSON-serializable plugin definition.
 * When `executeUrl` is set, execute() POSTs to that URL and expects a PluginResult back.
 * The server receives: { action, inputs, context: ExecutionContext }
 */
export interface PluginManifest {
  id: string
  name: string
  description: string
  aiDescription: string
  icon: string
  /** tldraw color token: orange | blue | green | red | violet | grey | yellow */
  color: string
  prizeTrack?: string
  /**
   * Your server endpoint. Receives POST { action, inputs, context } → PluginResult.
   * Must respond with JSON and include CORS headers (Access-Control-Allow-Origin: *).
   */
  executeUrl?: string
  capabilities: PluginCapability[]
}
