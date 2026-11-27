<script setup lang="ts">
  const props = withDefaults(defineProps<{ color?: 'lavender' | 'cream' | 'white' | 'gray' }>(), {
    color: 'lavender',
  })

  const colors = {
    lavender: 'bg-lavender',
    cream: 'bg-cream',
    white: 'bg-white',
    gray: 'bg-cloud',
  }
</script>

<template>
  <div :class="['border-ink text-ink rounded-2xl border-2 p-4', colors[props.color]]">
    <slot />
  </div>
</template>