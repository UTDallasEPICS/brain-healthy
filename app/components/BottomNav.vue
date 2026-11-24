<script setup lang="ts">
  defineProps<{ active: 'home' | 'shop' | 'inventory' | 'decorate' }>()
</script>

<template>
  <nav class="bottom-nav" aria-label="Main navigation">
    <NuxtLink to="/" class="nav-link" :class="{ active: active === 'home' }"
      ><span>⌂</span>Home</NuxtLink
    >
    <NuxtLink to="/shop" class="nav-link" :class="{ active: active === 'shop' }"
      ><span>◇</span>Shop</NuxtLink
    >
    <NuxtLink
      to="/inventory"
      class="nav-link"
      :class="{ active: active === 'inventory' || active === 'decorate' }"
      ><span>▦</span>Inventory</NuxtLink
    >
  </nav>
</template>
