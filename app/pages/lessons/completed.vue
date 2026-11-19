<script setup lang="ts">
  const { data: lessons } = await useFetch('/api/lessons')

  const completed = computed(() => lessons.value?.filter((lesson) => lesson.completed) ?? [])
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Completed lessons</h1>
      <UButton to="/lessons" variant="ghost" label="Back to lessons" />
    </div>

    <p v-if="!completed.length" class="text-gray-500">You haven't completed any lessons yet.</p>

    <NuxtLink
      v-for="lesson in completed"
      :key="lesson.id"
      :to="`/lessons/${lesson.id}`"
      class="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
    >
      <p class="font-semibold">{{ lesson.title }}</p>
      <p class="text-sm text-gray-600 dark:text-gray-300">{{ lesson.description }}</p>
    </NuxtLink>
  </UContainer>
</template>
