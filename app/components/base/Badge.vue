<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      label: string
      color?: 'yellow' | 'blue' | 'purple' | 'gray' | 'pink' | 'green'
    }>(),
    { color: 'yellow' }
  )

  const colors = {
    yellow: 'bg-sun-light',
    blue: 'bg-sky',
    purple: 'bg-grape',
    gray: 'bg-cloud',
    pink: 'bg-blush',
    green: 'bg-leaf',
  }
</script>

<template>
  <span
    :class="[
      'border-ink text-ink inline-block rounded-full border-2 px-3 py-0.5 text-xs font-bold',
      colors[props.color],
    ]"
  >
    {{ label }}
  </span>
</template>