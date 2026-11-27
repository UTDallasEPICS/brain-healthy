// @vitest-environment nuxt

import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppHeader from '../../app/components/app/Header.vue'
import AppFooter from '../../app/components/app/Footer.vue'

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

describe('app footer', () => {
  it('has a button for each main page', async () => {
    const wrapper = await mountSuspended(AppFooter)
    const links = wrapper.findAll('nav a').map((link) => link.attributes('href'))

    expect(links).toEqual(['/', '/avatar', '/friends', '/quests', '/inventory'])
  })
})