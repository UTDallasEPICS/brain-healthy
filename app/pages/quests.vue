<script setup lang="ts">
type Quest = { id:string; name:string; description:string; frequency:'daily'|'weekly'|'monthly'|'once'; rewardAmount:number; completed:boolean; eligible:boolean }
const { data: quests, pending, error, refresh } = await useFetch<Quest[]>('/api/quests')
const period = ref<'daily'|'weekly'|'monthly'>('daily')
const busy = ref<string|null>(null)
const notice = ref('')
const visible = computed(() => (quests.value ?? []).filter(q => q.frequency === period.value))
async function complete(q: Quest) {
  busy.value=q.id; notice.value=''
  try { await $fetch(`/api/quests/${q.id}/complete`, {method:'POST'}); notice.value='Quest complete! Your coins have been added.'; await refresh() }
  catch (e) { const err=e as {data?:{statusMessage?:string};message?:string}; notice.value=err.data?.statusMessage ?? err.message ?? 'Could not log this quest.' }
  finally { busy.value=null }
}
</script>
<template>
  <main class="play-page mock-page quest-page">
    <header class="mock-title"><h1>Quests</h1><p>Small steps count. Pick a goal that feels right today.</p></header>
    <NuxtLink to="/lessons" class="learning-banner"><span>▤</span>Learning Modules <b>→</b></NuxtLink>
    <div class="quest-tabs" role="tablist"><button v-for="tab in ['daily','weekly','monthly'] as const" :key="tab" :class="{active:period===tab}" @click="period=tab">{{tab}}</button></div>
    <p v-if="notice" class="mock-notice" role="status">{{notice}}</p><p v-if="error" class="mock-notice">Quests could not load right now.</p>
    <section v-if="pending" class="quest-list">Loading quests…</section>
    <section v-else class="quest-list">
      <article v-for="quest in visible" :key="quest.id" class="quest-card">
        <div class="quest-symbol">☀</div><div class="quest-copy"><h2>{{quest.name}}</h2><p>{{quest.description}}</p><small>{{period}} · {{quest.rewardAmount}} coins</small></div>
        <button class="mock-button" :disabled="quest.completed || !quest.eligible || busy===quest.id" @click="complete(quest)">{{quest.completed?'Done':busy===quest.id?'Saving…':'Log'}}</button>
      </article>
      <p v-if="!visible.length" class="mock-empty">No {{period}} quests are available right now.</p>
    </section>
    <BottomNav active="quests" />
  </main>
</template>
