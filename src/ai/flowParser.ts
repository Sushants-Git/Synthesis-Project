import { chat } from './index.ts'

export type NodeType =
  | 'wallet'
  | 'ens_resolve'
  | 'api_call'
  | 'approval_gate'
  | 'action'
  | 'output'
  | 'filter'
  | 'twitter_search'

export type ExecutionType =
  | 'eth_transfer'
  | 'ens_resolve'
  | 'twitter_search'
  | 'approval'
  | 'api_call'
  | null

export interface InputField {
  key: string
  label: string
  placeholder: string
  inputType: 'address' | 'eth_amount' | 'text' | 'ens_name'
}

export interface FlowNode {
  id: string
  type: NodeType
  label: string
  description: string
  executionType?: ExecutionType
  /** Values extracted directly from the user's prompt */
  params?: Record<string, string>
  /** Fields the user must fill in (only what's genuinely missing from the prompt) */
  requiredInputs?: InputField[]
  meta?: Record<string, string>
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

const SYSTEM_PROMPT = `You are FlowTx, a visual blockchain transaction planner. Given a natural language description, output a structured JSON FlowSpec representing the execution steps.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "title": "Short title (3-5 words)",
  "description": "One sentence summary",
  "nodes": [
    {
      "id": "n1",
      "type": "wallet|ens_resolve|api_call|approval_gate|action|output|filter|twitter_search",
      "label": "Short label (2-4 words)",
      "description": "What this step does",
      "executionType": "eth_transfer|ens_resolve|twitter_search|approval|api_call|null",
      "params": { "key": "value extracted from prompt" },
      "requiredInputs": [
        { "key": "fieldKey", "label": "Human label", "placeholder": "e.g. 0.1", "inputType": "address|eth_amount|text|ens_name" }
      ]
    }
  ],
  "edges": [{ "from": "n1", "to": "n2", "label": "optional" }]
}

NODE TYPES:
- wallet: the user's connected wallet (source of funds)
- ens_resolve: resolve an ENS name to an address (executionType: "ens_resolve")
- approval_gate: user must approve before funds move (executionType: "approval")
- action: executes a blockchain transaction (executionType: "eth_transfer" for ETH sends)
- twitter_search: searches Twitter for criteria (executionType: "twitter_search")
- filter: filter/rank results
- output: shows the result/confirmation
- api_call: external API call

RULES:
1. Extract ALL values from the prompt into params (amount, ENS names, addresses, criteria)
2. Only put in requiredInputs what's GENUINELY missing from the prompt
3. Always include an approval_gate before any fund transfer
4. If a recipient is an ENS name, include an ens_resolve node before the action
5. Always end with an output node showing confirmation
6. The wallet node should have params.action describing what it will do
7. For ETH transfers: action node params must include "amount" (in ETH) and "to" (address or ENS)

EXAMPLE — "send 0.5 ETH to vitalik.eth":
nodes: wallet(params:{action:"send 0.5 ETH"}) → ens_resolve(params:{ens_name:"vitalik.eth"}, executionType:"ens_resolve") → approval_gate(params:{amount:"0.5",to:"vitalik.eth"}, executionType:"approval") → action(params:{amount:"0.5",to:"vitalik.eth"}, executionType:"eth_transfer") → output`

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match?.[1]) return match[1].trim()
  return text.trim()
}

export async function parseIntent(prompt: string): Promise<FlowSpec> {
  const response = await chat(
    [{ role: 'user', content: prompt }],
    SYSTEM_PROMPT,
  )

  try {
    return JSON.parse(extractJSON(response.content)) as FlowSpec
  } catch {
    throw new Error(`Failed to parse AI response as FlowSpec: ${response.content}`)
  }
}
