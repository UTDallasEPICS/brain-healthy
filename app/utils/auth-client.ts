import { createAuthClient } from 'better-auth/vue'
import { jwtClient } from 'better-auth/client/plugins'

// The Nuxt app authenticates with Better Auth's session cookie. jwtClient adds
// authClient.token() for when a JWT is needed (e.g. to call the API from
// outside the browser): send it as `Authorization: Bearer <jwt>`.
export const authClient = createAuthClient({
  plugins: [jwtClient()],
})
