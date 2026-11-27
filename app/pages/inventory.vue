<script setup lang="ts">
  import type { InventoryGroup } from '../types/inventory'

  type OwnedDecoration = {
    id: string
    decorationId: string
    name: string
    category: string
    assetKey: string
    description: string
    priceCoins: number
    purchasePriceCoins: number
    equipped: boolean
    acquiredAt: string | number | Date
  }

  const {
    data: inventory,
    pending,
    error,
    refresh,
  } = await useFetch<OwnedDecoration[]>('/api/decorations/inventory')
  const categories = [
    { id: 'all', label: 'All' },
    { id: 'furniture', label: 'Furniture' },
    { id: 'wall', label: 'Wall' },
    { id: 'decor', label: 'Decor' },
  ] as const
  type FilterId = (typeof categories)[number]['id']
  const activeFilter = ref<FilterId>('all')
  const selectedDecorationId = ref<string | null>(null)
  const updating = ref(false)
  const actionError = ref('')

  function filterCategory(category: string): Exclude<FilterId, 'all'> {
    const normalized = category.toLowerCase()
    if (normalized === 'furniture' || normalized === 'floor' || normalized === 'seating') {
      return 'furniture'
    }
    if (normalized === 'wall' || normalized === 'wall decor') return 'wall'
    return 'decor'
  }

  const groups = computed<InventoryGroup[]>(() => {
    const grouped = new Map<string, OwnedDecoration[]>()
    for (const item of inventory.value ?? []) {
      const copies = grouped.get(item.decorationId) ?? []
      copies.push(item)
      grouped.set(item.decorationId, copies)
    }
    return [...grouped.entries()].map(([decorationId, copies]) => {
      const first = copies[0]!
      const placedCopy = copies.find((copy) => copy.equipped)
      const unplacedCopy = copies.find((copy) => !copy.equipped)
      return {
        decorationId,
        name: first.name,
        category: first.category,
        assetKey: first.assetKey,
        count: copies.length,
        placedCount: copies.filter((copy) => copy.equipped).length,
        unplacedItemId: unplacedCopy?.id ?? null,
        placedItemId: placedCopy?.id ?? null,
      }
    })
  })

  const visibleGroups = computed(() =>
    activeFilter.value === 'all'
      ? groups.value
      : groups.value.filter((group) => filterCategory(group.category) === activeFilter.value)
  )
  const selectedGroup = computed(
    () =>
      visibleGroups.value.find((group) => group.decorationId === selectedDecorationId.value) ??
      visibleGroups.value[0] ??
      null
  )
  const emptyTileCount = computed(() => Math.max(0, 12 - visibleGroups.value.length))

  watch(
    [activeFilter, visibleGroups],
    () => {
      if (!visibleGroups.value.some((group) => group.decorationId === selectedDecorationId.value)) {
        selectedDecorationId.value = visibleGroups.value[0]?.decorationId ?? null
      }
    },
    { immediate: true }
  )

  function selectItem(item: InventoryGroup) {
    selectedDecorationId.value = item.decorationId
  }

  function errorMessage(cause: unknown) {
    const failure = cause as { data?: { statusMessage?: string }; message?: string }
    return (
      failure.data?.statusMessage ?? failure.message ?? 'Could not update that item. Try again.'
    )
  }

  async function togglePlacement(equipped: boolean) {
    if (!selectedGroup.value) return
    const itemId = equipped ? selectedGroup.value.unplacedItemId : selectedGroup.value.placedItemId
    if (!itemId) return
    updating.value = true
    actionError.value = ''
    try {
      await $fetch(`/api/house/decorations/${itemId}`, {
        method: 'PATCH',
        body: { equipped },
      })
      await Promise.all([refresh(), refreshNuxtData('/api/house')])
    } catch (cause) {
      actionError.value = errorMessage(cause)
    } finally {
      updating.value = false
    }
  }
</script>

<template>
  <main class="play-page inventory-page">
    <header class="inventory-shelf-banner">
      <span class="shelf-label">YOUR COLLECTION</span>
      <h1>Inventory</h1>
      <span class="shelf-count">{{ inventory?.length ?? 0 }} items</span>
    </header>

    <div class="inventory-content">
      <div class="inventory-filter-row" role="tablist" aria-label="Filter inventory by category">
        <button
          v-for="category in categories"
          :key="category.id"
          class="inventory-filter"
          :class="{ active: activeFilter === category.id }"
          role="tab"
          :aria-selected="activeFilter === category.id"
          @click="activeFilter = category.id"
        >
          {{ category.label }}
        </button>
      </div>

      <p v-if="error" class="notice error" role="alert">
        Inventory could not load. Refresh the page to try again.
      </p>
      <p v-else-if="actionError" class="notice error" role="alert">{{ actionError }}</p>

      <section v-if="pending" class="inventory-grid" aria-label="Loading inventory">
        <div v-for="index in 8" :key="index" class="inventory-empty-tile skeleton" />
      </section>

      <section v-else-if="!groups.length" class="inventory-empty-state">
        <div class="empty-art"><img src="/decor/plant-sunny.svg" alt="" /></div>
        <p class="eyebrow">A ROOM TO MAKE YOURS</p>
        <h2>Your collection is waiting to grow</h2>
        <p>Visit the shop to find a first little something for your room.</p>
        <NuxtLink to="/shop" class="primary-button">Visit the Shop</NuxtLink>
      </section>

      <template v-else>
        <p v-if="!visibleGroups.length" class="inventory-filter-empty">
          No items in this category yet. Try another filter or visit the
          <NuxtLink to="/shop">Shop</NuxtLink>.
        </p>
        <section class="inventory-layout" aria-label="Your decorations">
          <div class="inventory-grid" role="list">
            <InventoryItemTile
              v-for="item in visibleGroups"
              :key="item.decorationId"
              :item="item"
              :selected="selectedGroup?.decorationId === item.decorationId"
              @select="selectItem"
            />
            <div
              v-for="index in emptyTileCount"
              :key="`empty-${index}`"
              class="inventory-empty-tile"
              aria-hidden="true"
            />
          </div>

          <InventoryItemDetailCard
            v-if="selectedGroup"
            :item="selectedGroup"
            :busy="updating"
            @place="togglePlacement(true)"
            @unplace="togglePlacement(false)"
            @decorate="navigateTo('/decorate')"
          />
        </section>
        <div class="decorate-room-action">
          <NuxtLink to="/decorate" class="primary-button">Decorate Room <span>→</span></NuxtLink>
        </div>
      </template>
    </div>

    <BottomNav active="inventory" />
  </main>
</template>
