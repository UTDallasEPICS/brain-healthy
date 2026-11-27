<script setup lang="ts">
  import type { ShopDecoration } from '../../types/shop'

  defineProps<{
    open: boolean
    item: ShopDecoration | null
    coins: number
    busy?: boolean
    error?: string
    success?: string
  }>()
  defineEmits<{
    'update:open': [value: boolean]
    confirm: []
  }>()

  function assetImage(assetKey: string) {
    const name = assetKey.split('/').pop() || 'plant-sunny'
    return `/decor/${name}.svg`
  }
</script>

<template>
  <UModal
    :open="open"
    :title="item?.name ?? 'Purchase confirmation'"
    :description="item?.description ?? 'Confirm your shop purchase.'"
    :dismissible="!busy"
    @update:open="$emit('update:open', $event)"
  >
    <template #content>
      <section v-if="item" class="purchase-modal" aria-live="polite">
        <template v-if="success">
          <div class="purchase-success-mark" aria-hidden="true">✓</div>
          <p class="eyebrow">ALL YOURS</p>
          <h2>{{ item.name }} is in your inventory</h2>
          <p class="purchase-description">{{ success }}</p>
          <div class="purchase-actions">
            <NuxtLink to="/inventory" class="soft-button" @click="$emit('update:open', false)">
              View Inventory
            </NuxtLink>
            <button class="primary-button" @click="$emit('update:open', false)">
              Keep Shopping
            </button>
          </div>
        </template>
        <template v-else>
          <button
            class="purchase-close"
            aria-label="Close purchase confirmation"
            :disabled="busy"
            @click="$emit('update:open', false)"
          >
            ×
          </button>
          <div class="purchase-art"><img :src="assetImage(item.assetKey)" :alt="item.name" /></div>
          <p class="eyebrow">A LITTLE SOMETHING FOR HOME</p>
          <h2>Bring home {{ item.name }}?</h2>
          <p class="purchase-description">{{ item.description }}</p>
          <div class="purchase-price-row">
            <span>Price</span><strong>{{ item.priceCoins }} coins</strong>
          </div>
          <div class="purchase-price-row balance-row">
            <span>Your balance</span><strong>{{ coins }} coins</strong>
          </div>
          <p v-if="coins < item.priceCoins" class="purchase-error" role="alert">
            You don’t have enough coins for this item yet.
          </p>
          <p v-else-if="error" class="purchase-error" role="alert">{{ error }}</p>
          <div class="purchase-actions">
            <button class="soft-button" :disabled="busy" @click="$emit('update:open', false)">
              Cancel
            </button>
            <button
              class="primary-button"
              :disabled="busy || coins < item.priceCoins"
              @click="$emit('confirm')"
            >
              {{ busy ? 'Buying…' : `Buy for ${item.priceCoins} coins` }}
            </button>
          </div>
        </template>
      </section>
    </template>
  </UModal>
</template>
