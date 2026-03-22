/**
 * AI Abstraction Layer
 *
 * Supports OpenAI and Claude. Switch provider via VITE_AI_PROVIDER env var.
 * API keys are injected server-side via Vite proxy — never exposed in the bundle.
 * Falls back to the other provider automatically on failure.
 */

export type AIProvider = 'openai' | 'claude'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  content: string
  provider: AIProvider
}

const PRIMARY: AIProvider =
  (import.meta.env.VITE_AI_PROVIDER as AIProvider) ?? 'openai'

async function callOpenAI(
  messages: AIMessage[],
  systemPrompt?: string,
): Promise<string> {
  const allMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages

  const res = await fetch('/api/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o',
      messages: allMessages,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

async function callClaude(
  messages: AIMessage[],
  systemPrompt?: string,
): Promise<string> {
  const res = await fetch('/api/claude/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: import.meta.env.VITE_CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Claude ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> }
  const block = data.content[0]
  return block?.type === 'text' ? block.text : ''
}

/**
 * Send a chat completion request, with automatic fallback to the other provider.
 */
export async function chat(
  messages: AIMessage[],
  systemPrompt?: string,
): Promise<AIResponse> {
  const fallback: AIProvider = PRIMARY === 'openai' ? 'claude' : 'openai'

  try {
    const content =
      PRIMARY === 'openai'
        ? await callOpenAI(messages, systemPrompt)
        : await callClaude(messages, systemPrompt)
    return { content, provider: PRIMARY }
  } catch (primaryErr) {
    console.warn(`Primary AI provider (${PRIMARY}) failed, trying ${fallback}:`, primaryErr)
    try {
      const content =
        fallback === 'openai'
          ? await callOpenAI(messages, systemPrompt)
          : await callClaude(messages, systemPrompt)
      return { content, provider: fallback }
    } catch (fallbackErr) {
      throw new Error(`Both AI providers failed.\nPrimary: ${primaryErr}\nFallback: ${fallbackErr}`)
    }
  }
}
