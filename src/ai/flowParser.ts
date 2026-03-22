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
  plugin: string
  action: string
  label: string
  description: string
  params?: Record<string, string>
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

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ParseResult =
  | { type: 'flow'; flow: FlowSpec }
  | { type: 'message'; content: string }

function buildSystemPrompt(): string {
  return `You are FlowTx — a visual blockchain transaction composer. Given a natural language intent, compose a step-by-step flow using the available plugins.

If the user's intent is clear enough to build a flow, respond ONLY with valid JSON (no markdown, no explanation).
If the intent is ambiguous or you need clarification, ask a SHORT follow-up question as plain text (no JSON). Keep clarifying questions to one sentence.

AVAILABLE PLUGINS:
${buildPluginContext()}

SYSTEM NODES (plugin: "system"):
- action: "output" — shows the final result/confirmation (always end with this)
- action: "filter" — filter or rank a list of results
- action: "note" — display information to the user

OUTPUT FORMAT (when intent is clear) — return ONLY valid JSON:
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
    { "from": "n1", "to": "n2", "label": "output_key" }
  ]
}

EDGE LABELS: always set label to the primary output key being passed (e.g. "wallet_address", "resolved_address", "wallets", "ens_name"). This is displayed on the arrow in the diagram.

COMPOSITION RULES:
1. Extract ALL values from the user's prompt into "params". "requiredInputs" is only for genuinely missing values.
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

/**
 * Parse a multi-turn conversation into either a FlowSpec or a clarifying message.
 * Pass the full conversation history so the AI has context for follow-ups.
 */
export async function parseIntent(conversation: ConversationMessage[]): Promise<ParseResult> {
  const response = await chat(
    conversation.map((m) => ({ role: m.role, content: m.content })),
    buildSystemPrompt(),
  )

  try {
    const flow = JSON.parse(extractJSON(response.content)) as FlowSpec
    // Sanity-check it looks like a FlowSpec before returning
    if (!flow.nodes || !Array.isArray(flow.nodes)) throw new Error('not a FlowSpec')
    return { type: 'flow', flow }
  } catch {
    return { type: 'message', content: response.content }
  }
}
