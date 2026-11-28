<script setup lang="ts">
  const props = withDefaults(defineProps<{ color?: 'lavender' | 'cream' | 'white' | 'gray' }>(), {
    color: 'lavender',
  })

  // Colour names match the light-mode design; each maps to a theme token.
  const colors = {
    lavender: 'bg-surface-alt',
    cream: 'bg-surface',
    white: 'bg-surface-raised',
    gray: 'bg-surface-muted',
  }
</script>

<template>
  <div :class="['border-outline text-fg rounded-2xl border-2 p-4', colors[props.color]]">
    <slot />
  </div>
</template>
