import { defineVitestConfig } from '@nuxt/test-utils/config'

// Vitest baseline for the template. Tests run in the Nuxt environment so they
// can render real components with auto-imports, NuxtLink, and Nuxt UI, but they
// never start a server or touch a database — see docs/testing.md.
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // tests/server/** opt into the plain `node` environment per file — they
    // exercise server code and never render a component.
    include: ['tests/nuxt/**/*.test.ts', 'tests/server/**/*.test.ts'],
    // Fail the run if no tests are found, so an empty/broken suite can never
    // pass silently in a merge request.
    passWithNoTests: false,
    // Booting the Nuxt environment and loading Better Auth + the schema both
    // happen in setup hooks, and test files run in parallel. On a slower machine
    // or CI runner that can exceed Vitest's 10s default without anything wrong.
    hookTimeout: 60_000,
  },
})
