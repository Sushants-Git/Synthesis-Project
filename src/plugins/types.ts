export interface ParamDef {
  key: string
  label: string
  placeholder: string
  inputType: 'address' | 'eth_amount' | 'text' | 'ens_name' | 'select'
  required: boolean
  options?: string[]
}

export interface PluginCapability {
  action: string
  label: string
  description: string
  params: ParamDef[]
  /** Keys this action produces for downstream nodes */
  outputs: string[]
  /** If true, this step pauses and waits for explicit user confirmation */
  requiresApproval?: boolean
}

export interface ExecutionContext {
  walletAddress?: string
  /** Accumulated outputs from previous steps */
  resolved: Record<string, string>
  /** User-entered inputs for this run */
  inputs: Record<string, string>
  /**
   * Template variable values filled in by the user before execution.
   * Substituted into {{variable}} placeholders in executeUrl and params.
   */
  templateVars?: Record<string, string>
}

export interface PluginResult {
  status: 'done' | 'error' | 'waiting'
  outputs?: Record<string, string>
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
  /** Prize track this plugin targets */
  prizeTrack?: string
  /**
   * For manifest-based plugins: the executeUrl (may contain {{variable}} placeholders).
   * Exposed so the executor can scan it for template variables.
   */
  executeUrl?: string
  capabilities: PluginCapability[]
  execute(
    action: string,
    params: Record<string, string>,
    ctx: ExecutionContext,
  ): Promise<PluginResult>
}

/**
 * A JSON-serializable plugin definition.
 * Custom plugins are defined as manifests — no JS required.
 * When `executeUrl` is set, execute() POSTs to that URL and expects a PluginResult back.
 * The server receives: { action, params, context: ExecutionContext }
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
   * Your server endpoint. Receives POST { action, params, context } → PluginResult.
   * Must respond with JSON and include CORS headers (Access-Control-Allow-Origin: *).
   */
  executeUrl?: string
  capabilities: PluginCapability[]
}
