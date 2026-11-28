// Fixed keys for useFetch calls that other pages refresh with refreshNuxtData().
// Without an explicit key Nuxt hashes the URL and options into one, so
// refreshNuxtData('/api/house') would silently refresh nothing.
export const HOUSE_KEY = 'house'
export const INVENTORY_KEY = 'decoration-inventory'
