<script setup lang="ts">
  const colorMode = useColorMode()
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
      <NuxtLink to="/" class="brand">Brain Garden</NuxtLink>
      <button class="theme-toggle" aria-label="Toggle Theme" @click="isDark = !isDark">
        {{ isDark ? '☾' : '☼' }}
      </button>
    </header>
    <NuxtPage />
  </UApp>
</template>
