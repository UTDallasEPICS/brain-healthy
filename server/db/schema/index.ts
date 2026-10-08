// Aggregate schema export.
//
// This directory replaces the single server/db/schema.ts file. The import path
// is unchanged — `~~/server/db/schema` and `../db/schema` both resolve here —
// so existing imports keep working.
//
// Two conventions worth knowing before adding a table:
//   - auth.ts uses camelCase columns because Better Auth's adapter requires
//     those exact names. Everything else uses snake_case.
//   - IDs are TEXT uuids, timestamps are integer seconds ({ mode: 'timestamp' }),
//     booleans are integers ({ mode: 'boolean' }).
//
// Keep every file the migration needs under server/db/ — the deploy workflow
// only bundles drizzle/ and server/db/ for the migration Lambda.

export * from './auth'
export * from './activities'
export * from './house'
export * from './economy'
export * from './social'
export * from './relations'
