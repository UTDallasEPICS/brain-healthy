<script setup lang="ts">
  const props = withDefaults(defineProps<{ label: string; color?: Tone }>(), { color: 'yellow' })
</script>

<template>
  <span
    :class="[
      'inline-block rounded-full border-2 px-3 py-0.5 text-xs font-bold',
      TONES[props.color],
    ]"
  >
    {{ label }}
  </span>
</template>
