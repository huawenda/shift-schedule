const shiftOptions = new Set(['白班', '夜班', '休息', '白特', '夜特', '事假'])
const leaveDurationOptions = new Set(['半天', '一天'])
const chinaTimezoneOffsetMs = 8 * 60 * 60 * 1000

function normalizeOvertimeHours(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0

  return Math.round(numberValue * 2) / 2
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null
  if (typeof record.personName !== 'string' || typeof record.date !== 'string') return null

  const shiftOverride = shiftOptions.has(record.shiftOverride) ? record.shiftOverride : null
  const overtimeHours = normalizeOvertimeHours(record.overtimeHours)
  const isLegalOvertime = record.isLegalOvertime === true
  const leaveDuration = shiftOverride === '事假' && leaveDurationOptions.has(record.leaveDuration)
    ? record.leaveDuration
    : null

  if (!shiftOverride && overtimeHours <= 0 && !isLegalOvertime && !leaveDuration) return null

  return {
    personName: record.personName,
    date: record.date,
    shiftOverride,
    overtimeHours,
    isLegalOvertime,
    leaveDuration
  }
}

function getOverrideKey(personName, date) {
  return `${personName}::${date}`
}

function splitOverrideKey(key) {
  if (typeof key !== 'string') return null

  const [personName, date, ...rest] = key.split('::')
  if (!personName || !date || rest.length > 0) return null

  return { personName, date }
}

function canWriteRecord(user, personName) {
  if (!user || typeof personName !== 'string') return false
  if (user.isAdmin) return true

  return user.personName === personName
}

function filterWritableRecords(user, records) {
  return records
    .map(normalizeRecord)
    .filter(Boolean)
    .filter(record => canWriteRecord(user, record.personName))
}

function filterWritableDeletedKeys(user, deletedKeys) {
  return deletedKeys
    .map(splitOverrideKey)
    .filter(Boolean)
    .filter(keyParts => canWriteRecord(user, keyParts.personName))
}

function padTimePart(value) {
  return String(value).padStart(2, '0')
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp + chinaTimezoneOffsetMs)
  return [
    date.getUTCFullYear(),
    padTimePart(date.getUTCMonth() + 1),
    padTimePart(date.getUTCDate())
  ].join('-') + ' ' + [
    padTimePart(date.getUTCHours()),
    padTimePart(date.getUTCMinutes()),
    padTimePart(date.getUTCSeconds())
  ].join(':')
}

module.exports = {
  canWriteRecord,
  filterWritableDeletedKeys,
  filterWritableRecords,
  formatTimestamp,
  getOverrideKey,
  normalizeOvertimeHours,
  normalizeRecord,
  splitOverrideKey
}

