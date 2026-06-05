import { describe, expect, it } from 'vitest'

const {
  getLoadRecordsWhere,
  canWritePersonRecord
} = require('../../cloudfunctions/dayRecords/access')

describe('day records cloud access policy', () => {
  it('allows every authenticated user to load all day records for the shared table', () => {
    expect(getLoadRecordsWhere({ isAdminUser: true, boundPersonName: null, openid: 'admin' })).toBeNull()
    expect(getLoadRecordsWhere({ isAdminUser: false, boundPersonName: '张舒祺', openid: 'user' })).toBeNull()
  })

  it('keeps write access scoped to own records for users and all records for admins', () => {
    expect(canWritePersonRecord({ isAdminUser: true, allowedPersonName: null, personName: '华文达' })).toBe(true)
    expect(canWritePersonRecord({ isAdminUser: false, allowedPersonName: '张舒祺', personName: '张舒祺' })).toBe(true)
    expect(canWritePersonRecord({ isAdminUser: false, allowedPersonName: '张舒祺', personName: '华文达' })).toBe(false)
  })
})
