// @vitest-environment nuxt

import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RoomView from '../../app/components/home/RoomView.vue'

describe('room view', () => {
  it('shows only the empty room when nothing is placed', async () => {
    const wrapper = await mountSuspended(RoomView)

    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.get('img').attributes('src')).toBe('/decor/cozy-room.svg')
  })

  it('puts each decoration at its saved position and rotation', async () => {
    const wrapper = await mountSuspended(RoomView, {
      props: {
        decorations: [
          {
            id: 'a',
            name: 'Cloud Rug',
            assetKey: 'decor/rug-cloud',
            positionX: 30,
            positionY: 78,
            rotation: 0,
          },
          {
            id: 'b',
            name: 'Reading Lamp',
            assetKey: 'decor/lamp-reading',
            positionX: 72,
            positionY: 55,
            rotation: 15,
          },
        ],
      },
    })

    const lamp = wrapper.get('img[alt="Reading Lamp"]')
    expect(lamp.attributes('src')).toBe('/decor/lamp-reading.svg')
    expect(lamp.attributes('style')).toContain('left: 72%')
    expect(lamp.attributes('style')).toContain('top: 55%')
    expect(lamp.attributes('style')).toContain('rotate(15deg)')
    expect(wrapper.findAll('img')).toHaveLength(3)
  })

  it('shows whatever is passed in the avatar spot', async () => {
    const wrapper = await mountSuspended(RoomView, {
      slots: { avatar: () => 'avatar here' },
    })

    expect(wrapper.text()).toContain('avatar here')
  })
})
