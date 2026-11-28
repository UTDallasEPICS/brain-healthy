<script setup lang="ts">
  // The Quests tab: everyday quests to complete, plus the video lessons and
  // their quizzes. Both earn coins, so the header's piggy bank is updated after
  // each one (see composables/useCoinBalance.ts).
  type Frequency = 'daily' | 'weekly' | 'once'
  interface Quest {
    id: string
    name: string
    description: string
    frequency: Frequency
    rewardAmount: number
    contentUrl: string | null
    completed: boolean
    eligible: boolean
  }
  interface QuestCompletion {
    coinsEarned: number
    balance: number
  }

  const {
    data: quests,
    pending: questsPending,
    error: questsError,
    refresh: refreshQuests,
  } = await useFetch<Quest[]>('/api/quests', { key: 'quests' })
  const {
    data: lessons,
    pending: lessonsPending,
    error: lessonsError,
  } = await useFetch('/api/lessons', { key: 'lessons' })
  const { setBalance } = useCoinBalance()

  const FREQUENCY = {
    daily: { label: 'Daily', color: 'yellow' },
    weekly: { label: 'Weekly', color: 'blue' },
    once: { label: 'One-time', color: 'purple' },
  } as const

  const questsDone = computed(() => quests.value?.filter((quest) => quest.completed).length ?? 0)

  // ---- Quests ------------------------------------------------------------

  const completing = ref<string | null>(null)
  const notice = ref<{ text: string; error: boolean } | null>(null)

  function errorText(cause: unknown) {
    const failure = cause as { data?: { statusMessage?: string }; message?: string }
    return failure?.data?.statusMessage ?? failure?.message ?? 'Something went wrong. Try again.'
  }

  async function complete(quest: Quest) {
    completing.value = quest.id
    notice.value = null
    try {
      const result = await $fetch<QuestCompletion>(`/api/quests/${quest.id}/complete`, {
        method: 'POST',
      })
      setBalance(result.balance)
      notice.value = {
        text: result.coinsEarned
          ? `Nice work! You earned ${formatCoins(result.coinsEarned)}.`
          : `Nice work! "${quest.name}" is done.`,
        error: false,
      }
    } catch (cause) {
      notice.value = { text: errorText(cause), error: true }
    } finally {
      await refreshQuests()
      completing.value = null
    }
  }

  // ---- Lessons -----------------------------------------------------------

  const currentLesson = computed(() => lessons.value?.find((lesson) => !lesson.completed))
  const lessonsDone = computed(
    () => lessons.value?.filter((lesson) => lesson.completed).length ?? 0
  )
</script>

<template>
  <div class="text-fg mx-auto max-w-3xl space-y-10 px-4 pt-2 pb-10">
    <!-- Quests -->
    <section aria-labelledby="quests-heading" class="space-y-4">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h2 id="quests-heading" class="text-2xl font-bold">Quests</h2>
          <p class="text-sm opacity-75">Small healthy habits. Each one earns coins.</p>
        </div>
        <span v-if="quests?.length" class="text-sm font-bold whitespace-nowrap">
          {{ questsDone }} / {{ quests.length }} done
        </span>
      </div>

      <p
        v-if="notice"
        :role="notice.error ? 'alert' : 'status'"
        :class="[
          'rounded-2xl border-2 px-4 py-2 text-sm font-bold',
          TONES[notice.error ? 'pink' : 'green'],
        ]"
      >
        {{ notice.text }}
      </p>

      <p v-if="questsError" class="text-sm">Quests could not load. Please refresh and try again.</p>
      <div v-else-if="questsPending && !quests" class="space-y-3">
        <div v-for="n in 3" :key="n" class="bg-surface-muted h-24 animate-pulse rounded-2xl" />
      </div>
      <p v-else-if="!quests?.length" class="text-sm opacity-75">
        No quests right now. Check back soon!
      </p>
      <ul v-else class="space-y-3">
        <li v-for="quest in quests" :key="quest.id">
          <BaseCard :color="quest.completed ? 'gray' : 'cream'" class="flex items-center gap-4">
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <BaseBadge
                  :label="FREQUENCY[quest.frequency].label"
                  :color="FREQUENCY[quest.frequency].color"
                />
                <span v-if="quest.rewardAmount" class="text-sm font-bold">
                  +{{ formatCoins(quest.rewardAmount) }}
                </span>
              </div>
              <h3 class="font-bold">{{ quest.name }}</h3>
              <p class="text-sm opacity-80">{{ quest.description }}</p>
              <a
                v-if="quest.contentUrl"
                :href="quest.contentUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-sm font-bold underline"
              >
                Learn more <UIcon name="i-lucide-external-link" class="size-4" />
              </a>
            </div>

            <BaseBadge v-if="quest.completed" label="Done ✓" color="green" class="shrink-0" />
            <BaseButton
              v-else-if="quest.eligible"
              label="Complete"
              class="shrink-0"
              :loading="completing === quest.id"
              :disabled="completing !== null"
              @click="complete(quest)"
            />
            <BaseBadge v-else label="In review" color="gray" class="shrink-0" />
          </BaseCard>
        </li>
      </ul>
    </section>

    <!-- Lessons -->
    <section aria-labelledby="lessons-heading" class="space-y-4">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h2 id="lessons-heading" class="text-2xl font-bold">Lessons</h2>
          <p class="text-sm opacity-75">Watch a short video, then pass the quiz to earn coins.</p>
        </div>
        <NuxtLink
          to="/quests/lessons/completed"
          class="text-sm font-bold whitespace-nowrap underline"
        >
          Completed
        </NuxtLink>
      </div>

      <p v-if="lessonsError" class="text-sm">
        Lessons could not load. Please refresh and try again.
      </p>
      <div
        v-else-if="lessonsPending && !lessons"
        class="bg-surface-muted h-40 animate-pulse rounded-2xl"
      />
      <p v-else-if="!lessons?.length" class="text-sm opacity-75">
        No lessons yet. Check back soon!
      </p>
      <template v-else>
        <div class="space-y-1.5">
          <BaseProgress :value="lessonsDone" :max="lessons.length" color="blue" />
          <p class="text-sm font-bold">
            {{ lessonsDone }} of {{ lessons.length }} lessons completed
          </p>
        </div>

        <BaseCard v-if="currentLesson" color="lavender" class="space-y-2">
          <p class="text-xs font-bold tracking-widest uppercase">Up next</p>
          <h3 class="text-xl font-bold">{{ currentLesson.title }}</h3>
          <p class="text-sm">{{ currentLesson.description }}</p>
          <BaseButton
            :to="`/quests/lessons/${currentLesson.id}`"
            label="Start lesson"
            icon="i-lucide-play"
            color="yellow"
            class="mt-2"
          />
        </BaseCard>
        <BaseCard v-else color="lavender">
          <p class="font-bold">You've completed every lesson. Nice work!</p>
        </BaseCard>

        <ul class="space-y-2">
          <li v-for="(lesson, index) in lessons" :key="lesson.id">
            <NuxtLink
              :to="`/quests/lessons/${lesson.id}`"
              class="border-outline bg-surface text-fg flex items-center gap-3 rounded-2xl border-2 p-3 transition-transform hover:-translate-y-0.5"
            >
              <span
                class="border-outline grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold"
                :class="lesson.completed ? 'bg-leaf text-ink' : 'bg-field'"
              >
                <UIcon v-if="lesson.completed" name="i-lucide-check" class="size-4" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="min-w-0 flex-1 truncate font-bold">{{ lesson.title }}</span>
              <BaseBadge v-if="lesson.completed" label="Completed" color="green" />
              <UIcon v-else name="i-lucide-chevron-right" class="size-5 shrink-0" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
