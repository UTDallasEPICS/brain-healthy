<script setup lang="ts">
  const text = defineModel<string>({ default: '' })

  defineProps<{
    label: string
    placeholder?: string
    icon?: string
    multiline?: boolean
  }>()

  const boxStyle =
    'border-outline text-fg bg-field rounded-xl border-2 ring-0 placeholder:text-fg/50'
</script>

<template>
  <UFormField :label="label" :ui="{ label: 'font-bold' }">
    <UTextarea
      v-if="multiline"
      v-model="text"
      :placeholder="placeholder"
      :rows="3"
      class="w-full"
      :ui="{ base: boxStyle }"
    />
    <UInput
      v-else
      v-model="text"
      :placeholder="placeholder"
      :leading-icon="icon"
      size="lg"
      class="w-full"
      :ui="{ base: boxStyle, leadingIcon: 'text-fg' }"
    />
  </UFormField>
</template>
