const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const collectionName = 'user_profiles'
const adminOpenids = ['oK0h23Zc4Z5ZIebbU0GiaLDPIpQA']
const adminOpenidSet = new Set(adminOpenids.map(openid => openid.trim().toLowerCase()))
const reservedPersonBindings = {
  华文达: 'oK0h23Zc4Z5ZIebbU0GiaLDPIpQA'
}
const chinaTimezoneOffsetMs = 8 * 60 * 60 * 1000

function isAdmin(openid) {
  return typeof openid === 'string' && adminOpenidSet.has(openid.trim().toLowerCase())
}

function normalizePersonName(personName) {
  return typeof personName === 'string' ? personName.trim() : ''
}

function isSameOpenid(left, right) {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.trim().toLowerCase() === right.trim().toLowerCase()
  )
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

async function getCurrentProfile(openid) {
  const response = await db.collection(collectionName).where({ _openid: openid }).limit(1).get()
  return response.data[0] || null
}

async function loadProfile(openid) {
  const profile = await getCurrentProfile(openid)
  if (profile?._id && (!profile.boundAtText || !profile.updatedAtText)) {
    const boundAt = profile.boundAt || profile.updatedAt || Date.now()
    const updatedAt = profile.updatedAt || boundAt
    const data = {
      boundAt,
      boundAtText: formatTimestamp(boundAt),
      updatedAt,
      updatedAtText: formatTimestamp(updatedAt)
    }
    await db.collection(collectionName).doc(profile._id).update({ data })
    Object.assign(profile, data)
  }

  return {
    openid,
    isAdmin: isAdmin(openid),
    profile
  }
}

async function bindProfile(openid, personName) {
  const normalizedPersonName = normalizePersonName(personName)
  if (!normalizedPersonName) {
    return {
      ok: false,
      code: 'INVALID_PERSON_NAME',
      message: '请选择有效姓名'
    }
  }

  const reservedOpenid = reservedPersonBindings[normalizedPersonName]
  if (reservedOpenid && !isSameOpenid(openid, reservedOpenid)) {
    return {
      ok: false,
      code: 'RESERVED_PERSON_NAME',
      message: '该姓名为管理员专用，请选择本人姓名'
    }
  }

  const [currentProfile, sameNameResponse] = await Promise.all([
    getCurrentProfile(openid),
    db.collection(collectionName).where({ personName: normalizedPersonName }).limit(10).get()
  ])
  const conflictingProfile = sameNameResponse.data.find(profile => !isSameOpenid(profile._openid, openid))

  if (conflictingProfile) {
    return {
      ok: false,
      code: 'PERSON_ALREADY_BOUND',
      message: '该姓名已被其他用户绑定，请联系管理员'
    }
  }

  const now = Date.now()
  const boundAt = currentProfile?.boundAt || now
  const data = {
    _openid: openid,
    personName: normalizedPersonName,
    boundAt,
    boundAtText: formatTimestamp(boundAt),
    updatedAt: now,
    updatedAtText: formatTimestamp(now)
  }

  if (currentProfile?._id) {
    await db.collection(collectionName).doc(currentProfile._id).update({ data })
    return {
      ok: true,
      openid,
      isAdmin: isAdmin(openid),
      profile: {
        ...currentProfile,
        ...data
      }
    }
  }

  const addResponse = await db.collection(collectionName).add({ data })
  return {
    ok: true,
    openid,
    isAdmin: isAdmin(openid),
    profile: {
      _id: addResponse._id,
      _openid: openid,
      ...data
    }
  }
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()

  if (event?.action === 'bind') {
    return bindProfile(OPENID, event.personName)
  }

  return loadProfile(OPENID)
}
