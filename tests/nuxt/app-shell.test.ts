// @vitest-environment nuxt

import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import AppHeader from '../../app/components/app/Header.vue'
import AppFooter from '../../app/components/app/Footer.vue'
import { useCoinBalance } from '../../app/composables/useCoinBalance'

// Stands in for the real ledger behind GET /api/coins/balance.
let serverBalance = 12
registerEndpoint('/api/coins/balance', () => ({ balance: serverBalance }))

describe('app header', () => {
  it('shows the page name from the web address', async () => {
    const wrapper = await mountSuspended(AppHeader, { route: '/auth' })

    expect(wrapper.get('h1').text()).toBe('Auth')
  })

  it('links to the shop', async () => {
    const wrapper = await mountSuspended(AppHeader)

    expect(wrapper.get('[aria-label="Shop"]').attributes('href')).toBe('/shop')
  })

  it('has an accessible "Toggle Theme" button', async () => {
    const wrapper = await mountSuspended(AppHeader)

    expect(wrapper.find('[aria-label="Toggle Theme"]').exists()).toBe(true)
  })
})

describe('piggy bank coin balance', () => {
  it('shows the balance from the server with the currency label', async () => {
    serverBalance = 12
    const wrapper = await mountSuspended(AppHeader)
    const piggyBank = wrapper.get('[data-testid="coin-balance"]')

    expect(piggyBank.text()).toBe('12 coins')
    expect(piggyBank.attributes('aria-label')).toBe('12 coins')
  })

  it('updates right away when coins are earned or spent', async () => {
    serverBalance = 12
    const wrapper = await mountSuspended(AppHeader)
    const { refreshBalance, setBalance } = useCoinBalance()

    // e.g. after a purchase: the page re-reads the balance from the server.
    serverBalance = 7
    await refreshBalance()
    await nextTick()
    expect(wrapper.get('[data-testid="coin-balance"]').text()).toBe('7 coins')

    // e.g. after a quest: the server already sent the new balance.
    setBalance(1)
    await nextTick()
    expect(wrapper.get('[data-testid="coin-balance"]').text()).toBe('1 coin')
  })
})

describe('app footer', () => {
  it('has a button for each main page', async () => {
    const wrapper = await mountSuspended(AppFooter)
    const links = wrapper.findAll('nav a').map((link) => link.attributes('href'))

    expect(links).toEqual(['/', '/avatar', '/friends', '/quests', '/inventory'])
  })
})