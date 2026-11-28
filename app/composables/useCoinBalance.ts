// The user's coin balance, shared by every component on the page.
//
// The header's piggy bank loads it from GET /api/coins/balance under this key,
// and the backend ledger stays the single source of truth: anything that earns
// or spends coins calls `refreshBalance()` afterwards (or `setBalance()` when
// the server already answered with the new balance) so the piggy bank updates
// without a page refresh.
export const COIN_BALANCE_KEY = 'coin-balance'

export function useCoinBalance() {
  const { data } = useNuxtData<{ balance: number }>(COIN_BALANCE_KEY)

  const balance = computed(() => data.value?.balance ?? 0)

  /** Use a balance the server just returned, e.g. from completing a quest. */
  function setBalance(value: number) {
    data.value = { balance: value }
  }

  /** Re-read the balance from the server. */
  function refreshBalance() {
    return refreshNuxtData(COIN_BALANCE_KEY)
  }

  return { balance, setBalance, refreshBalance }
}

/** "1 coin", "12 coins". */
export function formatCoins(amount: number) {
  return `${amount} ${amount === 1 ? 'coin' : 'coins'}`
}
