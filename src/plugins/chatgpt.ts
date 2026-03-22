import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const ChatGPTPlugin: Plugin = {
  id: 'chatgpt',
  name: 'ChatGPT',
  description: 'Process data with GPT — classify, score, summarize, transform',
  aiDescription:
    'ChatGPT processing node. ' +
    'process(items[]*, prompt*, model?) → result(string), results(string[]) — feed any array into GPT with an instruction. ' +
    'When prompt asks for JSON array, results[] is populated (one element per input item). ' +
    'FILTER PATTERN: prompt GPT to return a JSON array of "true"/"false" per item, ' +
    'then wire results[] → util:filter:conditions AND the original source items → util:filter:items. ' +
    'Wire: get_profiles→process needs wire {"profiles":"items"}. sheets→process needs wire {"rows":"items"}.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>',
  color: 'green',
  capabilities: [
    {
      action: 'process',
      label: 'Process with GPT',
      description: 'Send a list of items to ChatGPT with a custom instruction and get structured output',
      inputs: [
        {
          key: 'items',
          label: 'Input Items',
          type: 'string[]',
          required: true,
          placeholder: 'Array of items to process',
        },
        {
          key: 'prompt',
          label: 'Instruction',
          type: 'string',
          required: true,
          placeholder: 'Score each item out of 10. Return a JSON array of strings like "item: score/10 — reason".',
        },
        {
          key: 'model',
          label: 'Model',
          type: 'string',
          required: false,
          placeholder: 'gpt-4o',
        },
      ],
      outputs: [
        { key: 'result', label: 'Raw Response', type: 'string' },
        { key: 'results', label: 'Results Array', type: 'string[]' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    if (action !== 'process') return { status: 'error', error: `Unknown action: ${action}` }

    const items = inputs.items as string[]
    const prompt = inputs.prompt as string
    const model = (inputs.model as string | undefined) || 'gpt-4o'

    if (!items?.length) return { status: 'error', error: 'No items to process' }
    if (!prompt?.trim()) return { status: 'error', error: 'Instruction required' }

    const userMessage = items.length === 1
      ? `${items[0]}\n\nInstruction: ${prompt}`
      : `Items:\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nInstruction: ${prompt}`

    let raw: string
    try {
      const resp = await fetch('/api/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a data processing assistant. Follow instructions precisely. ' +
                'When asked to return an array or list, always return valid JSON array syntax (no markdown fences). ' +
                'When asked for structured output, return clean JSON. ' +
                'Be concise.',
            },
            { role: 'user', content: userMessage },
          ],
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        return { status: 'error', error: `OpenAI ${resp.status}: ${text.slice(0, 200)}` }
      }

      const data = (await resp.json()) as { choices: [{ message: { content: string } }] }
      raw = data.choices[0]?.message?.content ?? ''
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) }
    }

    // Try to parse as JSON array; fall back to line splitting
    let results: string[]
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        results = parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      } else {
        results = [cleaned]
      }
    } catch {
      results = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    }

    return {
      status: 'done',
      outputs: { result: raw, results },
      display: `GPT processed ${items.length} item${items.length !== 1 ? 's' : ''} → ${results.length} result${results.length !== 1 ? 's' : ''}`,
    }
  },
}
