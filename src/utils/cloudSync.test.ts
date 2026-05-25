import { describe, expect, it } from 'vitest'
import { shouldRefreshCloudOnUserSwitch } from './cloudSync'

describe('shouldRefreshCloudOnUserSwitch', () => {
  it('refreshes cloud data when an admin switches to another user', () => {
    expect(shouldRefreshCloudOnUserSwitch(true, '华文达', '张舒棋')).toBe(true)
  })

  it('does not refresh for non-admin or unchanged user selections', () => {
    expect(shouldRefreshCloudOnUserSwitch(false, '张舒棋', '华文达')).toBe(false)
    expect(shouldRefreshCloudOnUserSwitch(true, '华文达', '华文达')).toBe(false)
  })
})
