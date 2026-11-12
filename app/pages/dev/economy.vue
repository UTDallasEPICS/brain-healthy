<script setup lang="ts">
  // Dev-only console for the coin economy, reward system, and quests. Every
  // button calls the real API (plus the dev helpers in server/api/dev/), and
  // every request and response is shown in the log. "Run all checks" walks
  // through each feature and reports pass/fail per step.
  //
  // Only available under `pnpm dev` — see server/utils/devTools.ts.
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
  }

  type Method = 'GET' | 'POST' | 'PATCH'

  interface Quest {
    id: string
    name: string
    description: string
    frequency: 'daily' | 'weekly' | 'once'
    rewardAmount: number
    contentUrl: string | null
    completed: boolean
    eligible: boolean
  }

  interface Transaction {
    id: string
    amount: number
    transactionType: string
    reason: string | null
    createdAt: string
  }

  interface Reward {
    activityType: string
    coinAmount: number
    enabled: boolean
  }

  interface HistoryEntry {
    questId: string
    name: string
    frequency: string
    completedAt: string
  }

  // Responses the console only pokes at loosely (e.g. result.data.coinsEarned)
  // are left untyped; the API's own tests pin their exact shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any

  interface ApiResult<T = Json> {
    status: number
    ok: boolean
    data: T
  }

  interface LogEntry extends ApiResult {
    id: number
    method: Method
    path: string
    body?: unknown
    at: string
  }

  const ACTION_CODE_BY_ACTIVITY: Record<string, string> = {
    individual_quest_completion: 'QUEST_COMPLETE',
    qr_event_check_in: 'EVENT_PARTICIPATION',
    social_engagement: 'SOCIAL_NUDGE',
    verified_friend_referral: 'VERIFIED_REFERRAL',
  }

  const toast = useToast()

  // ---- API + request log -------------------------------------------------

  const log = ref<LogEntry[]>([])
  let nextLogId = 0

  async function api<T = Json>(
    method: Method,
    path: string,
    body?: unknown,
    { quiet = false, signedOut = false } = {}
  ): Promise<ApiResult<T>> {
    const res = await $fetch.raw<T>(path, {
      method,
      body: body as Record<string, unknown> | undefined,
      ignoreResponseError: true,
      credentials: signedOut ? 'omit' : 'same-origin',
    })
    const result = { status: res.status, ok: res.ok, data: res._data as T }

    if (!quiet) {
      log.value.unshift({
        ...result,
        id: nextLogId++,
        method,
        path: signedOut ? `${path} (signed out)` : path,
        body,
        at: new Date().toLocaleTimeString(),
      })
      log.value.splice(150)
    }
    return result
  }

  function errorText(result: ApiResult) {
    return result.data?.statusMessage ?? result.data?.message ?? `HTTP ${result.status}`
  }

  function notify(result: ApiResult, success: string) {
    toast.add(
      result.ok
        ? { title: success, color: 'success' }
        : { title: `${result.status}: ${errorText(result)}`, color: 'error' }
    )
  }

  // ---- Simulated clock ---------------------------------------------------

  // Empty = real time. Otherwise a datetime-local value in the browser's zone.
  const simulatedNow = ref('')
  const nowIso = computed(() =>
    simulatedNow.value ? new Date(simulatedNow.value).toISOString() : undefined
  )

  function toLocalInput(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }

  function shiftClock(days: number) {
    const base = simulatedNow.value ? new Date(simulatedNow.value) : new Date()
    simulatedNow.value = toLocalInput(new Date(base.getTime() + days * 86_400_000))
  }

  // ---- State -------------------------------------------------------------

  const balance = ref<number | null>(null)
  const transactions = ref<Transaction[]>([])
  const rewards = ref<Reward[]>([])
  const quests = ref<Quest[]>([])
  const history = ref<HistoryEntry[]>([])
  const transactionLimit = ref(20)
  const questDetail = ref<unknown>(null)
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    const questsPath = nowIso.value
      ? `/api/dev/quests?now=${encodeURIComponent(nowIso.value)}`
      : '/api/quests'
    const [b, t, r, q, h] = await Promise.all([
      api<{ balance: number }>('GET', '/api/coins/balance', undefined, { quiet: true }),
      api<Transaction[]>(
        'GET',
        `/api/coins/transactions?limit=${transactionLimit.value}`,
        undefined,
        { quiet: true }
      ),
      api<Reward[]>('GET', '/api/rewards', undefined, { quiet: true }),
      api<Quest[]>('GET', questsPath, undefined, { quiet: true }),
      api<HistoryEntry[]>('GET', '/api/quests/history', undefined, { quiet: true }),
    ])
    if (b.ok) balance.value = b.data.balance
    if (t.ok) transactions.value = t.data
    if (r.ok) {
      rewards.value = r.data
      for (const reward of r.data) {
        rewardEdits[reward.activityType] = {
          coinAmount: reward.coinAmount,
          enabled: reward.enabled,
        }
      }
    }
    if (q.ok) quests.value = q.data
    if (h.ok) history.value = h.data
    loading.value = false
  }

  watch(simulatedNow, refresh)
  onMounted(refresh)

  // ---- Quests ------------------------------------------------------------

  async function completeQuest(questId: string) {
    const result = nowIso.value
      ? await api('POST', `/api/dev/quests/${questId}/complete`, { now: nowIso.value })
      : await api('POST', `/api/quests/${questId}/complete`)
    notify(
      result,
      `Completed — +${result.data?.coinsEarned} coins (balance ${result.data?.balance})`
    )
    await refresh()
  }

  async function viewQuest(questId: string) {
    const result = await api('GET', `/api/quests/${questId}`)
    questDetail.value = result.data
  }

  async function setSubmission(questId: string, status: 'pending' | 'rejected') {
    const result = await api('POST', `/api/dev/quests/${questId}/submission`, {
      status,
      now: nowIso.value,
    })
    notify(result, `Submission marked ${status}`)
    await refresh()
  }

  // ---- Coins -------------------------------------------------------------

  const newRef = (prefix: string) => `${prefix}:${crypto.randomUUID().slice(0, 8)}`

  const awardForm = reactive({
    amount: 10,
    reason: 'Manual test award',
    referenceId: newRef('test'),
  })
  const spendForm = reactive({
    amount: 3,
    reason: 'Bought a lamp',
    referenceId: newRef('purchase'),
  })

  async function moveCoins(kind: 'award' | 'spend') {
    const form = kind === 'award' ? awardForm : spendForm
    const result = await api('POST', `/api/dev/coins/${kind}`, { ...form })
    if (result.ok && !result.data.applied) {
      toast.add({
        title: 'Not applied — this referenceId was already used (duplicate prevented)',
        color: 'warning',
      })
    } else {
      notify(result, `${kind === 'award' ? 'Awarded' : 'Spent'} ${form.amount} coins`)
    }
    await refresh()
  }

  // ---- Rewards -----------------------------------------------------------

  const rewardEdits = reactive<Record<string, { coinAmount: number; enabled: boolean }>>({})

  async function saveReward(activityType: string) {
    const result = await api('PATCH', `/api/dev/rewards/${ACTION_CODE_BY_ACTIVITY[activityType]}`, {
      ...rewardEdits[activityType],
    })
    notify(result, 'Reward rule updated in the database')
    await refresh()
  }

  const grantForm = reactive({ activityType: 'qr_event_check_in', referenceId: newRef('event') })

  async function grantReward() {
    const result = await api('POST', '/api/dev/rewards/grant', { ...grantForm })
    if (result.ok && !result.data.awarded) {
      toast.add({
        title: 'Not awarded (duplicate claim or referral cap reached)',
        color: 'warning',
      })
    } else {
      notify(result, `Awarded ${result.data?.amount} coins`)
    }
    await refresh()
  }

  const lastInvitee = ref<string | null>(null)

  async function inviteAndClaim(verified: boolean) {
    const invite = await api('POST', '/api/dev/referrals', { verified })
    if (!invite.ok) return notify(invite, '')
    lastInvitee.value = invite.data.invitedUserId
    await claimReferral(invite.data.invitedUserId)
  }

  async function claimReferral(invitedUserId: string) {
    const result = await api('POST', '/api/dev/rewards/grant', {
      activityType: 'verified_friend_referral',
      referenceId: invitedUserId,
    })
    if (result.ok && !result.data.awarded) {
      toast.add({
        title: 'Not awarded (already paid, or 3-referral cap reached)',
        color: 'warning',
      })
    } else {
      notify(result, `Referral reward: +${result.data?.amount} coins`)
    }
    await refresh()
  }

  async function resetData() {
    const result = await api('POST', '/api/dev/reset', { restoreRewardRules: true })
    notify(result, 'Your coins, quest completions, and test invitees were cleared')
    questDetail.value = null
    lastInvitee.value = null
    await refresh()
  }

  // ---- Automated checks --------------------------------------------------

  interface CheckResult {
    name: string
    passed: boolean
    detail: string
  }

  const checkResults = ref<CheckResult[]>([])
  const checksRunning = ref(false)

  const QUEST = {
    hydration: 'seed-quest-hydration',
    screenBreak: 'seed-quest-screen-break',
    stress: 'seed-quest-stress-check-in',
    weekly: 'seed-quest-screen-free-evening',
    once: 'seed-quest-intro-lesson',
  }

  class CheckFailed extends Error {}

  function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new CheckFailed(message)
  }

  function expectStatus(result: ApiResult, status: number) {
    check(
      result.status === status,
      `expected HTTP ${status}, got ${result.status} (${errorText(result)})`
    )
  }

  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

  async function getBalance() {
    const result = await api<{ balance: number }>('GET', '/api/coins/balance')
    expectStatus(result, 200)
    return result.data.balance
  }

  async function completeAt(questId: string, at?: string) {
    return at
      ? api('POST', `/api/dev/quests/${questId}/complete`, { now: at })
      : api('POST', `/api/quests/${questId}/complete`)
  }

  async function setQuestReward(changes: { coinAmount?: number; enabled?: boolean }) {
    expectStatus(await api('PATCH', '/api/dev/rewards/QUEST_COMPLETE', changes), 200)
  }

  const checks: { name: string; run: () => Promise<string> }[] = [
    {
      name: 'Reset test data',
      run: async () => {
        expectStatus(await api('POST', '/api/dev/reset', { restoreRewardRules: true }), 200)
        return 'coins, completions, and test invitees cleared; reward rules restored'
      },
    },
    {
      name: 'Signed-out requests are rejected (401)',
      run: async () => {
        for (const path of ['/api/coins/balance', '/api/quests', '/api/rewards']) {
          expectStatus(await api('GET', path, undefined, { signedOut: true }), 401)
        }
        expectStatus(
          await api('POST', `/api/quests/${QUEST.hydration}/complete`, undefined, {
            signedOut: true,
          }),
          401
        )
        return 'balance, quests, rewards, and quest completion all require sign-in'
      },
    },
    {
      name: 'Coin balance starts at 0 with an empty history',
      run: async () => {
        check((await getBalance()) === 0, 'balance is not 0 after reset')
        const t = await api<Transaction[]>('GET', '/api/coins/transactions')
        expectStatus(t, 200)
        check(t.data.length === 0, `expected no transactions, got ${t.data.length}`)
        return 'balance 0, no transactions'
      },
    },
    {
      name: 'Reward values are read from the database',
      run: async () => {
        const r = await api<Reward[]>('GET', '/api/rewards')
        expectStatus(r, 200)
        const by = Object.fromEntries(r.data.map((x) => [x.activityType, x]))
        check(by.individual_quest_completion?.coinAmount === 1, 'quest reward is not 1')
        check(by.qr_event_check_in?.coinAmount === 5, 'QR check-in reward is not 5')
        check(by.social_engagement?.enabled === false, 'social engagement should be disabled')
        check(by.verified_friend_referral?.coinAmount === 30, 'referral reward is not 30')
        return 'quest 1 · QR check-in 5 · social 5 (disabled) · referral 30'
      },
    },
    {
      name: 'Quests are listed with frequency, reward, and status',
      run: async () => {
        const q = await api<Quest[]>('GET', '/api/quests')
        expectStatus(q, 200)
        const ids = q.data.map((x) => x.id)
        for (const id of Object.values(QUEST)) {
          check(ids.includes(id), `seeded quest ${id} missing — run "pnpm db:seed"`)
        }
        const frequencies = new Set(q.data.map((x) => x.frequency))
        check(
          frequencies.has('daily') && frequencies.has('weekly') && frequencies.has('once'),
          'expected daily, weekly, and one-time quests'
        )
        check(
          q.data.every((x) => !x.completed && x.eligible),
          'every quest should start uncompleted and eligible'
        )
        return `${q.data.length} quests, all eligible`
      },
    },
    {
      name: 'Quest details include the reward amount; unknown ids 404',
      run: async () => {
        const d = await api<Quest>('GET', `/api/quests/${QUEST.hydration}`)
        expectStatus(d, 200)
        check(d.data.frequency === 'daily', 'hydration should be daily')
        check(d.data.rewardAmount === 1, 'hydration reward should be 1')
        expectStatus(await api('GET', '/api/quests/does-not-exist'), 404)
        expectStatus(await api('POST', '/api/quests/does-not-exist/complete'), 404)
        return 'details OK; GET and POST on an unknown id both 404'
      },
    },
    {
      name: 'Completing a quest awards coins and updates the balance',
      run: async () => {
        const c = await completeAt(QUEST.hydration)
        expectStatus(c, 200)
        check(c.data.status === 'completed', 'status is not "completed"')
        check(c.data.coinsEarned === 1, `coinsEarned is ${c.data.coinsEarned}, expected 1`)
        check(c.data.balance === 1, `balance is ${c.data.balance}, expected 1`)
        check((await getBalance()) === 1, 'GET /api/coins/balance does not show 1')
        return `+1 coin, balance 1 (period ${c.data.periodKey})`
      },
    },
    {
      name: 'The same quest cannot be completed twice in one period',
      run: async () => {
        const c = await completeAt(QUEST.hydration)
        expectStatus(c, 409)
        check((await getBalance()) === 1, 'balance changed after a rejected duplicate')
        return `409 "${errorText(c)}", balance still 1`
      },
    },
    {
      name: 'Quest list and history reflect the completion',
      run: async () => {
        const q = await api<Quest[]>('GET', '/api/quests')
        const hydration = q.data.find((x) => x.id === QUEST.hydration)
        check(
          hydration?.completed && !hydration.eligible,
          'hydration should be completed and not eligible'
        )
        const h = await api<HistoryEntry[]>('GET', '/api/quests/history')
        expectStatus(h, 200)
        check(h.data[0]?.questId === QUEST.hydration, 'newest history entry is not hydration')
        return `completed=true, eligible=false; history has ${h.data.length} entr${h.data.length === 1 ? 'y' : 'ies'}`
      },
    },
    {
      name: 'Daily quests reset the next day',
      run: async () => {
        const c = await completeAt(QUEST.hydration, hoursFromNow(36))
        expectStatus(c, 200)
        check(c.data.coinsEarned === 1, 'no coins awarded the next day')
        return `completed again in period ${c.data.periodKey}`
      },
    },
    {
      name: 'Weekly quests: once per week, again next week',
      run: async () => {
        expectStatus(await completeAt(QUEST.weekly), 200)
        expectStatus(await completeAt(QUEST.weekly), 409)
        const next = await completeAt(QUEST.weekly, hoursFromNow(24 * 7))
        expectStatus(next, 200)
        return `blocked within the week; completed again in ${next.data.periodKey}`
      },
    },
    {
      name: 'One-time quests can never be repeated',
      run: async () => {
        expectStatus(await completeAt(QUEST.once), 200)
        expectStatus(await completeAt(QUEST.once, hoursFromNow(24 * 400)), 409)
        return 'still blocked 400 days later'
      },
    },
    {
      name: 'A submission awaiting review blocks completion',
      run: async () => {
        expectStatus(
          await api('POST', `/api/dev/quests/${QUEST.stress}/submission`, { status: 'pending' }),
          200
        )
        const c = await completeAt(QUEST.stress)
        expectStatus(c, 409)
        return `409 "${errorText(c)}"`
      },
    },
    {
      name: 'A rejected submission can be completed again',
      run: async () => {
        expectStatus(
          await api('POST', `/api/dev/quests/${QUEST.screenBreak}/submission`, {
            status: 'rejected',
          }),
          200
        )
        const c = await completeAt(QUEST.screenBreak)
        expectStatus(c, 200)
        check(c.data.coinsEarned === 1, 'no coins for the redone quest')
        return 'completed after rejection, +1 coin'
      },
    },
    {
      name: 'Changing the reward in the database changes what quests pay',
      run: async () => {
        await setQuestReward({ coinAmount: 4 })
        const d = await api<Quest>('GET', `/api/quests/${QUEST.hydration}`)
        check(d.data.rewardAmount === 4, 'quest details do not show the new amount')
        const c = await completeAt(QUEST.hydration, hoursFromNow(72))
        expectStatus(c, 200)
        check(c.data.coinsEarned === 4, `coinsEarned is ${c.data.coinsEarned}, expected 4`)
        return 'set to 4 → shown as 4 → paid 4'
      },
    },
    {
      name: 'A switched-off quest reward still records the habit, for 0 coins',
      run: async () => {
        await setQuestReward({ enabled: false })
        const c = await completeAt(QUEST.hydration, hoursFromNow(120))
        await setQuestReward({ coinAmount: 1, enabled: true })
        expectStatus(c, 200)
        check(c.data.status === 'completed', 'completion was not recorded')
        check(c.data.coinsEarned === 0, `coinsEarned is ${c.data.coinsEarned}, expected 0`)
        return 'completed with 0 coins; reward restored to 1'
      },
    },
    {
      name: 'Awarding coins: duplicates with the same referenceId are ignored',
      run: async () => {
        const before = await getBalance()
        const body = { amount: 10, reason: 'Check award', referenceId: newRef('check-award') }
        const first = await api('POST', '/api/dev/coins/award', body)
        const second = await api('POST', '/api/dev/coins/award', body)
        expectStatus(first, 200)
        check(first.data.applied === true, 'first award not applied')
        check(second.data.applied === false, 'duplicate award was applied')
        check((await getBalance()) === before + 10, 'balance did not go up by exactly 10')
        return `+10 once; balance ${before} → ${before + 10}`
      },
    },
    {
      name: 'Spending coins deducts them; overspending is refused',
      run: async () => {
        const before = await getBalance()
        const spend = { amount: 3, reason: 'Check spend', referenceId: newRef('check-spend') }
        const s = await api('POST', '/api/dev/coins/spend', spend)
        expectStatus(s, 200)
        check(s.data.applied === true, 'spend not applied')
        const dup = await api('POST', '/api/dev/coins/spend', spend)
        check(dup.data.applied === false, 'duplicate spend was applied')
        const over = await api('POST', '/api/dev/coins/spend', {
          amount: before + 1000,
          reason: 'Too expensive',
          referenceId: newRef('check-overspend'),
        })
        expectStatus(over, 409)
        check((await getBalance()) === before - 3, 'balance is not exactly 3 lower')
        return `-3 once; overspend → 409 "${errorText(over)}"`
      },
    },
    {
      name: 'Transaction history is newest first, with type and reason',
      run: async () => {
        const t = await api<Transaction[]>('GET', '/api/coins/transactions')
        expectStatus(t, 200)
        const newest = t.data[0]
        check(newest?.amount === -3, 'newest transaction is not the -3 spend')
        check(newest.transactionType === 'purchase', 'spend is not typed "purchase"')
        check(newest.reason === 'Check spend', 'spend reason missing')
        const times = t.data.map((x) => new Date(x.createdAt).getTime())
        check(
          times.every((v, i) => i === 0 || times[i - 1]! >= v),
          'transactions are not newest first'
        )
        expectStatus(await api('GET', '/api/coins/transactions?limit=0'), 400)
        return `${t.data.length} transactions; bad limit → 400`
      },
    },
    {
      name: 'QR event check-in pays 5 coins, once per event',
      run: async () => {
        const body = { activityType: 'qr_event_check_in', referenceId: newRef('event') }
        const first = await api('POST', '/api/dev/rewards/grant', body)
        expectStatus(first, 200)
        check(first.data.amount === 5, `awarded ${first.data.amount}, expected 5`)
        const again = await api('POST', '/api/dev/rewards/grant', body)
        check(again.data.awarded === false, 'second check-in for the same event was paid')
        return '+5, then duplicate ignored'
      },
    },
    {
      name: 'A switched-off reward cannot be claimed (social engagement)',
      run: async () => {
        const g = await api('POST', '/api/dev/rewards/grant', {
          activityType: 'social_engagement',
          referenceId: newRef('hug'),
        })
        expectStatus(g, 409)
        return `409 "${errorText(g)}"`
      },
    },
    {
      name: 'Referral rewards: 30 coins each, capped at 3 friends',
      run: async () => {
        const paid: number[] = []
        for (let i = 0; i < 4; i++) {
          const invite = await api('POST', '/api/dev/referrals', { verified: true })
          expectStatus(invite, 200)
          const g = await api('POST', '/api/dev/rewards/grant', {
            activityType: 'verified_friend_referral',
            referenceId: invite.data.invitedUserId,
          })
          expectStatus(g, 200)
          paid.push(g.data.amount)
        }
        check(paid.join(',') === '30,30,30,0', `payouts were ${paid.join(', ')}`)
        return 'payouts: 30, 30, 30, then 0 for the 4th friend'
      },
    },
    {
      name: 'Referral rewards require a verified friend you actually invited',
      run: async () => {
        const invite = await api('POST', '/api/dev/referrals', { verified: false })
        const unverified = await api('POST', '/api/dev/rewards/grant', {
          activityType: 'verified_friend_referral',
          referenceId: invite.data.invitedUserId,
        })
        expectStatus(unverified, 400)
        const stranger = await api('POST', '/api/dev/rewards/grant', {
          activityType: 'verified_friend_referral',
          referenceId: crypto.randomUUID(),
        })
        expectStatus(stranger, 400)
        return 'unverified invitee → 400; never-invited user → 400'
      },
    },
    {
      name: 'Balance equals the sum of all transactions',
      run: async () => {
        const balanceNow = await getBalance()
        const t = await api<Transaction[]>('GET', '/api/coins/transactions?limit=100')
        const sum = t.data.reduce((total, x) => total + x.amount, 0)
        check(sum === balanceNow, `sum of transactions ${sum} ≠ balance ${balanceNow}`)
        return `balance ${balanceNow} = sum of ${t.data.length} transactions`
      },
    },
  ]

  const passedCount = computed(() => checkResults.value.filter((r) => r.passed).length)

  async function runChecks() {
    checksRunning.value = true
    checkResults.value = []

    for (const { name, run } of checks) {
      try {
        checkResults.value.push({ name, passed: true, detail: await run() })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        checkResults.value.push({ name, passed: false, detail })
        // Later checks build on earlier ones, so stop at the first failure.
        break
      }
    }

    checksRunning.value = false
    await refresh()
  }

  const formatDate = (value: string) => new Date(value).toLocaleString()
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="text-2xl font-bold">Economy & quests test console</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Dev only. Exercises the coin, reward, and quest APIs against your local database.
        </p>
      </div>
      <div class="flex items-center gap-6">
        <div class="text-right">
          <div class="text-xs tracking-wide text-gray-500 uppercase">Balance</div>
          <div class="text-3xl font-bold tabular-nums" data-testid="balance">
            {{ balance ?? '—' }}
          </div>
        </div>
        <div class="flex gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            color="neutral"
            variant="soft"
            :loading="loading"
            label="Refresh"
            @click="refresh"
          />
          <UButton
            icon="i-heroicons-trash"
            color="error"
            variant="soft"
            label="Reset my test data"
            @click="resetData"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <!-- Automated checks -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold">Automated checks</h2>
                <p class="text-sm text-gray-500">
                  Resets your test data, then walks through every feature. Stops at the first
                  failure.
                </p>
              </div>
              <UButton
                icon="i-heroicons-play"
                :loading="checksRunning"
                label="Run all checks"
                @click="runChecks"
              />
            </div>
          </template>

          <p v-if="!checkResults.length" class="text-sm text-gray-500">
            {{ checks.length }} checks ready.
          </p>
          <div v-else>
            <p
              class="mb-3 text-sm font-medium"
              :class="
                passedCount === checks.length
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-600 dark:text-gray-300'
              "
            >
              {{ passedCount }} / {{ checks.length }} passed
              <span v-if="checksRunning"> — running…</span>
            </p>
            <ul class="space-y-1.5">
              <li v-for="result in checkResults" :key="result.name" class="flex gap-2 text-sm">
                <UIcon
                  :name="result.passed ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  class="mt-0.5 h-5 w-5 shrink-0"
                  :class="result.passed ? 'text-green-500' : 'text-red-500'"
                />
                <div>
                  <span class="font-medium">{{ result.name }}</span>
                  <span
                    class="block"
                    :class="result.passed ? 'text-gray-500' : 'text-red-600 dark:text-red-400'"
                  >
                    {{ result.detail }}
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </UCard>

        <!-- Quests -->
        <UCard>
          <template #header>
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 class="font-semibold">Quests</h2>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="text-gray-500">Simulated time:</span>
                <input
                  v-model="simulatedNow"
                  type="datetime-local"
                  class="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700"
                />
                <UButton size="xs" variant="soft" label="+1 day" @click="shiftClock(1)" />
                <UButton size="xs" variant="soft" label="+7 days" @click="shiftClock(7)" />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Real time"
                  :disabled="!simulatedNow"
                  @click="simulatedNow = ''"
                />
              </div>
            </div>
          </template>

          <p v-if="simulatedNow" class="mb-3 text-sm text-amber-600 dark:text-amber-400">
            Status and "Complete" use the simulated time ({{ formatDate(nowIso!) }}).
          </p>
          <p v-if="!quests.length" class="text-sm text-gray-500">
            No quests. Run <code>pnpm db:seed</code> to add the sample quests.
          </p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-gray-500">
                <tr>
                  <th class="py-2 pr-3">Quest</th>
                  <th class="py-2 pr-3">Frequency</th>
                  <th class="py-2 pr-3">Reward</th>
                  <th class="py-2 pr-3">Status</th>
                  <th class="py-2" />
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                <tr v-for="quest in quests" :key="quest.id">
                  <td class="py-2 pr-3">
                    <div class="font-medium">{{ quest.name }}</div>
                    <div class="text-gray-500">{{ quest.description }}</div>
                  </td>
                  <td class="py-2 pr-3">{{ quest.frequency }}</td>
                  <td class="py-2 pr-3 tabular-nums">{{ quest.rewardAmount }}</td>
                  <td class="py-2 pr-3">
                    <UBadge v-if="quest.completed" color="success" variant="subtle">
                      completed
                    </UBadge>
                    <UBadge v-else-if="quest.eligible" color="primary" variant="subtle">
                      eligible
                    </UBadge>
                    <UBadge v-else color="warning" variant="subtle">blocked</UBadge>
                  </td>
                  <td class="py-2">
                    <div class="flex flex-wrap justify-end gap-1">
                      <UButton size="xs" label="Complete" @click="completeQuest(quest.id)" />
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        label="Details"
                        @click="viewQuest(quest.id)"
                      />
                      <UButton
                        size="xs"
                        color="warning"
                        variant="soft"
                        label="Mark pending"
                        @click="setSubmission(quest.id, 'pending')"
                      />
                      <UButton
                        size="xs"
                        color="warning"
                        variant="soft"
                        label="Mark rejected"
                        @click="setSubmission(quest.id, 'rejected')"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-3 flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              label="Complete a quest that doesn't exist (expect 404)"
              @click="completeQuest('does-not-exist')"
            />
          </div>

          <pre
            v-if="questDetail"
            class="mt-3 overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800"
            >{{ JSON.stringify(questDetail, null, 2) }}</pre>
        </UCard>

        <!-- Quest history -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">Quest history</h2>
          </template>
          <p v-if="!history.length" class="text-sm text-gray-500">No completed quests yet.</p>
          <table v-else class="w-full text-sm">
            <thead class="text-left text-gray-500">
              <tr>
                <th class="py-2 pr-3">Quest</th>
                <th class="py-2 pr-3">Frequency</th>
                <th class="py-2">Completed</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="(entry, i) in history" :key="i">
                <td class="py-2 pr-3">{{ entry.name }}</td>
                <td class="py-2 pr-3">{{ entry.frequency }}</td>
                <td class="py-2">{{ formatDate(entry.completedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </UCard>

        <!-- Coins -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">Coins</h2>
          </template>
          <div class="grid gap-4 md:grid-cols-2">
            <form
              v-for="kind in ['award', 'spend'] as const"
              :key="kind"
              class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-800"
              @submit.prevent="moveCoins(kind)"
            >
              <h3 class="text-sm font-medium">
                {{ kind === 'award' ? 'Award coins' : 'Spend coins' }}
              </h3>
              <UInput
                v-model.number="(kind === 'award' ? awardForm : spendForm).amount"
                type="number"
                min="0"
                placeholder="Amount"
              />
              <UInput
                v-model="(kind === 'award' ? awardForm : spendForm).reason"
                placeholder="Reason"
              />
              <div class="flex gap-2">
                <UInput
                  v-model="(kind === 'award' ? awardForm : spendForm).referenceId"
                  placeholder="referenceId"
                  class="flex-1"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  label="New id"
                  @click="
                    (kind === 'award' ? awardForm : spendForm).referenceId = newRef(
                      kind === 'award' ? 'test' : 'purchase'
                    )
                  "
                />
              </div>
              <UButton
                type="submit"
                :color="kind === 'award' ? 'success' : 'warning'"
                :label="kind === 'award' ? 'Award' : 'Spend'"
              />
              <p class="text-xs text-gray-500">
                Submitting twice with the same referenceId is ignored.
              </p>
            </form>
          </div>

          <div class="mt-4 mb-2 flex items-center justify-between">
            <h3 class="text-sm font-medium">Transactions (newest first)</h3>
            <label class="flex items-center gap-2 text-sm text-gray-500">
              limit
              <input
                v-model.number="transactionLimit"
                type="number"
                min="1"
                max="100"
                class="w-16 rounded border border-gray-300 bg-transparent px-2 py-0.5 dark:border-gray-700"
                @change="refresh"
              />
            </label>
          </div>
          <p v-if="!transactions.length" class="text-sm text-gray-500">No transactions yet.</p>
          <table v-else class="w-full text-sm">
            <thead class="text-left text-gray-500">
              <tr>
                <th class="py-2 pr-3">Amount</th>
                <th class="py-2 pr-3">Type</th>
                <th class="py-2 pr-3">Reason</th>
                <th class="py-2">Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="t in transactions" :key="t.id">
                <td
                  class="py-2 pr-3 font-medium tabular-nums"
                  :class="t.amount < 0 ? 'text-red-600' : 'text-green-600'"
                >
                  {{ t.amount > 0 ? '+' : '' }}{{ t.amount }}
                </td>
                <td class="py-2 pr-3">{{ t.transactionType }}</td>
                <td class="py-2 pr-3">{{ t.reason }}</td>
                <td class="py-2">{{ formatDate(t.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </UCard>

        <!-- Rewards -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">Reward configuration</h2>
          </template>
          <table class="w-full text-sm">
            <thead class="text-left text-gray-500">
              <tr>
                <th class="py-2 pr-3">Activity</th>
                <th class="py-2 pr-3">Coins</th>
                <th class="py-2 pr-3">Enabled</th>
                <th class="py-2" />
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="reward in rewards" :key="reward.activityType">
                <td class="py-2 pr-3">{{ reward.activityType }}</td>
                <td class="py-2 pr-3">
                  <input
                    v-if="rewardEdits[reward.activityType]"
                    v-model.number="rewardEdits[reward.activityType]!.coinAmount"
                    type="number"
                    min="0"
                    class="w-20 rounded border border-gray-300 bg-transparent px-2 py-0.5 dark:border-gray-700"
                  />
                </td>
                <td class="py-2 pr-3">
                  <input
                    v-if="rewardEdits[reward.activityType]"
                    v-model="rewardEdits[reward.activityType]!.enabled"
                    type="checkbox"
                  />
                </td>
                <td class="py-2 text-right">
                  <UButton
                    size="xs"
                    variant="soft"
                    label="Save"
                    @click="saveReward(reward.activityType)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-xs text-gray-500">
            Saving writes the reward_rules table directly — no code change. "Reset my test data"
            restores the initial values.
          </p>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <form
              class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-800"
              @submit.prevent="grantReward"
            >
              <h3 class="text-sm font-medium">Grant an activity reward</h3>
              <select
                v-model="grantForm.activityType"
                class="w-full rounded border border-gray-300 bg-transparent px-2 py-1.5 text-sm dark:border-gray-700"
              >
                <option value="qr_event_check_in">QR event check-in</option>
                <option value="social_engagement">Social engagement</option>
                <option value="individual_quest_completion">Individual quest completion</option>
              </select>
              <div class="flex gap-2">
                <UInput v-model="grantForm.referenceId" placeholder="referenceId" class="flex-1" />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  label="New id"
                  @click="grantForm.referenceId = newRef('event')"
                />
              </div>
              <UButton type="submit" label="Grant" />
            </form>

            <div class="space-y-2 rounded border border-gray-200 p-3 dark:border-gray-800">
              <h3 class="text-sm font-medium">Referrals</h3>
              <p class="text-xs text-gray-500">
                Creates a test invitee with a referral from you, then claims the reward. Only the
                first 3 verified friends pay.
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton size="sm" label="Invite verified friend" @click="inviteAndClaim(true)" />
                <UButton
                  size="sm"
                  color="warning"
                  variant="soft"
                  label="Invite unverified friend"
                  @click="inviteAndClaim(false)"
                />
                <UButton
                  v-if="lastInvitee"
                  size="sm"
                  color="neutral"
                  variant="soft"
                  label="Claim last friend again"
                  @click="claimReferral(lastInvitee)"
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Request log -->
      <div class="lg:col-span-1">
        <UCard class="lg:sticky lg:top-20">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold">Request log</h2>
              <UButton size="xs" color="neutral" variant="ghost" label="Clear" @click="log = []" />
            </div>
          </template>
          <p v-if="!log.length" class="text-sm text-gray-500">
            Requests you trigger appear here, newest first.
          </p>
          <ul v-else class="max-h-[70vh] space-y-2 overflow-y-auto">
            <li
              v-for="entry in log"
              :key="entry.id"
              class="rounded border border-gray-200 p-2 text-xs dark:border-gray-800"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono break-all">
                  <span class="font-semibold">{{ entry.method }}</span> {{ entry.path }}
                </span>
                <UBadge :color="entry.ok ? 'success' : 'error'" variant="subtle" size="sm">
                  {{ entry.status }}
                </UBadge>
              </div>
              <div class="mt-0.5 text-gray-400">{{ entry.at }}</div>
              <details class="mt-1">
                <summary class="cursor-pointer text-gray-500">body / response</summary>
                <pre
                  v-if="entry.body !== undefined"
                  class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 dark:bg-gray-800"
                  >{{ JSON.stringify(entry.body, null, 2) }}</pre>
                <pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 dark:bg-gray-800">{{
                  JSON.stringify(entry.data, null, 2)
                }}</pre>
              </details>
            </li>
          </ul>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
