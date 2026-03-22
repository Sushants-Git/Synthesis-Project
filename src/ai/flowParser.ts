import { chat } from './index.ts'
import { buildPluginContext } from '../plugins/registry.ts'

export interface InputField {
  key: string
  label: string
  placeholder: string
  inputType: 'address' | 'eth_amount' | 'text' | 'ens_name' | 'select'
}

export interface FlowNode {
  id: string
  /** Which plugin handles this node. Use "system" for generic flow control. */
  plugin: string
  /** Which action of that plugin to call */
  action: string
  label: string
  description: string
  /** Values extracted directly from the user's prompt */
  params?: Record<string, string>
  /** Fields the user must fill in — only what's genuinely missing from the prompt */
  requiredInputs?: InputField[]
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
}

export interface FlowSpec {
  title: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

function buildSystemPrompt(): string {
  return `You are FlowTx — a visual blockchain transaction composer. Given a natural language intent, compose a step-by-step flow using the available plugins.

AVAILABLE PLUGINS:
${buildPluginContext()}

SYSTEM NODES (plugin: "system"):
- action: "output" — shows the final result/confirmation (always end with this)
- action: "filter" — filter or rank a list of results
- action: "note" — display information to the user

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "title": "Short title (3-5 words)",
  "description": "One sentence what this flow does",
  "nodes": [
    {
      "id": "n1",
      "plugin": "metamask",
      "action": "connect_wallet",
      "label": "Connect Wallet",
      "description": "Connect MetaMask to get wallet address",
      "params": { "key": "value extracted from the user prompt" },
      "requiredInputs": [
        { "key": "amount", "label": "Amount (ETH)", "placeholder": "0.5", "inputType": "eth_amount" }
      ]
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "optional edge label" }
  ]
}

COMPOSITION RULES:
1. Extract ALL values from the user's prompt into "params" (amounts, names, addresses, criteria). "requiredInputs" is only for genuinely missing values.
2. If the recipient is an ENS name, always include an ens:resolve_name node before metamask:send_eth.
3. Always include metamask:approve before any fund movement (send_eth, deploy_contract, send_gasless_tx).
4. Always end with system:output.
5. Use self:verify_identity as a gate when sending to unknown people found via twitter search.
6. Prefer status:send_gasless_tx for small or frequent transfers — it's free.
7. Nodes should flow left to right in a logical sequence.
8. Choose plugins that maximize prize track coverage given the user's intent.

EXAMPLE — "send 0.5 ETH to the best ZK builder on Twitter":
nodes: metamask:connect_wallet → twitter:search_users(query:"best ZK builder") → twitter:user_approval → self:verify_identity → ens:resolve_name → metamask:approve → metamask:send_eth(amount:"0.5") → system:output`
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match?.[1]) return match[1].trim()
  return text.trim()
}

export async function parseIntent(prompt: string): Promise<FlowSpec> {
  const response = await chat(
    [{ role: 'user', content: prompt }],
    buildSystemPrompt(),
  )

  try {
    return JSON.parse(extractJSON(response.content)) as FlowSpec
  } catch {
    throw new Error(`Failed to parse AI response as FlowSpec:\n${response.content}`)
  }
}
