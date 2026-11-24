<script setup lang="ts">
  import type { InventoryGroup } from '../../types/inventory'

  defineProps<{
    item: InventoryGroup
    busy?: boolean
  }>()
  defineEmits<{
    place: []
    unplace: []
    decorate: []
  }>()

  function assetImage(assetKey: string) {
    const file = assetKey.split('/').pop() || 'plant-sunny'
    return `/decor/${file}.svg`
  }

  function categoryName(category: string) {
    const key = category.toLowerCase()
    if (key === 'floor') return 'Floor item'
    if (key === 'wall') return 'Wall item'
    if (key === 'lighting') return 'Lighting item'
    if (key === 'furniture') return 'Furniture'
    return `${key.charAt(0).toUpperCase()}${key.slice(1)} item`
  }
</script>

<template>
  <article class="item-detail-card">
    <div class="detail-art"><img :src="assetImage(item.assetKey)" :alt="item.name" /></div>
    <div class="detail-copy">
      <p class="eyebrow">SELECTED ITEM</p>
      <h2>{{ item.name }}</h2>
      <p class="detail-status">
        {{ categoryName(item.category) }} ·
        {{
          !item.placedCount
            ? 'not placed'
            : item.placedCount === item.count
              ? 'placed in room'
              : `${item.placedCount} of ${item.count} placed`
        }}
      </p>
      <p v-if="item.count > 1" class="detail-quantity">You own {{ item.count }} copies</p>
      <div class="detail-actions">
        <button
          v-if="item.unplacedItemId"
          class="primary-button"
          :disabled="busy"
          @click="$emit('place')"
        >
          {{ busy ? 'Updating…' : 'Place in Room' }}
        </button>
        <button
          v-if="item.placedItemId"
          class="soft-button"
          :disabled="busy"
          @click="$emit('unplace')"
        >
          Unplace
        </button>
        <button class="soft-button" @click="$emit('decorate')">Decorate Room</button>
      </div>
    </div>
  </article>
</template>
