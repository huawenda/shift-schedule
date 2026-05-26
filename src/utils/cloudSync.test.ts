import { describe, expect, it } from 'vitest'
import {
  mergeSharedCloudOverrides,
  shouldRefreshCloudOnUserSwitch
} from './cloudSync'

describe('shouldRefreshCloudOnUserSwitch', () => {
  it('refreshes cloud data when an admin switches to another user', () => {
    expect(shouldRefreshCloudOnUserSwitch(true, '华文达', '张舒棋')).toBe(true)
  })

  it('does not refresh for non-admin or unchanged user selections', () => {
    expect(shouldRefreshCloudOnUserSwitch(false, '张舒棋', '华文达')).toBe(false)
    expect(shouldRefreshCloudOnUserSwitch(true, '华文达', '华文达')).toBe(false)
  })
})

describe('mergeSharedCloudOverrides', () => {
  it('uses shared cloud records as canonical data so deleted records disappear locally', () => {
    expect(mergeSharedCloudOverrides(
      {
        '华文达::05/23': '夜特',
        '张舒棋::05/23': '夜班'
      },
      {
        '张舒棋::05/23': '夜班'
      }
    )).toEqual({
      '张舒棋::05/23': '夜班'
    })
  })
})
