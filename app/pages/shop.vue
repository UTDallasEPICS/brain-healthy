<script setup lang="ts">
  type Decoration = {
    id: string
    name: string
    description: string
    priceCoins: number
    assetKey: string
  }
  const {
    data: shop,
    pending,
    error,
    refresh,
  } = await useFetch<{ coins: number; decorations: Decoration[] }>('/api/decorations')
  const notice = ref('')
  const buying = ref<string | null>(null)
  function assetImage(assetKey: string) {
    const file =
      assetKey === 'decor/plant-sunny'
        ? 'plant-sunny'
        : assetKey === 'decor/lamp-reading'
          ? 'lamp-reading'
          : assetKey === 'decor/rug-cloud'
            ? 'rug-cloud'
            : 'plant-sunny'
    return `/decor/${file}.svg`
  }
  function errorText(cause: unknown) {
    const failure = cause as { data?: { statusMessage?: string }; message?: string }
    return failure?.data?.statusMessage ?? failure?.message ?? 'Purchase failed. Please try again.'
  }

  async function buy(item: Decoration) {
    buying.value = item.id
    notice.value = ''
    try {
      await $fetch(`/api/decorations/${item.id}/purchase`, { method: 'POST' })
      notice.value = `${item.name} added to your inventory!`
      await Promise.all([refresh(), refreshNuxtData(['/api/house', '/api/decorations/inventory'])])
    } catch (cause) {
      notice.value = errorText(cause)
    } finally {
      buying.value = null
    }
  }
</script>

<template>
  <main class="play-page">
    <section class="page-intro">
      <span class="coin-pill">{{ shop?.coins ?? 0 }} coins</span>
      <p class="eyebrow">MAKE IT YOURS</p>
      <h1>Little things for your home</h1>
      <p>Pick something that makes your cozy corner feel more like you.</p>
    </section>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="notice error">Shop could not load. Please refresh and try again.</p>
    <div v-if="pending" class="shop-grid">
      <div v-for="n in 3" :key="n" class="shop-card skeleton" />
    </div>
    <section v-else class="shop-grid" aria-label="Decorations for sale">
      <article v-for="(item, index) in shop?.decorations ?? []" :key="item.id" class="shop-card">
        <div class="item-art" :class="`art-${index % 3}`">
          <img :src="assetImage(item.assetKey)" :alt="item.name" />
        </div>
        <div class="item-copy">
          <p class="item-type">A LITTLE DECOR</p>
          <h2>{{ item.name }}</h2>
          <p>{{ item.description }}</p>
          <div class="item-buy">
            <strong>🪙 {{ item.priceCoins }}</strong
            ><button
              class="soft-button"
              :disabled="buying === item.id || (shop?.coins ?? 0) < item.priceCoins"
              @click="buy(item)"
            >
              {{ buying === item.id ? 'Adding…' : 'Add to home' }}
            </button>
          </div>
        </div>
      </article>
      <p v-if="!shop?.decorations.length" class="empty">
        The shop is getting ready. Check back soon!
      </p>
    </section>
    <nav class="bottom-nav" aria-label="Main navigation">
      <NuxtLink to="/" class="nav-link"><span>⌂</span>Home</NuxtLink
      ><NuxtLink to="/shop" class="nav-link active"><span>◇</span>Shop</NuxtLink>
    </nav>
  </main>
</template>
