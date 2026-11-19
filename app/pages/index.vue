<script setup lang="ts">
  type HouseItem = {
    id: string
    name: string
    assetKey: string
    positionX: number | null
    positionY: number | null
    rotation: number | null
  }
  type House = { name: string; coins: number; decorations: HouseItem[] }
  type OwnedDecoration = { id: string; name: string; assetKey: string; equipped: boolean }
  const { data: house, pending, error, refresh: refreshHouse } = await useFetch<House>('/api/house')
  const { data: inventory, refresh: refreshInventory } = await useFetch<OwnedDecoration[]>(
    '/api/decorations/inventory'
  )
  const placing = ref<string | null>(null)
  const placementNotice = ref('')
  const roomElement = ref<HTMLElement | null>(null)
  const dragging = ref<HouseItem | null>(null)
  function assetImage(assetKey: string) {
    const file =
      assetKey === 'decor/plant-sunny'
        ? 'plant-sunny'
        : assetKey === 'decor/lamp-reading'
          ? 'lamp-reading'
          : assetKey === 'decor/rug-cloud'
            ? 'rug-cloud'
            : 'plant-sunny'
    return `/decor/${file}.svg`
  }
  const CLAMP = { minX: 4, maxX: 96, minY: 10, maxY: 90 }
  let grabOffset = { x: 0, y: 0 }
  let pendingMove: PointerEvent | null = null
  let frame = 0
  function pointerToPercent(event: PointerEvent) {
    const el = roomElement.value
    if (!el) return null
    // Absolute children are positioned inside the border, so measure from the padding box.
    const bounds = el.getBoundingClientRect()
    const left = bounds.left + el.clientLeft
    const top = bounds.top + el.clientTop
    return {
      x: ((event.clientX - left) / el.clientWidth) * 100,
      y: ((event.clientY - top) / el.clientHeight) * 100,
    }
  }
  function applyDrag() {
    frame = 0
    const event = pendingMove
    pendingMove = null
    if (!event || !dragging.value) return
    const point = pointerToPercent(event)
    if (!point) return
    dragging.value.positionX = Math.max(CLAMP.minX, Math.min(CLAMP.maxX, point.x - grabOffset.x))
    dragging.value.positionY = Math.max(CLAMP.minY, Math.min(CLAMP.maxY, point.y - grabOffset.y))
  }
  function showDragPosition(event: PointerEvent) {
    if (!dragging.value) return
    pendingMove = event
    if (!frame) frame = requestAnimationFrame(applyDrag)
  }
  function startDrag(item: HouseItem, event: PointerEvent) {
    const index = house.value?.decorations.findIndex((d) => d.id === item.id) ?? 0
    const x = item.positionX ?? 28 + index * 17
    const y = item.positionY ?? 68
    item.positionX = x
    item.positionY = y
    const point = pointerToPercent(event)
    // Keep the item under the cursor exactly where it was grabbed (no jump).
    grabOffset = point ? { x: point.x - x, y: point.y - y } : { x: 0, y: 0 }
    dragging.value = item
    roomElement.value?.setPointerCapture(event.pointerId)
  }
  async function finishDrag() {
    if (frame) {
      cancelAnimationFrame(frame)
      applyDrag()
    }
    const item = dragging.value
    dragging.value = null
    if (!item) return
    placing.value = item.id
    placementNotice.value = ''
    try {
      await $fetch(`/api/house/decorations/${item.id}`, {
        method: 'PATCH',
        body: {
          equipped: true,
          positionX: item.positionX,
          positionY: item.positionY,
          rotation: item.rotation ?? 0,
        },
      })
    } catch (cause) {
      placementNotice.value = errorText(cause, 'Could not save that position.')
      await refreshHouse()
    } finally {
      placing.value = null
    }
  }
  function errorText(cause: unknown, fallback: string) {
    const failure = cause as { data?: { statusMessage?: string }; message?: string }
    return failure?.data?.statusMessage ?? failure?.message ?? fallback
  }
  async function toggleDecoration(item: OwnedDecoration) {
    placing.value = item.id
    placementNotice.value = ''
    try {
      await $fetch(`/api/house/decorations/${item.id}`, {
        method: 'PATCH',
        body: { equipped: !item.equipped },
      })
      await Promise.all([refreshInventory(), refreshHouse()])
    } catch (cause) {
      placementNotice.value = errorText(cause, 'Could not update your home. Please try again.')
    } finally {
      placing.value = null
    }
  }
</script>

<template>
  <main class="play-page home-page">
    <section class="welcome">
      <span class="coin-pill">{{ house?.coins ?? 0 }} coins</span>
      <p class="eyebrow">A LITTLE SPACE TO GROW</p>
      <h1>Welcome home<span>.</span></h1>
      <p>Your cozy corner is ready whenever you are.</p>
    </section>
    <p v-if="error" class="notice error">Your home could not load. Please refresh and try again.</p>
    <p v-if="placementNotice" class="notice error" role="alert">{{ placementNotice }}</p>
    <section class="home-layout">
      <article class="room-card">
        <div class="room-heading">
          <div>
            <p class="eyebrow">YOUR HAPPY PLACE</p>
            <h2>{{ house?.name ?? 'My cozy home' }}</h2>
          </div>
          <span class="sun-mark">☀️</span>
        </div>
        <div
          ref="roomElement"
          class="room-scene"
          :aria-label="`${house?.name ?? 'Home'} room`"
          @pointermove="showDragPosition"
          @pointerup="finishDrag"
          @pointercancel="finishDrag"
        >
          <img
            class="room-art"
            src="/decor/cozy-room.svg"
            alt="A sunny, cozy room illustration"
            draggable="false"
          />
          <img
            v-for="(item, index) in house?.decorations ?? []"
            :key="item.id"
            class="placed-item"
            :class="{ dragging: dragging?.id === item.id }"
            :src="assetImage(item.assetKey)"
            :style="{
              left: `${item.positionX ?? 28 + index * 17}%`,
              top: `${item.positionY ?? 68}%`,
              transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
            }"
            :alt="item.name"
            :title="`${item.name} — drag to move`"
            draggable="false"
            @pointerdown.prevent="startDrag(item, $event)"
          />
          <div
            v-if="dragging"
            class="drop-marker"
            :style="{ left: `${dragging.positionX}%`, top: `${dragging.positionY}%` }"
            aria-hidden="true"
          />
          <p class="room-message">
            {{ pending ? 'Getting your room ready…' : 'A calm place, just for you' }}
          </p>
        </div>
        <NuxtLink to="/shop" class="primary-button decorate-button"
          >✧ &nbsp; Visit the Shop</NuxtLink
        >
      </article>
      <aside class="home-aside">
        <article class="side-card">
          <span class="side-icon">✨</span>
          <p class="eyebrow">YOUR COLLECTION</p>
          <h2>
            {{ inventory?.length ?? 0 }} cozy {{ inventory?.length === 1 ? 'thing' : 'things' }}
          </h2>
          <p>Little touches make a space feel like yours.</p>
        </article>
        <article class="side-card soft-side">
          <span class="side-icon">🌿</span>
          <p class="eyebrow">TAKE A BREATH</p>
          <h2>You’re growing at your own pace.</h2>
          <p>Small steps count. Come back whenever you’re ready.</p>
        </article>
      </aside>
    </section>
    <section v-if="inventory?.length" class="inventory-panel">
      <p class="eyebrow">YOUR THINGS</p>
      <h2>Make this space yours</h2>
      <div class="inventory-list">
        <div v-for="item in inventory" :key="item.id" class="inventory-item">
          <img :src="assetImage(item.assetKey)" alt="" /><strong>{{ item.name }}</strong
          ><button
            class="soft-button"
            :disabled="placing === item.id"
            @click="toggleDecoration(item)"
          >
            {{ item.equipped ? 'Put away' : 'Place in home' }}
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
