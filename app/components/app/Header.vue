<script setup lang="ts">
  const route = useRoute()
  const colorMode = useColorMode()
  const isDev = import.meta.dev

  const title = computed(() => {
    if (route.meta.title) return String(route.meta.title)
    const section = route.path.split('/')[1]
    return section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Home'
  })

  // Loads the shared balance (see composables/useCoinBalance.ts). The header
  // stays mounted across pages, so re-read it on every navigation too.
  const { refresh: refreshBalance } = await useFetch<{ balance: number }>('/api/coins/balance', {
    key: COIN_BALANCE_KEY,
  })
  const { balance } = useCoinBalance()
  watch(
    () => route.fullPath,
    () => refreshBalance()
  )

  // Shared look for the round header buttons (test console, theme, shop) so
  // they all get the same pointer cursor and hover lift.
  const iconButton =
    'border-outline bg-surface text-fg grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:-translate-y-0.5'
  function toggleTheme() {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  }
</script>

<template>
  <header
    class="mx-auto flex w-full max-w-[1120px] items-center gap-1.5 px-3 pt-5 pb-3 sm:gap-2 sm:px-4"
  >
    <h1
      class="border-outline text-fg bg-surface-title min-w-0 truncate rounded-md border-2 px-3 py-1.5 text-center text-xl shadow-[2px_3px_0_var(--color-shadow)] sm:min-w-30 sm:px-4"
    >
      {{ title }}
    </h1>

    <div class="flex-1" />

    <NuxtLink v-if="isDev" to="/dev/economy" aria-label="Test console" :class="iconButton">
      <UIcon name="i-lucide-flask-conical" class="size-5" />
    </NuxtLink>

    <button type="button" aria-label="Toggle Theme" :class="iconButton" @click="toggleTheme">
      <ClientOnly>
        <UIcon
          :name="colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
          class="size-5"
        />
        <template #fallback>
          <UIcon name="i-lucide-sun" class="size-5" />
        </template>
      </ClientOnly>
    </button>

    <NuxtLink to="/shop" aria-label="Shop" :class="iconButton">
      <UIcon name="i-lucide-store" class="size-6" />
    </NuxtLink>

    <div
      class="border-outline bg-surface text-fg flex items-center gap-1.5 rounded-full border-2 py-1.5 pr-3 pl-2 font-bold whitespace-nowrap tabular-nums"
      :aria-label="formatCoins(balance)"
      data-testid="coin-balance"
    >
      <UIcon name="i-lucide-piggy-bank" class="text-blush size-6" />
      {{ formatCoins(balance) }}
    </div>
  </header>
</template>
