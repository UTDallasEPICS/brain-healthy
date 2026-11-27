<script setup lang="ts">
  const checked = defineModel<boolean>({ default: false })

  defineProps<{ label: string; disabled?: boolean }>()
</script>

<template>
  <UCheckbox
    v-model="checked"
    :label="label"
    :disabled="disabled"
    size="xl"
    :ui="{
      base: 'border-ink rounded-md border-2 bg-white ring-0',
      indicator: 'bg-leaf',
      icon: 'text-ink',
      label: checked ? 'font-bold line-through opacity-60' : 'font-bold',
    }"
  />
</template>