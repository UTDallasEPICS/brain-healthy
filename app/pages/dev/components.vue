<script setup lang="ts">
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
  }

  definePageMeta({ title: 'Components' })
  const waterDone = ref(false)
  const friendId = ref('')
  const message = ref('')
  const showPopup = ref(false)
</script>

<template>
  <div class="mx-auto max-w-[1120px] space-y-8 px-4 py-6">
    <section class="space-y-3">
      <h2 class="text-lg font-bold">Buttons</h2>
      <div class="flex flex-wrap items-center gap-3">
        <BaseButton label="Yes!" />
        <BaseButton label="Resume" color="yellow" />
        <BaseButton label="Not yet" color="gray" />
        <BaseButton label="Okay" color="purple" />
        <BaseButton label="Start" color="cream" />
        <BaseButton label="Log" icon="i-lucide-plus" />
        <BaseButton label="Saving" loading />
        <BaseButton label="Done" disabled />
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-bold">Badges</h2>
      <div class="flex flex-wrap items-center gap-3">
        <BaseBadge label="Daily" />
        <BaseBadge label="Weekly" color="blue" />
        <BaseBadge label="Monthly" color="purple" />
        <BaseBadge label="Done" color="green" />
        <BaseBadge label="Missed" color="gray" />
        <BaseBadge label="NEW" color="pink" />
      </div>
    </section>

    <section class="max-w-md space-y-3">
      <h2 class="text-lg font-bold">Progress bars</h2>
      <BaseProgress :value="2" :max="3" />
      <p class="text-sm">2 of 3 done</p>
      <BaseProgress :value="45" color="blue" />
      <p class="text-sm">45% done</p>
    </section>

    <section class="max-w-md space-y-3">
      <h2 class="text-lg font-bold">Cards</h2>
      <BaseCard class="flex items-center gap-3">
        <div
          class="border-ink bg-sun grid size-11 shrink-0 place-items-center rounded-full border-2"
        >
          <UIcon name="i-lucide-sun" class="size-6" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <p class="font-bold">Drink 32 oz of water</p>
          <div class="flex items-center gap-2 text-sm">
            <BaseBadge label="Daily" />
            <UIcon name="i-lucide-coins" class="size-4" />
            20
          </div>
        </div>
        <BaseButton label="Start" color="cream" />
      </BaseCard>
      <BaseCard color="cream" class="space-y-2">
        <p class="font-bold">Sleep Basics</p>
        <p class="text-sm">8 min</p>
        <BaseProgress :value="45" color="blue" />
      </BaseCard>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-bold">Avatars</h2>
      <div class="flex items-center gap-3">
        <BaseAvatar name="Sunny Sam" size="sm" />
        <BaseAvatar name="Moonlit Maya" />
        <BaseAvatar name="Cozy Kai" size="lg" />
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-bold">Checkbox</h2>
      <FormCheckbox v-model="waterDone" label="Drink 32 oz of water" />
      <FormCheckbox label="Walk outside" disabled />
      <p class="text-sm">waterDone is: {{ waterDone }}</p>
    </section>

    <section class="max-w-md space-y-3">
      <h2 class="text-lg font-bold">Inputs</h2>
      <FormInput
        v-model="friendId"
        label="Add a friend"
        placeholder="Search by username"
        icon="i-lucide-search"
      />
      <p class="text-sm">friendId is: {{ friendId }}</p>
      <FormInput
        v-model="message"
        label="Message"
        placeholder="Write something kind..."
        multiline
      />
      <p class="text-sm">message is: {{ message }}</p>
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-bold">Popup</h2>
      <BaseButton label="Open popup" color="purple" @click="showPopup = true" />
      <BaseModal v-model:open="showPopup" title="Mark as done?" color="navy">
        <div
          class="border-ink bg-sun mx-auto mb-3 grid size-14 place-items-center rounded-full border-2"
        >
          <UIcon name="i-lucide-sun" class="size-7" />
        </div>
        <p class="text-sm">Did you finish</p>
        <p class="font-bold">Drink 32 oz of water?</p>
        <template #footer>
          <BaseButton label="Not yet" color="gray" @click="showPopup = false" />
          <BaseButton label="Yes!" @click="showPopup = false" />
        </template>
      </BaseModal>
    </section>

    <section class="max-w-md space-y-3">
      <h2 class="text-lg font-bold">Expandable messages</h2>
      <BaseCollapsible
        title="From sunny_sam"
        preview="You got this! Good luck on your exams..."
        icon="i-lucide-mail"
      >
        <p class="text-sm">
          You got this! Good luck on your exams this week. Remember to take breaks.
        </p>
      </BaseCollapsible>
      <BaseCollapsible
        title="From cozy_kai"
        preview="Want to do the walking quest..."
        icon="i-lucide-mail"
      >
        <p class="text-sm">Want to do the walking quest together tomorrow?</p>
      </BaseCollapsible>
    </section>
  </div>
</template>