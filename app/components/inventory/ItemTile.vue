<script setup lang="ts">
  import type { InventoryGroup } from '../../types/inventory'

  defineProps<{
    item: InventoryGroup
    selected?: boolean
  }>()
  defineEmits<{ select: [item: InventoryGroup] }>()

  function assetImage(assetKey: string) {
    const file = assetKey.split('/').pop() || 'plant-sunny'
    return `/decor/${file}.svg`
  }
</script>

<template>
  <button
    class="inventory-tile"
    :class="{ selected }"
    :aria-pressed="selected"
    :aria-label="`${item.name}, quantity ${item.count}${item.placedCount ? ', placed' : ''}`"
    @click="$emit('select', item)"
  >
    <span class="tile-quantity">×{{ item.count }}</span>
    <span v-if="item.placedCount" class="tile-placed" aria-label="Placed">✓</span>
    <img :src="assetImage(item.assetKey)" :alt="item.name" />
    <span class="tile-name">{{ item.name }}</span>
  </button>
</template>
