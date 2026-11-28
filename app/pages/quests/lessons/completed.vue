<script setup lang="ts">
  const { data: lessons } = await useFetch('/api/lessons', { key: 'lessons' })

  const completed = computed(() => lessons.value?.filter((lesson) => lesson.completed) ?? [])
</script>

<template>
  <div class="text-fg mx-auto max-w-3xl space-y-4 px-4 pt-2 pb-10">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-2xl font-bold">Completed lessons</h2>
      <NuxtLink to="/quests" class="text-sm font-bold whitespace-nowrap underline">
        Back to quests
      </NuxtLink>
    </div>

    <p v-if="!completed.length" class="text-sm opacity-75">
      You haven't completed any lessons yet.
    </p>

    <ul v-else class="space-y-2">
      <li v-for="lesson in completed" :key="lesson.id">
        <NuxtLink
          :to="`/quests/lessons/${lesson.id}`"
          class="border-outline bg-surface text-fg block rounded-2xl border-2 p-4 transition-transform hover:-translate-y-0.5"
        >
          <p class="font-bold">{{ lesson.title }}</p>
          <p class="text-sm opacity-80">{{ lesson.description }}</p>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
