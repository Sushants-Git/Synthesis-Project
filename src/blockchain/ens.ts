import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

export function isENSName(value: string): boolean {
  return value.includes('.') && !value.startsWith('0x')
}

/** Resolve an ENS name to an address. Returns null if not found. */
export async function resolveENS(name: string): Promise<string | null> {
  try {
    const normalized = normalize(name)
    const address = await publicClient.getEnsAddress({ name: normalized })
    return address ?? null
  } catch {
    return null
  }
}

/** Reverse-lookup: address to ENS name. Returns null if not found. */
export async function lookupAddress(address: string): Promise<string | null> {
  try {
    const name = await publicClient.getEnsName({ address: address as `0x${string}` })
    return name ?? null
  } catch {
    return null
  }
}
