<script setup lang="ts">
  const open = defineModel<boolean>('open', { default: false })

  const props = withDefaults(
    defineProps<{ title: string; color?: 'blue' | 'navy' | 'green' | 'purple' }>(),
    { color: 'blue' }
  )

  const colors = {
    blue: 'bg-sky',
    navy: 'bg-navy',
    green: 'bg-leaf-dark',
    purple: 'bg-grape',
  }
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="title"
    :close="{
      color: 'neutral',
      variant: 'ghost',
      class:
        'border-outline bg-surface text-fg hover:bg-blush hover:text-ink rounded-full border-2',
    }"
    :ui="{
      content:
        'border-outline bg-surface text-fg max-w-sm divide-y-0 overflow-hidden rounded-2xl border-2 ring-0',
      header: `border-outline min-h-0 border-b-2 px-4 py-3 ${colors[props.color]}`,
      wrapper: 'flex-1 px-8 text-center',
      title: 'text-cream font-bold',
      description: 'sr-only',
      close: 'top-2.5',
      body: 'p-5 text-center',
      footer: 'justify-center gap-3 border-t-0 px-5 pt-0 pb-5',
    }"
  >
    <template #body>
      <slot />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UModal>
</template>
