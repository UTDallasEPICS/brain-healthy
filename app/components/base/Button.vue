<script setup lang="ts">
  const props = withDefaults(
    defineProps<{ color?: 'green' | 'yellow' | 'gray' | 'purple' | 'cream' }>(),
    { color: 'green' }
  )

  // Each colour sets the fill (--btn) and its text colour. Accent fills stay
  // vivid in both themes with ink text; the neutral ones follow the theme.
  const colors = {
    green: '[--btn:var(--color-leaf)] text-ink',
    yellow: '[--btn:var(--color-sun)] text-ink',
    purple: '[--btn:var(--color-grape)] text-ink',
    gray: '[--btn:var(--color-surface-muted)] text-fg',
    cream: '[--btn:var(--color-surface)] text-fg',
  }
</script>

<template>
  <!--
    The fill is re-applied on active/disabled-hover because Nuxt UI's neutral
    ghost variant would otherwise swap it for its own grey (on press) or for
    transparent (hovering a disabled button), which hides ink text in dark mode.
  -->
  <UButton
    color="neutral"
    variant="ghost"
    :class="[
      'border-outline cursor-pointer rounded-full border-2 bg-(--btn) px-5 py-1.5 font-bold shadow-[0_3px_0_var(--color-outline)]',
      'hover:bg-(--btn)/85 active:translate-y-[3px] active:bg-(--btn) active:shadow-none',
      'hover:disabled:bg-(--btn) hover:aria-disabled:bg-(--btn) dark:hover:disabled:bg-(--btn) dark:hover:aria-disabled:bg-(--btn)',
      colors[props.color],
    ]"
  />
</template>
