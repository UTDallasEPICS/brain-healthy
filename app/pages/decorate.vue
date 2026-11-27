<script setup lang="ts">
  type RoomItem = {
    id: string
    name: string
    assetKey: string
    positionX: number | null
    positionY: number | null
    rotation: number | null
  }
  type House = { name: string; decorations: RoomItem[] }
  const { data: house, pending, error, refresh } = await useFetch<House>('/api/house')
  const room = ref<HTMLElement | null>(null)
  const dragging = ref<RoomItem | null>(null)
  const saving = ref(false)
  const message = ref('')

  function assetImage(assetKey: string) {
    const name = assetKey.split('/').pop() || 'plant-sunny'
    return `/decor/${name}.svg`
  }

  function startDrag(item: RoomItem, event: PointerEvent) {
    dragging.value = item
    room.value?.setPointerCapture(event.pointerId)
  }

  function moveItem(event: PointerEvent) {
    if (!dragging.value || !room.value) return
    const bounds = room.value.getBoundingClientRect()
    dragging.value.positionX = Math.max(
      3,
      Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100)
    )
    dragging.value.positionY = Math.max(
      8,
      Math.min(86, ((event.clientY - bounds.top) / bounds.height) * 100)
    )
  }

  async function savePosition() {
    const item = dragging.value
    dragging.value = null
    if (!item) return
    saving.value = true
    message.value = ''
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
      message.value = `${item.name} placed.`
    } catch (cause) {
      const failure = cause as { data?: { statusMessage?: string }; message?: string }
      message.value = failure.data?.statusMessage ?? failure.message ?? 'Could not save placement.'
      await refresh()
    } finally {
      saving.value = false
    }
  }
</script>

<template>
  <main class="play-page decorate-page">
    <header class="decorate-heading">
      <div>
        <p class="eyebrow">YOUR HAPPY PLACE</p>
        <h1>Decorate Room</h1>
        <p>Drag an item to find its place.</p>
      </div>
      <NuxtLink to="/inventory" class="soft-button">Back to Inventory</NuxtLink>
    </header>

    <p v-if="error" class="notice error">Room could not load. Please try again.</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>

    <section class="decorate-layout">
      <article class="room-card">
        <div class="room-heading">
          <div>
            <p class="eyebrow">YOUR ROOM</p>
            <h2>{{ house?.name ?? 'My cozy home' }}</h2>
          </div>
          <span v-if="saving" class="eyebrow">SAVING…</span>
        </div>
        <div
          ref="room"
          class="room-scene decorate-canvas"
          @pointermove="moveItem"
          @pointerup="savePosition"
          @pointercancel="savePosition"
        >
          <img
            class="room-art"
            src="/decor/cozy-room.svg"
            alt="A sunny, cozy room"
            draggable="false"
          />
          <img
            v-for="(item, index) in house?.decorations ?? []"
            :key="item.id"
            class="placed-item"
            :class="{ dragging: dragging?.id === item.id }"
            :src="assetImage(item.assetKey)"
            :style="{
              left: `${item.positionX ?? 30 + index * 16}%`,
              top: `${item.positionY ?? 65}%`,
              transform: `rotate(${item.rotation ?? 0}deg)`,
            }"
            :alt="item.name"
            :title="`${item.name} — drag to move`"
            draggable="false"
            @pointerdown.prevent="startDrag(item, $event)"
          />
          <p v-if="pending" class="room-message">Setting up your room…</p>
          <p v-else-if="!house?.decorations.length" class="room-message">
            Place decorations from your inventory to get started.
          </p>
        </div>
      </article>

      <aside class="item-tray">
        <p class="eyebrow">ITEM TRAY</p>
        <h2>{{ house?.decorations.length ?? 0 }} items in your room</h2>
        <p class="tray-hint">Choose a decoration and drag it around your room.</p>
        <div v-if="house?.decorations.length" class="tray-items">
          <div v-for="item in house.decorations" :key="item.id" class="tray-item">
            <img :src="assetImage(item.assetKey)" alt="" />
            <span>{{ item.name }}</span>
          </div>
        </div>
        <NuxtLink to="/inventory" class="primary-button">Add items from Inventory</NuxtLink>
      </aside>
    </section>

    <BottomNav active="decorate" />
  </main>
</template>
