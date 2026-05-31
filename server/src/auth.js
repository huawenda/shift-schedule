const crypto = require('crypto')

const tokenTtlMs = 7 * 24 * 60 * 60 * 1000

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  if (leftBuffer.length !== rightBuffer.length) return false

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function signPayload(encodedPayload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
}

function createSessionId() {
  return crypto.randomUUID()
}

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex')
}

function createToken(user, secret, now = Date.now()) {
  const payload = {
    openid: user.openid,
    personName: user.personName,
    isAdmin: Boolean(user.isAdmin),
    sessionId: user.sessionId,
    exp: now + tokenTtlMs
  }
  const encodedPayload = base64UrlEncode(payload)
  const signature = signPayload(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = signPayload(encodedPayload, secret)
  if (!timingSafeEqualString(signature, expectedSignature)) return null

  try {
    const payload = base64UrlDecode(encodedPayload)
    if (typeof payload.openid !== 'string') return null
    if (typeof payload.personName !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null

    return {
      openid: payload.openid,
      personName: payload.personName,
      isAdmin: payload.isAdmin === true,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : ''
    }
  } catch {
    return null
  }
}

function isValidAccessCode(inputCode, configuredCode) {
  if (typeof inputCode !== 'string' || typeof configuredCode !== 'string') return false
  if (!configuredCode) return false

  return timingSafeEqualString(inputCode, configuredCode)
}

function getWebLoginRole(personName, inputCode, options) {
  const normalizedPersonName = typeof personName === 'string' ? personName.trim() : ''
  const adminPersonName = typeof options?.adminPersonName === 'string' ? options.adminPersonName.trim() : ''
  const isAdminPerson = normalizedPersonName === adminPersonName
  const isAdminLogin = isAdminPerson && isValidAccessCode(inputCode, options?.adminAccessCode)

  if (isAdminLogin) return { ok: true, isAdmin: true }
  if (isAdminPerson) return { ok: false, isAdmin: false }
  if (isValidAccessCode(inputCode, options?.accessCode)) return { ok: true, isAdmin: false }

  return { ok: false, isAdmin: false }
}

module.exports = {
  createSessionId,
  createToken,
  getWebLoginRole,
  hashToken,
  isValidAccessCode,
  tokenTtlMs,
  verifyToken
}
