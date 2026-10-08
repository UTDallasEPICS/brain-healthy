// @vitest-environment node
//
// Unit tests for the UTD email gate (shared/utils/email-domain.ts). The server
// enforces it on sign-up and email change, so the cases that matter are the
// lookalike domains an endsWith check would wrongly accept. Pure function, so it
// runs in plain node rather than booting Nuxt.

import { describe, it, expect } from 'vitest'
import { isUtdEmail } from '../../shared/utils/email-domain'

describe('isUtdEmail', () => {
  it('accepts a @utdallas.edu address, case-insensitively', () => {
    expect(isUtdEmail('abc123456@utdallas.edu')).toBe(true)
    expect(isUtdEmail('ABC123456@UTDallas.EDU')).toBe(true)
  })

  it('rejects lookalike and other domains', () => {
    expect(isUtdEmail('a@evilutdallas.edu')).toBe(false)
    expect(isUtdEmail('a@utdallas.edu.co')).toBe(false)
    expect(isUtdEmail('a@student.utdallas.edu')).toBe(false)
    expect(isUtdEmail('a@gmail.com')).toBe(false)
  })

  it('judges the domain after the last @', () => {
    expect(isUtdEmail('a@utdallas.edu@gmail.com')).toBe(false)
    expect(isUtdEmail('utdallas.edu')).toBe(false)
  })
})
