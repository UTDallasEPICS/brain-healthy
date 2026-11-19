<script setup lang="ts">
  const route = useRoute()
  const lessonId = route.params.id as string

  const { data: lesson, refresh } = await useFetch(`/api/lessons/${lessonId}`)

  const answers = ref<Record<string, string>>({})
  interface QuizResult {
    score: number
    passed: boolean
    incorrectQuestionIds: string[]
    coinsEarned: number
  }
  const result = ref<QuizResult | null>(null)
  const submitting = ref(false)

  const allAnswered = computed(
    () => !!lesson.value && lesson.value.questions.every((q) => answers.value[q.id])
  )

  // Turn a YouTube or Vimeo share link into an embeddable URL.
  const embedUrl = computed(() => {
    const url = lesson.value?.videoUrl ?? ''
    const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`
    const vimeo = url.match(/vimeo\.com\/(\d+)/)
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
    return url
  })

  async function submit() {
    submitting.value = true
    try {
      const data = await $fetch<QuizResult>(`/api/lessons/${lessonId}/submit`, {
        method: 'POST',
        body: { answers: answers.value },
      })
      result.value = data
      if (data.passed) await refresh()
    } finally {
      submitting.value = false
    }
  }

  function retry() {
    answers.value = {}
    result.value = null
  }
</script>

<template>
  <UContainer v-if="lesson" class="max-w-3xl space-y-6 py-8">
    <UButton to="/lessons" variant="ghost" icon="i-heroicons-arrow-left" label="Lessons" />

    <div>
      <h1 class="text-2xl font-bold">{{ lesson.title }}</h1>
      <p class="mt-2 text-gray-600 dark:text-gray-300">{{ lesson.description }}</p>
      <UBadge
        v-if="lesson.completed"
        class="mt-2"
        color="success"
        variant="subtle"
        label="Completed"
      />
    </div>

    <div class="aspect-video overflow-hidden rounded-lg">
      <iframe
        :src="embedUrl"
        :title="lesson.title"
        class="h-full w-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      />
    </div>

    <UCard>
      <h2 class="mb-4 text-lg font-semibold">Quiz</h2>
      <p class="mb-4 text-sm text-gray-500">Score 80% or higher to pass.</p>

      <div class="space-y-6">
        <div
          v-for="(question, index) in lesson.questions"
          :key="question.id"
          :class="{
            'rounded-lg border border-red-400 p-3': result?.incorrectQuestionIds.includes(
              question.id
            ),
          }"
        >
          <URadioGroup
            v-model="answers[question.id]"
            :legend="`${index + 1}. ${question.prompt}`"
            :items="question.options.map((o) => ({ value: o.id, label: o.label }))"
            :disabled="!!result"
          />
          <p
            v-if="result?.incorrectQuestionIds.includes(question.id)"
            class="mt-2 text-sm text-red-500"
          >
            Incorrect
          </p>
        </div>
      </div>

      <div v-if="result" class="mt-6 space-y-3">
        <UAlert
          :color="result.passed ? 'success' : 'error'"
          :title="
            result.passed
              ? `Passed with ${result.score}%`
              : `Scored ${result.score}% — you need 80% to pass`
          "
          :description="
            result.passed
              ? result.coinsEarned
                ? `You earned ${result.coinsEarned} coins!`
                : 'You already earned the coins for this lesson.'
              : 'Review the video and try again.'
          "
        />
        <div class="flex gap-2">
          <UButton v-if="!result.passed" label="Retry quiz" @click="retry" />
          <UButton v-else to="/lessons" label="Back to lessons" />
        </div>
      </div>
      <UButton
        v-else
        class="mt-6"
        label="Submit answers"
        :disabled="!allAnswered"
        :loading="submitting"
        @click="submit"
      />
    </UCard>
  </UContainer>
</template>
