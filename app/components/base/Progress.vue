<script setup lang="ts">
  const props = withDefaults(
    defineProps<{ value: number; max?: number; color?: 'green' | 'blue' }>(),
    { max: 100, color: 'green' }
  )

  const percent = computed(() =>
    Math.min(100, Math.max(0, Math.round((props.value / props.max) * 100)))
  )
</script>

<template>
  <div
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    :aria-valuemax="max"
    class="border-outline bg-field h-3.5 w-full overflow-hidden rounded-full border-2"
  >
    <div
      :class="['h-full transition-all', color === 'green' ? 'bg-leaf' : 'bg-sky']"
      :style="{ width: `${percent}%` }"
    />
  </div>
</template>
