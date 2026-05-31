const express = require('express')
const {
  createLoginSession,
  createPool,
  createUserAccount,
  deleteDayRecord,
  ensureSchema,
  loadActiveSessionUser,
  loadDayRecords,
  loadProfile,
  loadSalaryInputs,
  loadUserAccountByPersonName,
  loadUserAccountByUsername,
  upsertDayRecord,
  upsertProfile,
  upsertSalaryInput
} = require('./db')
const {
  createSessionId,
  createToken,
  getWebLoginRole,
  hashPassword,
  hashToken,
  isValidPassword,
  tokenTtlMs,
  verifyToken
} = require('./auth')
const {
  filterWritableDeletedKeys,
  filterWritableRecords,
  splitOverrideKey
} = require('./records')

const port = Number(process.env.PORT || 3000)
const accessCode = process.env.WEB_ACCESS_CODE || 'change-me'
const registrationCode = process.env.REGISTRATION_CODE || accessCode
const adminAccessCode = process.env.ADMIN_ACCESS_CODE || ''
const tokenSecret = process.env.TOKEN_SECRET || 'change-this-token-secret'
const adminPersonName = process.env.ADMIN_PERSON_NAME || '华文达'

function normalizePersonName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePassword(value) {
  return typeof value === 'string' ? value : ''
}

function isValidRegistrationInvite(personName, inviteCode) {
  const loginRole = getWebLoginRole(personName, inviteCode, {
    accessCode: registrationCode,
    adminAccessCode,
    adminPersonName
  })
  return loginRole.ok ? loginRole : { ok: false, isAdmin: false }
}

async function createSessionResponse(pool, req, user) {
  const sessionId = createSessionId()
  const sessionUser = {
    ...user,
    sessionId
  }
  const token = createToken(sessionUser, tokenSecret)
  const profile = await upsertProfile(pool, sessionUser)
  await createLoginSession(pool, {
    id: sessionId,
    accountId: sessionUser.accountId,
    openid: sessionUser.openid,
    personName: sessionUser.personName,
    tokenHash: hashToken(token),
    userAgent: req.get('user-agent') || '',
    createdIp: req.ip || '',
    expiresAt: Date.now() + tokenTtlMs
  })

  return {
    ok: true,
    token,
    ...profile
  }
}

function createApp(pool) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  async function requireAuth(req, res, next) {
    const header = req.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    try {
      const tokenUser = verifyToken(token, tokenSecret)
      if (!tokenUser?.sessionId) {
        res.status(401).json({ ok: false, message: '登录已过期，请重新登录' })
        return
      }

      const user = await loadActiveSessionUser(pool, tokenUser.sessionId, hashToken(token))
      if (!user) {
        res.status(401).json({ ok: false, message: '登录已失效，请重新登录' })
        return
      }

      req.user = user
      next()
    } catch (error) {
      next(error)
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const username = normalizeUsername(req.body?.username)
      const password = normalizePassword(req.body?.password)
      const personName = normalizePersonName(req.body?.personName)
      const inviteCode = normalizePassword(req.body?.inviteCode)
      if (username.length < 3) {
        res.status(400).json({ ok: false, message: '账号至少需要3个字符' })
        return
      }
      if (password.length < 6) {
        res.status(400).json({ ok: false, message: '密码至少需要6个字符' })
        return
      }
      if (!personName) {
        res.status(400).json({ ok: false, message: '请选择姓名' })
        return
      }

      const role = isValidRegistrationInvite(personName, inviteCode)
      if (!role.ok) {
        res.status(401).json({ ok: false, message: '邀请码错误' })
        return
      }

      if (await loadUserAccountByUsername(pool, username)) {
        res.status(409).json({ ok: false, message: '账号名已存在' })
        return
      }
      if (await loadUserAccountByPersonName(pool, personName)) {
        res.status(409).json({ ok: false, message: '该姓名已绑定账号' })
        return
      }

      const user = await createUserAccount(pool, {
        username,
        passwordHash: hashPassword(password),
        personName,
        isAdmin: role.isAdmin
      })
      res.json(await createSessionResponse(pool, req, user))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const username = normalizeUsername(req.body?.username)
      const password = normalizePassword(req.body?.password)
      const account = await loadUserAccountByUsername(pool, username)
      if (!account || !isValidPassword(password, account.password_hash)) {
        res.status(401).json({ ok: false, message: '账号或密码错误' })
        return
      }
      if (account.enabled !== true) {
        res.status(403).json({ ok: false, message: '该账号已停用' })
        return
      }

      res.json(await createSessionResponse(pool, req, {
        accountId: Number(account.id),
        username: account.username,
        openid: `web-account:${account.id}`,
        personName: account.person_name,
        isAdmin: account.role === 'admin'
      }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/profile', requireAuth, async (req, res, next) => {
    try {
      res.json(await loadProfile(pool, req.user))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/profile/bind', requireAuth, async (req, res, next) => {
    try {
      const personName = normalizePersonName(req.body?.personName)
      if (!personName) {
        res.status(400).json({ ok: false, message: '请选择姓名' })
        return
      }
      if (!req.user.isAdmin && req.user.personName !== personName) {
        res.status(403).json({ ok: false, message: '只能绑定当前登录姓名' })
        return
      }

      res.json(await upsertProfile(pool, {
        ...req.user,
        personName
      }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/day-records', requireAuth, async (_req, res, next) => {
    try {
      res.json({ records: await loadDayRecords(pool) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/day-records/sync', requireAuth, async (req, res, next) => {
    try {
      const records = Array.isArray(req.body?.records) ? req.body.records : []
      const deletedKeys = Array.isArray(req.body?.deletedKeys) ? req.body.deletedKeys : []
      const writableRecords = filterWritableRecords(req.user, records)
      const writableDeletedKeys = filterWritableDeletedKeys(req.user, deletedKeys)

      await Promise.all(writableRecords.map(record => upsertDayRecord(pool, req.user, record)))
      await Promise.all(writableDeletedKeys.map(keyParts => deleteDayRecord(pool, keyParts)))

      res.json({ records: await loadDayRecords(pool) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/salary-inputs', requireAuth, async (req, res, next) => {
    try {
      res.json({ records: await loadSalaryInputs(pool, req.user) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/salary-inputs', requireAuth, async (req, res, next) => {
    try {
      const records = req.body?.records && typeof req.body.records === 'object' && !Array.isArray(req.body.records)
        ? req.body.records
        : {}
      const entries = Object.entries(records)
        .map(([key, value]) => [splitOverrideKey(key), value])
        .filter(([keyParts]) => keyParts && (req.user.isAdmin || keyParts.personName === req.user.personName))

      await Promise.all(entries.map(([keyParts, values]) => (
        upsertSalaryInput(pool, keyParts.personName, keyParts.date, values || {})
      )))

      res.json({ records: await loadSalaryInputs(pool, req.user) })
    } catch (error) {
      next(error)
    }
  })

  app.use((error, _req, res, _next) => {
    console.error(error)
    res.status(500).json({ ok: false, message: '服务器内部错误' })
  })

  return app
}

async function main() {
  const pool = createPool()
  await ensureSchema(pool)
  const app = createApp(pool)
  app.listen(port, () => {
    console.log(`shift schedule api listening on ${port}`)
  })
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}

module.exports = {
  createApp
}
