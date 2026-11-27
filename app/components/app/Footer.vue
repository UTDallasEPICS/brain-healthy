<script setup lang="ts">
  const links = [
    { label: 'Home', to: '/', icon: 'i-lucide-house' },
    { label: 'Avatar', to: '/avatar', icon: 'i-lucide-sun' },
    { label: 'Friends', to: '/friends', icon: 'i-lucide-users' },
    { label: 'Quests', to: '/quests', icon: 'i-lucide-clipboard-list' },
    { label: 'Inventory', to: '/inventory', icon: 'i-lucide-box' },
  ]

  const route = useRoute()
  function isActive(to: string) {
    return to === '/' ? route.path === '/' : route.path.startsWith(to)
  }
</script>

<template>
  <nav aria-label="Main navigation" class="sticky bottom-0 z-30 px-3 pb-3">
    <ul
      class="mx-auto flex max-w-md justify-around rounded-3xl border-2 border-ink bg-navy px-2 py-3"
    >
      <li v-for="link in links" :key="link.to">
        <NuxtLink
          :to="link.to"
          :aria-label="link.label"
          :aria-current="isActive(link.to) ? 'page' : undefined"
          class="grid size-11 place-items-center rounded-full border-2 transition-transform hover:-translate-y-0.5"
          :class="
            isActive(link.to)
              ? 'border-ink bg-sun text-ink'
              : 'border-transparent bg-navy-light text-cream'
          "
        >
          <UIcon :name="link.icon" class="size-6" />
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>