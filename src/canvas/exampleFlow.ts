import type { FlowSpec } from '../ai/flowParser.ts'

/** Shown on canvas load — demonstrates ENS bidirectional resolution */
export const EXAMPLE_FLOW: FlowSpec = {
  title: 'ENS Bidirectional Lookup',
  description: 'Resolve vitalik.eth to a wallet address, then reverse-lookup back to ENS',
  nodes: [
    {
      id: 'n1',
      plugin: 'ens',
      action: 'resolve_name',
      label: 'Resolve ENS Name',
      description: 'Convert vitalik.eth → 0x address',
      params: { ens_name: 'vitalik.eth' },
    },
    {
      id: 'n2',
      plugin: 'ens',
      action: 'lookup_address',
      label: 'Reverse Lookup',
      description: 'Confirm address → vitalik.eth',
      params: {},
    },
    {
      id: 'n3',
      plugin: 'system',
      action: 'output',
      label: 'Result',
      description: 'Show resolved address and ENS name',
      params: {},
    },
  ],
  edges: [
    { from: 'n1', to: 'n2', label: 'address' },
    { from: 'n2', to: 'n3', label: 'ens name' },
  ],
}
