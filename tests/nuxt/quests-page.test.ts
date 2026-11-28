// @vitest-environment nuxt

import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import QuestsPage from '../../app/pages/quests/index.vue'
import { useCoinBalance } from '../../app/composables/useCoinBalance'

// Fake API responses, so the page renders without a server or database.
const quests = [
  {
    id: 'quest-walk',
    name: 'Take a walk',
    description: 'Walk for 10 minutes.',
    frequency: 'daily',
    rewardAmount: 5,
    contentUrl: null,
    completed: false,
    eligible: true,
  },
  {
    id: 'quest-water',
    name: 'Drink water',
    description: 'Drink a glass of water.',
    frequency: 'weekly',
    rewardAmount: 3,
    contentUrl: null,
    completed: true,
    eligible: false,
  },
]
const lessons = [
  { id: 'lesson-sleep', title: 'Sleep basics', description: 'Why sleep matters.', completed: true },
  { id: 'lesson-stress', title: 'Stress less', description: 'Calm your mind.', completed: false },
]

registerEndpoint('/api/quests', () => quests)
registerEndpoint('/api/lessons', () => lessons)
registerEndpoint('/api/quests/quest-walk/complete', {
  method: 'POST',
  handler: () => ({ questId: 'quest-walk', coinsEarned: 5, balance: 17 }),
})

describe('quests page', () => {
  it('lists the quests', async () => {
    const wrapper = await mountSuspended(QuestsPage)

    expect(wrapper.text()).toContain('Take a walk')
    expect(wrapper.text()).toContain('Drink water')
    expect(wrapper.text()).toContain('1 / 2 done')
  })

  it('shows the lessons, with the next unfinished one up next', async () => {
    const wrapper = await mountSuspended(QuestsPage)
    const links = wrapper.findAll('a').map((link) => link.attributes('href'))

    expect(wrapper.text()).toContain('1 of 2 lessons completed')
    expect(wrapper.text()).toContain('Up next')
    expect(links).toContain('/quests/lessons/lesson-sleep')
    expect(links).toContain('/quests/lessons/lesson-stress')
    expect(links).toContain('/quests/lessons/completed')
  })

  it('completing a quest updates the coin balance right away', async () => {
    const wrapper = await mountSuspended(QuestsPage)
    const completeButton = wrapper.findAll('button').find((b) => b.text() === 'Complete')

    await completeButton!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('You earned 5 coins')
    expect(useCoinBalance().balance.value).toBe(17)
  })
})
