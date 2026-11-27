<script setup lang="ts">
const name = ref('My Avatar')
const styles = ['✦','☀','☁','✿']
const chosen = ref(0)
</script>
<template><main class="play-page mock-page avatar-page"><header class="mock-title"><h1>{{name}}</h1><p>Make your little character feel like you.</p></header><section class="avatar-stage"><div class="avatar-sun">{{styles[chosen]}}</div><div class="avatar-options"><button v-for="(item,i) in styles" :key="item" :class="{active:chosen===i}" @click="chosen=i">{{item}}</button></div></section><label class="avatar-name">Name<input v-model="name" maxlength="24" aria-label="Avatar name" /></label><p class="mock-empty">Character accessories will appear here when they’re available.</p><BottomNav active="avatar" /></main></template>
