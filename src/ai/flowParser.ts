import { chat } from './index.ts'
import { buildPluginContext } from '../plugins/registry.ts'

export interface FlowNode {
  id: string
  plugin: string
  action: string
  label: string
  description: string
  /** Static values pre-filled by the AI. String values only; executor handles type coercion. */
  params?: Record<string, string>
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  /**
   * Explicit output→input key remapping.
   * e.g. { "address": "to" } means: take `address` from the source node's outputs
   * and pass it as `to` to the target node's inputs.
   * Omit when output key and input key are identical (auto-matched by name).
   */
  wire?: Record<string, string>
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
  return `You are canvii — a visual blockchain flow builder. Convert natural language into a JSON flow spec.

RESPONSE RULES:
- Clear intent → respond ONLY with valid JSON (no markdown fences, no explanation).
- Ambiguous → ask ONE short clarifying question as plain text.
- Never mix JSON and explanation.

AVAILABLE PLUGINS (format: pluginId:action(input: type*, ...) → [output: type]):
${buildPluginContext()}

SYSTEM NODES (plugin: "system"):
- "output" — shows final result (always end every flow with this)
- "note" — display a message

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
      "params": { "key": "value" }
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3", "wire": { "fromOutputKey": "toInputKey" } }
  ]
}

DATA FLOW MODEL:
- Each node has typed inputs and outputs (string or string[]).
- Edges connect outputs of one node to inputs of the next.
- When output key == input key: no wire needed (auto-matched by name).
- When keys differ: add wire: { "outputKey": "inputKey" }.

WIRE REFERENCE (required only when output key ≠ input key):
- ens:resolve_name → metamask:send_eth: wire {"address":"to"}
- ens:resolve_name → status:send_gasless_tx: wire {"address":"to"}
- ens:resolve_name → self:verify_identity: auto-matched (both "address")
- ens:resolve_batch → metamask:batch_send: wire {"addresses":"recipients"}
- sheets:fetch_rows → ens:resolve_batch: wire {"rows":"names"}
- sheets:fetch_rows → metamask:batch_send: wire {"rows":"recipients"}
- sheets:fetch_rows → chatgpt:process: wire {"rows":"items"}
- twitter:search_users → twitter:verify_handle: wire {"top_handle":"handle"}
- twitter:search_users → twitter:get_profiles: AUTO-MATCHED (both key "handles", no wire)
- twitter:get_profiles → chatgpt:process: wire {"profiles":"items"}
- chatgpt:process → system:output: auto-matched

RULES:
1. Put all user-specified values (amounts, addresses, names, URLs) in params.
2. Always end with system:output.
3. Place metamask:approve as the FIRST node in any flow that sends ETH, before all data-fetching.
4. For single ENS name → single send: resolve_name → send_eth, wire {"address":"to"}.
5. For 2+ ENS names: ALWAYS use resolve_batch (NEVER multiple resolve_name nodes).
   Specify names in params as a JSON array string: {"names": "[\"a.eth\",\"b.eth\"]"}
6. For lists: use resolve_batch for ENS, batch_send for sending to multiple.
7. Prefer status:send_gasless_tx for small/frequent transfers.
8. Use wire only when the output key and input key differ.
9. CRITICAL — when the user provides specific handles, addresses, or names in the conversation,
   hardcode them directly in params. Do NOT add search/discovery nodes (search_users, etc.).
   Only add discovery nodes when the user says "find", "search", or leaves targets open-ended.
10. twitter:search_users outputs "handles" (array) and "top_handle" (single best).
    To pass ALL found handles downstream, use the "handles" output (auto-matched, no wire).
    To pass only the top one to verify_handle, use wire {"top_handle":"handle"}.

@MENTION RULES:
- @pluginId pins that plugin. @pluginId:action pins plugin + action.

EXAMPLE FLOWS:

"send 0.1 ETH to vitalik.eth":
nodes: n1:metamask:approve, n2:ens:resolve_name(name:"vitalik.eth"), n3:metamask:send_eth(amount:"0.1"), n4:system:output
edges: n1→n2, n2→n3 wire{"address":"to"}, n3→n4

"send 0.5 ETH each to sushant.eth and veesesh.eth":
nodes: n1:metamask:approve, n2:ens:resolve_batch(names:"[\"sushant.eth\",\"veesesh.eth\"]"), n3:metamask:batch_send(amount:"0.5"), n4:system:output
edges: n1→n2, n2→n3 wire{"addresses":"recipients"}, n3→n4

"fetch addresses from Google Sheet, send each 0.01 ETH":
nodes: n1:metamask:approve, n2:sheets:fetch_rows(sheet_url:"...",column_name:"receiver"), n3:metamask:batch_send(amount:"0.01"), n4:system:output
edges: n1→n2, n2→n3 wire{"rows":"recipients"}, n3→n4

"fetch ENS names from sheet, resolve, send 0.5 ETH split equally":
nodes: n1:metamask:approve, n2:sheets:fetch_rows(sheet_url:"..."), n3:ens:resolve_batch, n4:metamask:batch_send(total_amount:"0.5"), n5:system:output
edges: n1→n2, n2→n3 wire{"rows":"names"}, n3→n4 wire{"addresses":"recipients"}, n4→n5

"resolve vitalik.eth then reverse-lookup that address":
nodes: n1:ens:resolve_name(name:"vitalik.eth"), n2:ens:lookup_address, n3:system:output
edges: n1→n2 (auto-matched: both use "address"), n2→n3

"find ZK builders on Twitter and score them with ChatGPT":
nodes: n1:twitter:search_users(query:"ZK builder",limit:"10"), n2:twitter:get_profiles, n3:chatgpt:process(prompt:"Score each builder out of 10. Return JSON array."), n4:system:output
edges: n1→n2 (auto-matched: both "handles"), n2→n3 wire{"profiles":"items"}, n3→n4

"send 0.5 ETH each to sushantstwt.eth and veetwt.eth" (user provided specific names):
nodes: n1:metamask:approve, n2:ens:resolve_batch(names:"[\"sushantstwt.eth\",\"veetwt.eth\"]"), n3:metamask:batch_send(amount:"0.5"), n4:system:output
edges: n1→n2, n2→n3 wire{"addresses":"recipients"}, n3→n4`
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match?.[1]) return match[1].trim()
  return text.trim()
}

export async function parseIntent(conversation: ConversationMessage[]): Promise<ParseResult> {
  const response = await chat(
    conversation.map((m) => ({ role: m.role, content: m.content })),
    buildSystemPrompt(),
  )

  try {
    const flow = JSON.parse(extractJSON(response.content)) as FlowSpec
    if (!flow.nodes || !Array.isArray(flow.nodes)) throw new Error('not a FlowSpec')
    return { type: 'flow', flow }
  } catch {
    return { type: 'message', content: response.content }
  }
}
