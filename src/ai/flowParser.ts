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
  return `You are FlowTx — a visual blockchain transaction flow builder. Convert a natural language intent into a JSON flow spec using the available plugins.

RESPONSE RULES:
- If intent is clear → respond ONLY with valid JSON (no markdown fences, no explanation text whatsoever).
- If intent is ambiguous → ask ONE short clarifying question as plain text (no JSON).
- Never mix JSON and explanation in the same response.

AVAILABLE PLUGINS:
${buildPluginContext()}

SYSTEM NODES (plugin: "system"):
- "output" — shows final result (always end every flow with this)
- "note" — display a message to the user

JSON OUTPUT FORMAT:
{
  "title": "3-5 word title",
  "description": "One sentence describing the flow",
  "nodes": [
    {
      "id": "n1",
      "plugin": "pluginId",
      "action": "action_name",
      "label": "Human readable label",
      "description": "What this step does",
      "params": {}
    }
  ],
  "edges": [{ "from": "n1", "to": "n2", "label": "output_key_name" }]
}

PARAM RULES:
- Put every value mentioned in the user's prompt into "params" (amounts, addresses, names, URLs, etc.)
- Leave "params" empty {} only when there's truly nothing to pre-fill
- Do NOT use "requiredInputs" — the executor handles missing fields automatically

EDGE LABEL RULES:
- Always set the edge label to the exact output key being passed between nodes
- ens:resolve_name → next node: label = "address"
- sheets:fetch_rows → metamask:batch_send: label = "wallets"
- metamask:connect_wallet → next node: label = "wallet_address"

DATA FLOW RULES:
1. Outputs from one node automatically become available as inputs to the next node via the edge.
2. For ENS names as recipients: always add ens:resolve_name before any send step.
3. For sending to a list of addresses: use sheets:fetch_rows → metamask:batch_send (the rows output maps to wallets input automatically).
4. Always add metamask:approve before any ETH transfer (send_eth, batch_send).
5. Always end with system:output.
6. Prefer status:send_gasless_tx for small/frequent transfers.

EXAMPLE FLOWS:

"send 0.1 ETH to vitalik.eth":
n1:ens:resolve_name(ens_name:"vitalik.eth") → n2:metamask:approve → n3:metamask:send_eth(amount:"0.1") → n4:system:output
edges: n1→n2 label:"address", n2→n3 label:"address", n3→n4 label:"tx_hash"

"fetch addresses from my Google Sheet and send them each 0.01 ETH":
n1:sheets:fetch_rows(sheet_url:"...") → n2:metamask:approve → n3:metamask:batch_send(amount:"0.01") → n4:system:output
edges: n1→n2 label:"wallets", n2→n3 label:"wallets", n3→n4 label:"sent_count"

"resolve vitalik.eth then look up the ENS name for that address":
n1:ens:resolve_name(ens_name:"vitalik.eth") → n2:ens:lookup_address → n3:system:output
edges: n1→n2 label:"address", n2→n3 label:"ens_name"`
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
