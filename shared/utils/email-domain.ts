// The app is for UT Dallas students only. Exact match on the domain, lowercased —
// not endsWith, which would also accept someone@evilutdallas.edu.
//
// Lives in shared/ so Nuxt auto-imports it on both sides: the server enforces it
// (server/utils/auth.ts) and app/pages/auth.vue gives the same answer up front.
export const ALLOWED_EMAIL_DOMAINS = ['utdallas.edu']

export function isUtdEmail(email: string) {
  const at = email.lastIndexOf('@')
  return at !== -1 && ALLOWED_EMAIL_DOMAINS.includes(email.slice(at + 1).toLowerCase())
}
