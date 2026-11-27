<script setup lang="ts">
  import type { ShopDecoration } from '../../types/shop'

  defineProps<{
    item: ShopDecoration
    selected?: boolean
  }>()
  defineEmits<{ select: [item: ShopDecoration] }>()

  function assetImage(assetKey: string) {
    const name = assetKey.split('/').pop() || 'plant-sunny'
    return `/decor/${name}.svg`
  }
</script>

<template>
  <button
    class="shop-item-tile"
    :class="{ selected }"
    :aria-label="`${item.name}, ${item.priceCoins} coins`"
    @click="$emit('select', item)"
  >
    <span class="shop-item-art"><img :src="assetImage(item.assetKey)" :alt="item.name" /></span>
    <span class="shop-tile-name">{{ item.name }}</span>
    <span class="shop-tile-price">{{ item.priceCoins }} <span aria-hidden="true">coins</span></span>
  </button>
</template>
