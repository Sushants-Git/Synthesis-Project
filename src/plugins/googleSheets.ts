import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const GoogleSheetsPlugin: Plugin = {
  id: 'sheets',
  name: 'Google Sheets',
  description: 'Read rows from a public Google Sheet — no API key required',
  aiDescription:
    'Google Sheets integration. Reads data from a public Google Sheet — no API key needed. ' +
    'Action: fetch_rows — takes sheet_url (full Google Sheets URL) and an optional column index (0-based, default 0 = first column). ' +
    'Outputs: rows (JSON array of cell values), count (number of rows). ' +
    'Sheet must be shared as "Anyone with the link can view". ' +
    'Use this when the user wants to read wallet addresses or other data from a spreadsheet. ' +
    'Connect rows output to metamask:batch_send to send ETH to each address.',
  icon: '📊',
  color: 'green',
  capabilities: [
    {
      action: 'fetch_rows',
      label: 'Fetch Rows',
      description: 'Read a column from a public Google Sheet',
      params: [
        {
          key: 'sheet_url',
          label: 'Sheet URL',
          placeholder: 'https://docs.google.com/spreadsheets/d/...',
          inputType: 'text',
          required: true,
        },
        {
          key: 'column',
          label: 'Column index (0 = A, 1 = B, …)',
          placeholder: '0',
          inputType: 'text',
          required: false,
        },
      ],
      outputs: ['rows', 'count'],
    },
  ],

  async execute(action: string, params: Record<string, string>, ctx: ExecutionContext): Promise<PluginResult> {
    if (action !== 'fetch_rows') {
      return { status: 'error', error: `Unknown action: ${action}` }
    }

    const sheetUrl = params.sheet_url ?? ctx.inputs.sheet_url
    const colIndex = parseInt(params.column ?? ctx.inputs.column ?? '0', 10)

    if (!sheetUrl) return { status: 'error', error: 'Sheet URL required' }

    // Extract sheet ID from full URL or use as-is
    const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    const sheetId = idMatch?.[1] ?? sheetUrl.trim()

    // Extract optional gid (sheet tab) from URL
    const gidMatch = sheetUrl.match(/[#&]gid=(\d+)/)
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : ''

    try {
      // gviz/tq endpoint — works on public sheets, no API key needed
      const url =
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
        `/gviz/tq?tqx=out:json${gidParam}`

      const resp = await fetch(url)
      if (!resp.ok) {
        return { status: 'error', error: `HTTP ${resp.status} — make sure the sheet is shared as "Anyone with the link can view"` }
      }

      const text = await resp.text()
      // Response is wrapped: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
      const jsonStr = text.replace(/^[^{]*/, '').replace(/\s*\);?\s*$/, '')
      const data = JSON.parse(jsonStr) as {
        table?: { rows?: Array<{ c: Array<{ v: unknown } | null> }> }
      }

      const tableRows = data.table?.rows ?? []
      const rows = tableRows
        .map((row) => row.c?.[colIndex]?.v)
        .filter((v) => v !== null && v !== undefined && v !== '')
        .map(String)

      const rowsJson = JSON.stringify(rows)

      return {
        status: 'done',
        // Expose as both 'rows' and 'wallets' so batch_send finds it without extra config
        outputs: { rows: rowsJson, wallets: rowsJson, count: String(rows.length) },
        display: `Fetched ${rows.length} rows from sheet`,
      }
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) }
    }
  },
}
