<script setup lang="ts">
defineProps<{ active: 'home' | 'avatar' | 'friends' | 'quests' | 'shop' | 'inventory' | 'decorate' | 'lessons' }>()
const links = [
  { to: '/', key: 'home', icon: '⌂', label: 'Home' },
  { to: '/avatar', key: 'avatar', icon: '✿', label: 'Avatar' },
  { to: '/friends', key: 'friends', icon: '♧', label: 'Friends' },
  { to: '/quests', key: 'quests', icon: '☷', label: 'Quests' },
  { to: '/shop', key: 'shop', icon: '⬡', label: 'Shop' },
]
</script>
<template>
  <nav class="bottom-nav" aria-label="Main navigation">
    <NuxtLink v-for="link in links" :key="link.key" :to="link.to" class="nav-link" :class="{ active: active === link.key || (['inventory', 'decorate'].includes(active) && link.key === 'shop') }" :aria-label="link.label" :aria-current="active === link.key ? 'page' : undefined">
      <span aria-hidden="true">{{ link.icon }}</span><small>{{ link.label }}</small>
    </NuxtLink>
  </nav>
</template>
