import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const GoogleSheetsPlugin: Plugin = {
  id: 'sheets',
  name: 'Google Sheets',
  description: 'Read rows from a public Google Sheet — no API key required',
  aiDescription:
    'Google Sheets integration. Reads data from a public Google Sheet — no API key needed. ' +
    'Action: fetch_rows — takes sheet_url (full Google Sheets URL) and optional column_name (exact column header to extract, e.g. "wallet_address" — defaults to first column if omitted). ' +
    'Outputs: rows (flat JSON array of values from the specified column, for wallet lists), ' +
    'table (2D JSON array with header row — for display), count (number of data rows). ' +
    'Sheet must be shared as "Anyone with the link can view". ' +
    'Connect rows/wallets output to metamask:batch_send to send ETH to each address.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M7 19h10v-7H7Zm5.75-4.25V13.5h2.75v1.25Zm0 2.75v-1.25h2.75v1.25ZM8.5 14.75V13.5h2.75v1.25Zm0 2.75v-1.25h2.75v1.25ZM6 22q-.825 0-1.412-.587Q4 20.825 4 20V4q0-.825.588-1.413Q5.175 2 6 2h8l6 6v12q0 .825-.587 1.413Q18.825 22 18 22Zm7-13h5l-5-5Z"/></svg>',
  color: 'green',
  capabilities: [
    {
      action: 'fetch_rows',
      label: 'Fetch Rows',
      description: 'Read all data from a public Google Sheet',
      params: [
        {
          key: 'sheet_url',
          label: 'Sheet URL',
          placeholder: 'https://docs.google.com/spreadsheets/d/...',
          inputType: 'text',
          required: true,
        },
        {
          key: 'column_name',
          label: 'Column Name (optional)',
          placeholder: 'e.g. wallet_address — defaults to first column',
          inputType: 'text',
          required: false,
        },
      ],
      outputs: ['rows', 'wallets', 'table', 'count'],
    },
  ],

  async execute(action: string, params: Record<string, string>, ctx: ExecutionContext): Promise<PluginResult> {
    if (action !== 'fetch_rows') {
      return { status: 'error', error: `Unknown action: ${action}` }
    }

    const sheetUrl = params.sheet_url ?? ctx.inputs.sheet_url
    if (!sheetUrl) return { status: 'error', error: 'Sheet URL required' }

    const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    const sheetId = idMatch?.[1] ?? sheetUrl.trim()

    const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/)
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : ''

    try {
      const url =
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
        `/gviz/tq?tqx=out:json${gidParam}`

      const resp = await fetch(url)
      if (!resp.ok) {
        return {
          status: 'error',
          error: `HTTP ${resp.status} — make sure the sheet is shared as "Anyone with the link can view"`,
        }
      }

      const text = await resp.text()
      // gviz response is wrapped: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
      const jsonStr = text.replace(/^[^{]*/, '').replace(/\s*\);?\s*$/, '')
      const data = JSON.parse(jsonStr) as {
        table?: {
          cols?: Array<{ label?: string; id?: string }>
          rows?: Array<{ c: Array<{ v: unknown; f?: string } | null> }>
        }
      }

      const cols = data.table?.cols ?? []
      const tableRows = data.table?.rows ?? []

      // Build header row from column labels
      const headers = cols.map((c) => c.label || c.id || '?')

      // Build 2D data grid (all columns)
      const bodyRows = tableRows
        .map((row) =>
          cols.map((_, j) => {
            const cell = row.c?.[j]
            if (!cell || cell.v === null || cell.v === undefined) return ''
            // Prefer formatted string (f) for numbers/dates, else raw value
            return cell.f ?? String(cell.v)
          }),
        )
        .filter((row) => row.some((v) => v !== ''))

      // Flat list from a specific column — defaults to first column
      const columnName = params.column_name ?? ctx.inputs.column_name
      const colIndex = columnName
        ? headers.findIndex((h) => h.toLowerCase() === columnName.toLowerCase())
        : 0
      const resolvedColIndex = colIndex === -1 ? 0 : colIndex
      if (columnName && colIndex === -1) {
        return {
          status: 'error',
          error: `Column "${columnName}" not found. Available columns: ${headers.join(', ')}`,
        }
      }
      const firstColValues = bodyRows.map((row) => row[resolvedColIndex] ?? '').filter(Boolean)

      // Full 2D table with header row for display
      const tableGrid = headers.length > 0 ? [headers, ...bodyRows] : bodyRows

      const rowsJson = JSON.stringify(firstColValues)
      const tableJson = JSON.stringify(tableGrid)

      return {
        status: 'done',
        outputs: {
          rows: rowsJson,
          wallets: rowsJson,
          table: tableJson,
          count: String(bodyRows.length),
        },
        display: `Fetched ${bodyRows.length} rows × ${cols.length} columns`,
      }
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) }
    }
  },
}
