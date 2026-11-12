<script setup lang="ts">
  const { data: lessons } = await useFetch('/api/lessons')

  const current = computed(() => lessons.value?.find((lesson) => !lesson.completed))
  const others = computed(() => lessons.value?.filter((lesson) => lesson !== current.value) ?? [])
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Lessons</h1>
      <UButton to="/lessons/completed" variant="ghost" label="Completed lessons" />
    </div>

    <UCard v-if="current">
      <p class="text-primary-500 text-sm font-semibold">Current lesson</p>
      <h2 class="mt-1 text-xl font-bold">{{ current.title }}</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">{{ current.description }}</p>
      <UButton :to="`/lessons/${current.id}`" class="mt-4" label="Start lesson" />
    </UCard>
    <UCard v-else>
      <p>You've completed every lesson. Nice work!</p>
    </UCard>

    <div v-if="others.length" class="space-y-2">
      <h2 class="font-semibold">All lessons</h2>
      <NuxtLink
        v-for="lesson in others"
        :key="lesson.id"
        :to="`/lessons/${lesson.id}`"
        class="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
      >
        <span>{{ lesson.title }}</span>
        <UBadge v-if="lesson.completed" color="success" variant="subtle" label="Completed" />
      </NuxtLink>
    </div>
  </UContainer>
</template>
