<script setup lang="ts">
  const route = useRoute()
  const colorMode = useColorMode()
  const isDev = import.meta.dev

  const title = computed(() => {
    if (route.meta.title) return String(route.meta.title)
    const section = route.path.split('/')[1]
    return section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Home'
  })

  const { data: coins } = await useFetch('/api/coins/balance', { key: 'coin-balance' })

  function toggleTheme() {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  }
</script>

<template>
  <header class="mx-auto flex w-full max-w-[1120px] items-center gap-2 px-4 pt-5 pb-3">
    <h1
      class="border-ink text-ink min-w-30 rounded-md border-2 bg-[#f1f1f4] px-4 py-1.5 text-center text-xl shadow-[2px_3px_0_rgba(30,42,90,0.25)]"
    >
      {{ title }}
    </h1>

    <div class="flex-1" />

    <NuxtLink
      v-if="isDev"
      to="/dev/economy"
      aria-label="Test console"
      class="border-ink bg-cream text-ink grid size-10 place-items-center rounded-full border-2"
    >
      <UIcon name="i-lucide-flask-conical" class="size-5" />
    </NuxtLink>

    <button
      type="button"
      aria-label="Toggle Theme"
      class="border-ink bg-cream text-ink grid size-10 place-items-center rounded-full border-2"
      @click="toggleTheme"
    >
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

    <NuxtLink
      to="/shop"
      aria-label="Shop"
      class="border-ink bg-cream text-ink grid size-10 place-items-center rounded-full border-2 transition-transform hover:-translate-y-0.5"
    >
      <UIcon name="i-lucide-store" class="size-6" />
    </NuxtLink>

    <div
      class="border-ink bg-cream text-ink flex items-center gap-1.5 rounded-full border-2 py-1.5 pr-3 pl-2 font-bold tabular-nums"
      :aria-label="`${coins?.balance ?? 0} coins`"
    >
      <UIcon name="i-lucide-piggy-bank" class="text-blush size-6" />
      {{ coins?.balance ?? 0 }}
    </div>
  </header>
</template>
