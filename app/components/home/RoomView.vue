<script setup lang="ts">
  interface RoomDecoration {
    id: string
    name: string
    assetKey: string
    positionX: number | null
    positionY: number | null
    rotation: number | null
  }

  withDefaults(defineProps<{ decorations?: RoomDecoration[]; roomAsset?: string }>(), {
    decorations: () => [],
    roomAsset: 'decor/cozy-room',
  })

  function imageFor(assetKey: string) {
    return `/${assetKey}.svg`
  }
</script>

<template>
  <div class="border-outline relative aspect-[9/5] w-full overflow-hidden rounded-2xl border-2">
    <img :src="imageFor(roomAsset)" alt="Your room" class="absolute inset-0 size-full" />
    <img
      v-for="item in decorations"
      :key="item.id"
      :src="imageFor(item.assetKey)"
      :alt="item.name"
      class="absolute w-[15%]"
      :style="{
        left: `${item.positionX ?? 50}%`,
        top: `${item.positionY ?? 50}%`,
        transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
      }"
    />
    <div class="absolute top-[72%] left-1/2 w-[13%] -translate-x-1/2 -translate-y-1/2">
      <slot name="avatar" />
    </div>
  </div>
</template>
