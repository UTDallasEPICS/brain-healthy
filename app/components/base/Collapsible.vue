<script setup lang="ts">
  const open = defineModel<boolean>('open', { default: false })

  defineProps<{ title: string; preview?: string; icon?: string }>()
</script>

<template>
  <UCollapsible
    v-model:open="open"
    class="border-ink bg-cream text-ink rounded-2xl border-2"
    :ui="{ content: 'px-4 pb-4' }"
  >
    <button type="button" class="flex w-full items-center gap-3 p-4 text-left">
      <UIcon v-if="icon" :name="icon" class="size-5 shrink-0" />
      <span class="min-w-0 flex-1">
        <span class="block font-bold">{{ title }}</span>
        <span v-if="preview && !open" class="block truncate text-sm opacity-70">
          {{ preview }}
        </span>
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        :class="['size-5 shrink-0 transition-transform', open ? 'rotate-180' : '']"
      />
    </button>
    <template #content>
      <slot />
    </template>
  </UCollapsible>
</template>