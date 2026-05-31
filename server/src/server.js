const express = require('express')
const {
  createPool,
  deleteDayRecord,
  ensureSchema,
  loadDayRecords,
  loadProfile,
  loadSalaryInputs,
  upsertDayRecord,
  upsertProfile,
  upsertSalaryInput
} = require('./db')
const { createToken, getWebLoginRole, verifyToken } = require('./auth')
const {
  filterWritableDeletedKeys,
  filterWritableRecords,
  splitOverrideKey
} = require('./records')

const port = Number(process.env.PORT || 3000)
const accessCode = process.env.WEB_ACCESS_CODE || 'change-me'
const adminAccessCode = process.env.ADMIN_ACCESS_CODE || ''
const tokenSecret = process.env.TOKEN_SECRET || 'change-this-token-secret'
const adminPersonName = process.env.ADMIN_PERSON_NAME || '华文达'

function normalizePersonName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getUserForPerson(personName, isAdmin) {
  return {
    openid: `web:${personName}`,
    personName,
    isAdmin
  }
}

function createApp(pool) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  function requireAuth(req, res, next) {
    const header = req.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    const user = verifyToken(token, tokenSecret)
    if (!user) {
      res.status(401).json({ ok: false, message: '登录已过期，请重新登录' })
      return
    }

    req.user = user
    next()
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const personName = normalizePersonName(req.body?.personName)
      if (!personName) {
        res.status(400).json({ ok: false, message: '请选择姓名' })
        return
      }
      const loginRole = getWebLoginRole(personName, req.body?.accessCode, {
        accessCode,
        adminAccessCode,
        adminPersonName
      })
      if (!loginRole.ok) {
        res.status(401).json({ ok: false, message: '口令错误' })
        return
      }

      const user = getUserForPerson(personName, loginRole.isAdmin)
      const profile = await upsertProfile(pool, user)
      res.json({
        ok: true,
        token: createToken(user, tokenSecret),
        ...profile
      })
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
