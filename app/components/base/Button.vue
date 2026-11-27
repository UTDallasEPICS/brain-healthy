<script setup lang="ts">
  const props = withDefaults(
    defineProps<{ color?: 'green' | 'yellow' | 'gray' | 'purple' | 'cream' }>(),
    { color: 'green' }
  )

  const colors = {
    green: 'bg-leaf hover:bg-leaf/85',
    yellow: 'bg-sun hover:bg-sun/85',
    gray: 'bg-cloud hover:bg-cloud/85',
    purple: 'bg-grape hover:bg-grape/85',
    cream: 'bg-cream hover:bg-cream/85',
  }
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    :class="[
      'border-ink text-ink rounded-full border-2 px-5 py-1.5 font-bold shadow-[0_3px_0_var(--color-ink)] active:translate-y-[3px] active:shadow-none',
      colors[props.color],
    ]"
  />
</template>