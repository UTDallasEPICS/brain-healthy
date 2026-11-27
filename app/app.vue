<script setup lang="ts">
  const colorMode = useColorMode()
  const isDev = import.meta.dev
  const isDark = computed({
    get: () => colorMode.value === 'dark',
    set: () => {
      colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
    },
  })
</script>

<template>
  <UApp>
    <header class="site-header">
      <NuxtLink to="/" class="brand">Belonging Blocks</NuxtLink>
      <nav class="header-actions">
        <NuxtLink to="/lessons" class="header-link">Lessons</NuxtLink>
        <!-- Dev-only test console for coins, rewards, and quests. -->
        <NuxtLink v-if="isDev" to="/dev/economy" class="header-link">Test console</NuxtLink>
        <button class="theme-toggle" aria-label="Toggle Theme" @click="isDark = !isDark">
          {{ isDark ? '☾' : '☼' }}
        </button>
      </nav>
    </header>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>