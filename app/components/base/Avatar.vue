<script setup lang="ts">
  const props = withDefaults(
    defineProps<{ name: string; src?: string; size?: 'sm' | 'md' | 'lg' }>(),
    { src: undefined, size: 'md' }
  )

  const sizes = {
    sm: 'size-8 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-20 text-2xl',
  }

  const initials = computed(() =>
    props.name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase()
  )
</script>

<template>
  <div
    :class="[
      'border-ink bg-lavender text-ink grid shrink-0 place-items-center overflow-hidden rounded-full border-2 font-bold',
      sizes[props.size],
    ]"
  >
    <img v-if="src" :src="src" :alt="name" class="size-full object-cover" />
    <span v-else :aria-label="name">{{ initials }}</span>
  </div>
</template>