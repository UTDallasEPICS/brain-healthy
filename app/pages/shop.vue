<script setup lang="ts">
  import ShopItemTile from '../components/shop/ShopItemTile.vue'
  import type { ShopDecoration } from '../types/shop'

  const {
    data: shop,
    pending,
    error: loadError,
    refresh,
  } = await useFetch<{ coins: number; decorations: ShopDecoration[] }>('/api/decorations')
  const activeTab = ref<'home' | 'avatar'>('home')
  const selectedItem = ref<ShopDecoration | null>(null)
  const purchaseOpen = ref(false)
  const purchaseBusy = ref(false)
  const purchaseError = ref('')
  const purchaseSuccess = ref('')

  const avatarItems: ShopDecoration[] = []
  const displayedItems = computed(() =>
    activeTab.value === 'home' ? (shop.value?.decorations ?? []) : avatarItems
  )

  function selectItem(item: ShopDecoration) {
    selectedItem.value = item
    purchaseError.value = ''
    purchaseSuccess.value = ''
    purchaseOpen.value = true
  }

  function closePurchase(open: boolean) {
    purchaseOpen.value = open
    if (!open && !purchaseBusy.value) {
      purchaseError.value = ''
      purchaseSuccess.value = ''
    }
  }

  function errorText(cause: unknown) {
    const failure = cause as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    const message = failure.data?.statusMessage ?? failure.statusMessage ?? failure.message
    if (message?.toLowerCase().includes('already owned')) {
      return 'You already have this item in your inventory.'
    }
    if (message?.toLowerCase().includes('insufficient coins')) {
      return 'You don’t have enough coins for this item yet.'
    }
    return message ?? 'We couldn’t complete your purchase. Please try again.'
  }

  async function confirmPurchase() {
    if (!selectedItem.value || !shop.value || purchaseBusy.value) return
    if (shop.value.coins < selectedItem.value.priceCoins) {
      purchaseError.value = 'You don’t have enough coins for this item yet.'
      return
    }

    purchaseBusy.value = true
    purchaseError.value = ''
    try {
      await $fetch(`/api/decorations/${selectedItem.value.id}/purchase`, { method: 'POST' })
      await Promise.all([refresh(), refreshNuxtData(['/api/house', '/api/decorations/inventory'])])
      purchaseSuccess.value =
        'Your coin balance is updated and the item is ready in your inventory.'
    } catch (cause) {
      purchaseError.value = errorText(cause)
    } finally {
      purchaseBusy.value = false
    }
  }
</script>

<template>
  <main class="play-page shop-page">
    <header class="shop-banner">
      <div class="shop-scene" aria-hidden="true">
        <div class="shop-awning"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="shop-window">
          <span class="shop-window-plant">♧</span><span class="shop-window-light">✦</span>
        </div>
        <div class="shop-door"><span>OPEN</span></div>
        <span class="shop-side-plant">♣</span>
        <div class="shop-sign">SHOP</div>
      </div>
      <div class="shop-header-row">
        <div>
          <p class="eyebrow">A LITTLE PLACE TO BROWSE</p>
          <h1>Find something lovely</h1>
        </div>
        <div class="shop-balance" aria-label="Coin balance">
          <span aria-hidden="true" class="balance-coin">●</span>
          <span>{{ shop?.coins ?? 0 }}</span>
          <small>coins</small>
        </div>
      </div>
    </header>

    <div class="shop-tabs" role="tablist" aria-label="Shop categories">
      <button
        class="shop-tab"
        :class="{ active: activeTab === 'home' }"
        role="tab"
        :aria-selected="activeTab === 'home'"
        @click="activeTab = 'home'"
      >
        Home
      </button>
      <button
        class="shop-tab"
        :class="{ active: activeTab === 'avatar' }"
        role="tab"
        :aria-selected="activeTab === 'avatar'"
        @click="activeTab = 'avatar'"
      >
        Avatar
      </button>
    </div>

    <p v-if="loadError" class="notice error" role="alert">
      The shop couldn’t load. Refresh the page to try again.
    </p>

    <section v-if="activeTab === 'avatar'" class="avatar-shop-empty">
      <div class="avatar-shop-art" aria-hidden="true">✦</div>
      <p class="eyebrow">COMING SOON</p>
      <h2>Avatar accessories are on their way</h2>
      <p>For now, browse cozy decorations for your home.</p>
      <button class="soft-button" @click="activeTab = 'home'">Browse Home items</button>
    </section>

    <section v-else-if="pending" class="shop-item-grid" aria-label="Loading shop items">
      <div v-for="index in 6" :key="index" class="shop-item-skeleton skeleton" />
    </section>

    <section v-else class="shop-item-grid" aria-label="Home decorations">
      <ShopItemTile
        v-for="item in displayedItems"
        :key="item.id"
        :item="item"
        @select="selectItem"
      />
      <div v-if="!displayedItems.length" class="shop-empty-state">
        <h2>The shelves are being stocked</h2>
        <p>Check back soon for more home decorations.</p>
      </div>
    </section>

    <PurchaseModal
      :open="purchaseOpen"
      :item="selectedItem"
      :coins="shop?.coins ?? 0"
      :busy="purchaseBusy"
      :error="purchaseError"
      :success="purchaseSuccess"
      @update:open="closePurchase"
      @confirm="confirmPurchase"
    />
    <BottomNav active="shop" />
  </main>
</template>
