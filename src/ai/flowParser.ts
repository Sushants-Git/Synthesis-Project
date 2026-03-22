/**
 * Parses a natural language transaction intent into a FlowSpec —
 * a structured JSON representation of nodes and edges for the canvas.
 */

import { chat } from './index.ts'

export type NodeType =
  | 'wallet'
  | 'api_call'
  | 'approval_gate'
  | 'action'
  | 'output'
  | 'filter'

export interface FlowNode {
  id: string
  type: NodeType
  label: string
  description: string
  /** Optional metadata (e.g. address, API endpoint, filter criteria) */
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

const SYSTEM_PROMPT = `You are a transaction flow planner for a visual blockchain transaction builder called FlowTx.

Given a natural language description of what a user wants to do, output a JSON FlowSpec with:
- title: short title for the flow
- description: one sentence summary
- nodes: array of steps, each with { id, type, label, description, meta? }
  - types: wallet | api_call | approval_gate | action | output | filter
- edges: array of connections { from, to, label? }

Always include an approval_gate before any action that moves funds or posts externally.
Use ENS names wherever possible instead of hex addresses.
Return ONLY valid JSON. No markdown, no explanation.`

function extractJSON(text: string): string {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
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
