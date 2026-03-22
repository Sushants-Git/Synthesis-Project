import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const GoogleSheetsPlugin: Plugin = {
  id: 'sheets',
  name: 'Google Sheets',
  description: 'Read rows from a public Google Sheet — no API key required',
  aiDescription:
    'Google Sheets — read one column at a time from a public spreadsheet. ' +
    'fetch_rows(sheet_url, column_name) → rows[] (string array of that column\'s values), table (full JSON), count. ' +
    'column_name must match the sheet header exactly (case-insensitive). ' +
    'To use two columns from the same sheet (e.g. handles + ens_names), add TWO fetch_rows nodes with the same URL but different column_name values. ' +
    'Sheet must be shared as "Anyone with the link can view" (no API key needed). ' +
    'rows[] output: wire to ens:resolve_batch with {"rows":"names"}, to batch_send with {"rows":"recipients"}, to chatgpt with {"rows":"items"}, to get_profiles with {"rows":"handles"}.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M7 19h10v-7H7Zm5.75-4.25V13.5h2.75v1.25Zm0 2.75v-1.25h2.75v1.25ZM8.5 14.75V13.5h2.75v1.25Zm0 2.75v-1.25h2.75v1.25ZM6 22q-.825 0-1.412-.587Q4 20.825 4 20V4q0-.825.588-1.413Q5.175 2 6 2h8l6 6v12q0 .825-.587 1.413Q18.825 22 18 22Zm7-13h5l-5-5Z"/></svg>',
  color: 'green',
  capabilities: [
    {
      action: 'fetch_rows',
      label: 'Fetch Rows',
      description: 'Read all data from a public Google Sheet',
      inputs: [
        {
          key: 'sheet_url',
          label: 'Sheet URL',
          type: 'string',
          required: true,
          placeholder: 'https://docs.google.com/spreadsheets/d/...',
        },
        {
          key: 'column_name',
          label: 'Column Name',
          type: 'string',
          required: true,
          placeholder: 'wallet_address (exact column header)',
        },
      ],
      outputs: [
        { key: 'rows', label: 'Row Values', type: 'string[]' },
        { key: 'table', label: 'Full Table (JSON)', type: 'string' },
        { key: 'count', label: 'Row Count', type: 'string' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    if (action !== 'fetch_rows') {
      return { status: 'error', error: `Unknown action: ${action}` }
    }

    const sheetUrl = inputs.sheet_url as string
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
      const jsonStr = text.replace(/^[^{]*/, '').replace(/\s*\);?\s*$/, '')
      const data = JSON.parse(jsonStr) as {
        table?: {
          cols?: Array<{ label?: string; id?: string }>
          rows?: Array<{ c: Array<{ v: unknown; f?: string } | null> }>
        }
      }

      const cols = data.table?.cols ?? []
      const tableRows = data.table?.rows ?? []

      const headers = cols.map((c) => c.label || c.id || '?')

      const bodyRows = tableRows
        .map((row) =>
          cols.map((_, j) => {
            const cell = row.c?.[j]
            if (!cell || cell.v === null || cell.v === undefined) return ''
            return cell.f ?? String(cell.v)
          }),
        )
        .filter((row) => row.some((v) => v !== ''))

      const columnName = inputs.column_name as string
      const colIndex = headers.findIndex((h) => h.toLowerCase() === columnName.toLowerCase())
      if (colIndex === -1) {
        return {
          status: 'error',
          error: `Column "${columnName}" not found. Available: ${headers.join(', ')}`,
        }
      }

      const rows = bodyRows.map((row) => row[colIndex] ?? '').filter(Boolean)
      const tableGrid = headers.length > 0 ? [headers, ...bodyRows] : bodyRows

      return {
        status: 'done',
        outputs: {
          rows,
          table: JSON.stringify(tableGrid),
          count: String(bodyRows.length),
        },
        display: `Fetched ${bodyRows.length} rows × ${cols.length} columns`,
      }
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) }
    }
  },
}
