import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

export type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
}

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null

async function init(onProgress?: (msg: string) => void): Promise<duckdb.AsyncDuckDB> {
  onProgress?.('Selecting DuckDB bundle')
  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = await duckdb.createWorker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  onProgress?.('Instantiating WebAssembly module')
  await db.instantiate(bundle.mainModule)

  onProgress?.('Downloading dataset (~1.3 MB parquet)')
  const base = import.meta.env.BASE_URL
  const [orders, contacts] = await Promise.all([
    fetch(`${base}data/orders.parquet?v=${__BUILD_ID__}`).then((r) => r.arrayBuffer()),
    fetch(`${base}data/contacts.parquet?v=${__BUILD_ID__}`).then((r) => r.arrayBuffer()),
  ])
  await db.registerFileBuffer('orders.parquet', new Uint8Array(orders))
  await db.registerFileBuffer('contacts.parquet', new Uint8Array(contacts))

  onProgress?.('Loading tables')
  const conn = await db.connect()
  await conn.query(`CREATE TABLE orders AS SELECT * FROM read_parquet('orders.parquet')`)
  await conn.query(`CREATE TABLE contacts AS SELECT * FROM read_parquet('contacts.parquet')`)
  await conn.close()
  return db
}

export function getDb(onProgress?: (msg: string) => void): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = init(onProgress)
  return dbPromise
}

function toJs(value: unknown, isTimestamp: boolean): unknown {
  if (isTimestamp && typeof value === 'number')
    return new Date(value).toISOString().replace('T', ' ').slice(0, 19)
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19)
  if (value instanceof Uint8Array) return Array.from(value).join(',')
  return value
}

/** Run a SQL string and return plain-JS rows (BigInt → number, dates → ISO). */
export async function runQuery(sql: string): Promise<QueryResult> {
  const db = await getDb()
  const conn = await db.connect()
  try {
    const table = await conn.query(sql)
    const columns = table.schema.fields.map((f) => f.name)
    const tsCols = new Set(
      table.schema.fields.filter((f) => String(f.type).startsWith('Timestamp')).map((f) => f.name),
    )
    const rows = table.toArray().map((row) => {
      const obj: Record<string, unknown> = {}
      for (const col of columns) obj[col] = toJs(row[col], tsCols.has(col))
      return obj
    })
    return { columns, rows }
  } finally {
    await conn.close()
  }
}
