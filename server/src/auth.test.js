import { describe, expect, it } from 'vitest'
import auth from './auth'

const { createToken, getWebLoginRole, isValidAccessCode, verifyToken } = auth

describe('web token auth', () => {
  it('creates verifiable signed tokens', () => {
    const token = createToken({
      openid: 'web:华文达',
      personName: '华文达',
      isAdmin: true
    }, 'secret', 1000)

    expect(verifyToken(token, 'secret', 1000)).toEqual({
      openid: 'web:华文达',
      personName: '华文达',
      isAdmin: true
    })
  })

  it('rejects tokens signed with a different secret', () => {
    const token = createToken({
      openid: 'web:张舒琪',
      personName: '张舒琪',
      isAdmin: false
    }, 'secret', 1000)

    expect(verifyToken(token, 'other-secret', 1000)).toBeNull()
  })

  it('validates configured access code without accepting empty codes', () => {
    expect(isValidAccessCode('open-sesame', 'open-sesame')).toBe(true)
    expect(isValidAccessCode('wrong', 'open-sesame')).toBe(false)
    expect(isValidAccessCode('', '')).toBe(false)
  })

  it('only grants admin access with the dedicated admin access code', () => {
    const options = {
      accessCode: 'staff-code',
      adminAccessCode: 'admin-code',
      adminPersonName: '华文达'
    }

    expect(getWebLoginRole('华文达', 'admin-code', options)).toEqual({
      ok: true,
      isAdmin: true
    })
    expect(getWebLoginRole('华文达', 'staff-code', options)).toEqual({
      ok: true,
      isAdmin: false
    })
    expect(getWebLoginRole('张舒琪', 'admin-code', options)).toEqual({
      ok: false,
      isAdmin: false
    })
  })
})
