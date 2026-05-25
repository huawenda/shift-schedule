const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const userDayRecordsCollection = 'user_day_records'
const userProfilesCollection = 'user_profiles'
const adminOpenids = ['oK0h23Zc4Z5ZIebbU0GiaLDPIpQA']
const adminOpenidSet = new Set(adminOpenids.map(openid => openid.trim().toLowerCase()))
const shiftOptions = new Set(['白班', '夜班', '休息', '白特', '夜特'])
const pageSize = 100

function isAdmin(openid) {
  return typeof openid === 'string' && adminOpenidSet.has(openid.trim().toLowerCase())
}

function normalizeOvertimeHours(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0

  return Math.round(numberValue * 2) / 2
}

function getOverrideKey(personName, date) {
  return `${personName}::${date}`
}

function splitOverrideKey(key) {
  if (typeof key !== 'string') return null

  const parts = key.split('::')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  return {
    personName: parts[0],
    date: parts[1]
  }
}

function isValidRecord(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.personName === 'string' &&
    typeof value.date === 'string'
  )
}

function normalizeRecord(record) {
  const overtimeHours = normalizeOvertimeHours(record.overtimeHours)
  const shiftOverride = shiftOptions.has(record.shiftOverride) ? record.shiftOverride : null
  if (!shiftOverride && overtimeHours <= 0) return null

  return {
    personName: record.personName,
    date: record.date,
    shiftOverride,
    overtimeHours
  }
}

async function getAllRecords(collection, where = {}) {
  const records = []
  let offset = 0

  while (true) {
    const response = await db.collection(collection).where(where).skip(offset).limit(pageSize).get()
    records.push(...response.data)
    if (response.data.length < pageSize) break
    offset += pageSize
  }

  return records
}

async function getBoundPersonName(openid) {
  const response = await db.collection(userProfilesCollection).where({ _openid: openid }).limit(1).get()
  const profile = response.data[0]
  if (typeof profile?.personName === 'string') return profile.personName

  const ownRecordResponse = await db.collection(userDayRecordsCollection).where({ _openid: openid }).limit(1).get()
  const ownRecord = ownRecordResponse.data[0]
  return typeof ownRecord?.personName === 'string' ? ownRecord.personName : null
}

async function loadRecords(openid) {
  const boundPersonName = isAdmin(openid) ? null : await getBoundPersonName(openid)
  const records = isAdmin(openid)
    ? await getAllRecords(userDayRecordsCollection)
    : await getAllRecords(userDayRecordsCollection, boundPersonName ? { personName: boundPersonName } : { _openid: openid })

  return { records }
}

async function syncRecords(openid, records, deletedKeys) {
  const allowedPersonName = isAdmin(openid) ? null : await getBoundPersonName(openid)
  if (!isAdmin(openid) && !allowedPersonName) return loadRecords(openid)

  const nextRecords = records
    .filter(isValidRecord)
    .map(normalizeRecord)
    .filter(Boolean)
    .filter(record => isAdmin(openid) || record.personName === allowedPersonName)
  const existingRecords = isAdmin(openid)
    ? await getAllRecords(userDayRecordsCollection)
    : await getAllRecords(userDayRecordsCollection, { personName: allowedPersonName })
  const existingByKey = new Map(existingRecords.map(record => [
    getOverrideKey(record.personName, record.date),
    record
  ]))
  const nextKeys = new Set(nextRecords.map(record => getOverrideKey(record.personName, record.date)))
  const updatedAt = Date.now()

  await Promise.all(nextRecords.map(record => {
    const key = getOverrideKey(record.personName, record.date)
    const existing = existingByKey.get(key)
    const data = {
      personName: record.personName,
      date: record.date,
      shiftOverride: record.shiftOverride,
      overtimeHours: record.overtimeHours,
      updatedAt
    }

    if (existing?._id) {
      return db.collection(userDayRecordsCollection).doc(existing._id).update({ data })
    }

    return db.collection(userDayRecordsCollection).add({
      data: {
        ...data,
        _openid: openid
      }
    })
  }))

  const deletedKeyParts = deletedKeys
    .map(splitOverrideKey)
    .filter(Boolean)
    .filter(keyParts => (
      !nextKeys.has(getOverrideKey(keyParts.personName, keyParts.date)) &&
      (isAdmin(openid) || keyParts.personName === allowedPersonName)
    ))

  await Promise.all(deletedKeyParts.map(keyParts => {
    const existing = existingByKey.get(getOverrideKey(keyParts.personName, keyParts.date))
    return existing?._id
      ? db.collection(userDayRecordsCollection).doc(existing._id).remove()
      : Promise.resolve()
  }))

  const submittedPeople = new Set(nextRecords.map(record => record.personName))
  await Promise.all(existingRecords
    .filter(record => (
      record._id &&
      submittedPeople.has(record.personName) &&
      !nextKeys.has(getOverrideKey(record.personName, record.date))
    ))
    .map(record => db.collection(userDayRecordsCollection).doc(record._id).remove()))

  return loadRecords(openid)
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()

  if (event?.action === 'sync') {
    return syncRecords(
      OPENID,
      Array.isArray(event.records) ? event.records : [],
      Array.isArray(event.deletedKeys) ? event.deletedKeys : []
    )
  }

  return loadRecords(OPENID)
}
