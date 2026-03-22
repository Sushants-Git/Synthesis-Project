import type { FlowNode } from '../ai/flowParser.ts'
import { sendETH } from './wallet.ts'
import { resolveENS, isENSName } from './ens.ts'

export type StepStatus = 'pending' | 'waiting' | 'running' | 'done' | 'error' | 'skipped'

export interface StepResult {
  status: 'done' | 'error' | 'waiting'
  data?: Record<string, string>
  display?: string
  error?: string
}

/** Shared context passed between steps — results from earlier steps feed later ones */
export interface ExecutionContext {
  walletAddress: string
  /** Resolved values accumulate here as steps complete */
  resolved: Record<string, string>
  /** Collected user inputs */
  inputs: Record<string, string>
}

export async function executeStep(
  node: FlowNode,
  ctx: ExecutionContext,
): Promise<StepResult> {
  const params = { ...node.params, ...ctx.inputs }
  const resolved = ctx.resolved

  switch (node.executionType) {
    case 'ens_resolve': {
      const name = params.ens_name ?? params.to ?? ''
      if (!name) return { status: 'error', error: 'No ENS name to resolve' }

      const address = await resolveENS(name)
      if (!address) return { status: 'error', error: `Could not resolve ${name}` }

      ctx.resolved.to = address
      ctx.resolved.ens_name = name
      return {
        status: 'done',
        data: { address },
        display: `${name} → ${address.slice(0, 6)}…${address.slice(-4)}`,
      }
    }

    case 'eth_transfer': {
      const to = resolved.to ?? params.to ?? ''
      const amount = params.amount ?? ''
      const from = ctx.walletAddress

      if (!to) return { status: 'error', error: 'Recipient address missing' }
      if (!amount) return { status: 'error', error: 'Amount missing' }

      // Resolve ENS inline if needed
      let finalTo = to
      if (isENSName(to)) {
        const addr = await resolveENS(to)
        if (!addr) return { status: 'error', error: `Could not resolve ${to}` }
        finalTo = addr
      }

      const txHash = await sendETH(from, finalTo, amount)
      ctx.resolved.txHash = txHash
      return {
        status: 'done',
        data: { txHash },
        display: `${txHash.slice(0, 10)}…`,
      }
    }

    case 'approval': {
      // Approval is handled by the UI — this step is "waiting" until the user approves
      return { status: 'waiting', display: 'Waiting for approval…' }
    }

    case 'twitter_search': {
      // Placeholder — real implementation requires a backend proxy for Twitter API
      return {
        status: 'done',
        data: { note: 'Twitter search requires backend proxy' },
        display: 'Twitter search (demo)',
      }
    }

    case 'api_call': {
      const url = params.url ?? ''
      if (!url) return { status: 'done', display: 'API call (no URL specified)' }
      try {
        const res = await fetch(url)
        const text = await res.text()
        return { status: 'done', display: text.slice(0, 100) }
      } catch (e) {
        return { status: 'error', error: String(e) }
      }
    }

    default:
      return { status: 'done', display: 'Step complete' }
  }
}
