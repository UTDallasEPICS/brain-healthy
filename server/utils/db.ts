import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { env } from './env'

const connectionString = env.DATABASE_URL.replace('file:', '')

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined
}

// better-sqlite3 12 already turns foreign_keys on for every connection it
// opens, so this is belt-and-braces: the setting is per-connection and not
// stored in the file, so it would silently disappear under a different driver
// or a future default. Stating it here keeps the guarantee ours rather than
// the library's.
//
// WAL, by contrast, is a real change — SQLite defaults to `delete` journalling.
// It lets reads proceed while a write is in flight, which matters because
// awarding coins and completing a purchase both hold a write transaction.
// Unlike foreign_keys, WAL persists in the database file once set.
function connect() {
  const sqlite = new Database(connectionString)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  return sqlite
}

export const db = globalForDb.db ?? drizzle(connect(), { schema })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db
}
