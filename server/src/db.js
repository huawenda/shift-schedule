const { Pool } = require('pg')
const { formatTimestamp } = require('./records')

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL
  })
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id BIGSERIAL PRIMARY KEY,
      openid TEXT NOT NULL UNIQUE,
      person_name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      bound_at BIGINT NOT NULL,
      bound_at_text TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_at_text TEXT NOT NULL
    );

    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS day_records (
      id BIGSERIAL PRIMARY KEY,
      openid TEXT NOT NULL,
      person_name TEXT NOT NULL,
      record_date TEXT NOT NULL,
      shift_override TEXT,
      overtime_hours NUMERIC NOT NULL DEFAULT 0,
      is_legal_overtime BOOLEAN NOT NULL DEFAULT FALSE,
      leave_duration TEXT,
      created_at BIGINT NOT NULL,
      created_at_text TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_at_text TEXT NOT NULL,
      UNIQUE (person_name, record_date)
    );

    CREATE TABLE IF NOT EXISTS salary_inputs (
      id BIGSERIAL PRIMARY KEY,
      person_name TEXT NOT NULL,
      month TEXT NOT NULL,
      base_salary TEXT NOT NULL DEFAULT '',
      performance_allowance TEXT NOT NULL DEFAULT '',
      position_allowance TEXT NOT NULL DEFAULT '',
      other_deductions TEXT NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL,
      updated_at_text TEXT NOT NULL,
      UNIQUE (person_name, month)
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY,
      openid TEXT NOT NULL,
      person_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT NOT NULL DEFAULT '',
      created_ip TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      created_at_text TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      expires_at_text TEXT NOT NULL,
      revoked_at BIGINT,
      revoked_at_text TEXT
    );
  `)
}

function profileRowToApi(row, isAdmin = row?.role === 'admin') {
  if (!row) return null

  return {
    openid: row.openid,
    isAdmin,
    profile: {
      _id: String(row.id),
      _openid: row.openid,
      personName: row.person_name,
      boundAt: Number(row.bound_at),
      boundAtText: row.bound_at_text,
      updatedAt: Number(row.updated_at),
      updatedAtText: row.updated_at_text
    }
  }
}

async function upsertProfile(pool, user) {
  const now = Date.now()
  const nowText = formatTimestamp(now)
  const response = await pool.query(`
    INSERT INTO user_profiles (
      openid,
      person_name,
      role,
      enabled,
      bound_at,
      bound_at_text,
      updated_at,
      updated_at_text
    )
    VALUES ($1, $2, $3, TRUE, $4, $5, $4, $5)
    ON CONFLICT (openid)
    DO UPDATE SET
      person_name = EXCLUDED.person_name,
      role = EXCLUDED.role,
      updated_at = EXCLUDED.updated_at,
      updated_at_text = EXCLUDED.updated_at_text
    RETURNING *
  `, [
    user.openid,
    user.personName,
    user.isAdmin ? 'admin' : 'user',
    now,
    nowText
  ])

  return profileRowToApi(response.rows[0])
}

async function loadProfile(pool, user) {
  const response = await pool.query('SELECT * FROM user_profiles WHERE openid = $1 LIMIT 1', [user.openid])
  if (response.rows[0]) return profileRowToApi(response.rows[0], user.isAdmin)

  return upsertProfile(pool, user)
}

async function loadProfileByPersonName(pool, personName) {
  const response = await pool.query('SELECT * FROM user_profiles WHERE person_name = $1 LIMIT 1', [personName])
  return response.rows[0] ?? null
}

async function createLoginSession(pool, session) {
  const now = Date.now()
  const nowText = formatTimestamp(now)
  await pool.query(`
    INSERT INTO login_sessions (
      id,
      openid,
      person_name,
      token_hash,
      user_agent,
      created_ip,
      created_at,
      created_at_text,
      expires_at,
      expires_at_text
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    session.id,
    session.openid,
    session.personName,
    session.tokenHash,
    session.userAgent || '',
    session.createdIp || '',
    now,
    nowText,
    session.expiresAt,
    formatTimestamp(session.expiresAt)
  ])
}

async function loadActiveSessionUser(pool, sessionId, tokenHash, now = Date.now()) {
  const response = await pool.query(`
    SELECT
      login_sessions.id,
      user_profiles.openid,
      user_profiles.person_name,
      user_profiles.role,
      user_profiles.enabled
    FROM login_sessions
    INNER JOIN user_profiles
      ON user_profiles.openid = login_sessions.openid
    WHERE login_sessions.id = $1
      AND login_sessions.token_hash = $2
      AND login_sessions.revoked_at IS NULL
      AND login_sessions.expires_at > $3
      AND user_profiles.enabled = TRUE
    LIMIT 1
  `, [sessionId, tokenHash, now])
  const row = response.rows[0]
  if (!row) return null

  return {
    openid: row.openid,
    personName: row.person_name,
    isAdmin: row.role === 'admin'
  }
}

function dayRecordRowToApi(row) {
  return {
    _id: String(row.id),
    _openid: row.openid,
    personName: row.person_name,
    date: row.record_date,
    shiftOverride: row.shift_override || undefined,
    overtimeHours: Number(row.overtime_hours || 0),
    isLegalOvertime: row.is_legal_overtime === true,
    leaveDuration: row.leave_duration || undefined,
    createdAt: Number(row.created_at),
    createdAtText: row.created_at_text,
    updatedAt: Number(row.updated_at),
    updatedAtText: row.updated_at_text
  }
}

async function loadDayRecords(pool) {
  const response = await pool.query(`
    SELECT *
    FROM day_records
    ORDER BY person_name ASC, record_date ASC
  `)

  return response.rows.map(dayRecordRowToApi)
}

async function upsertDayRecord(pool, user, record) {
  const now = Date.now()
  const nowText = formatTimestamp(now)
  await pool.query(`
    INSERT INTO day_records (
      openid,
      person_name,
      record_date,
      shift_override,
      overtime_hours,
      is_legal_overtime,
      leave_duration,
      created_at,
      created_at_text,
      updated_at,
      updated_at_text
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $9)
    ON CONFLICT (person_name, record_date)
    DO UPDATE SET
      openid = EXCLUDED.openid,
      shift_override = EXCLUDED.shift_override,
      overtime_hours = EXCLUDED.overtime_hours,
      is_legal_overtime = EXCLUDED.is_legal_overtime,
      leave_duration = EXCLUDED.leave_duration,
      updated_at = EXCLUDED.updated_at,
      updated_at_text = EXCLUDED.updated_at_text
  `, [
    user.openid,
    record.personName,
    record.date,
    record.shiftOverride,
    record.overtimeHours,
    record.isLegalOvertime,
    record.leaveDuration,
    now,
    nowText
  ])
}

async function deleteDayRecord(pool, keyParts) {
  await pool.query(
    'DELETE FROM day_records WHERE person_name = $1 AND record_date = $2',
    [keyParts.personName, keyParts.date]
  )
}

function salaryRowToEntry(row) {
  return [
    `${row.person_name}::${row.month}`,
    {
      baseSalary: row.base_salary,
      performanceAllowance: row.performance_allowance,
      positionAllowance: row.position_allowance,
      otherDeductions: row.other_deductions
    }
  ]
}

async function loadSalaryInputs(pool, user) {
  const response = user.isAdmin
    ? await pool.query('SELECT * FROM salary_inputs ORDER BY person_name ASC, month ASC')
    : await pool.query('SELECT * FROM salary_inputs WHERE person_name = $1 ORDER BY month ASC', [user.personName])

  return Object.fromEntries(response.rows.map(salaryRowToEntry))
}

async function upsertSalaryInput(pool, personName, month, values) {
  const now = Date.now()
  await pool.query(`
    INSERT INTO salary_inputs (
      person_name,
      month,
      base_salary,
      performance_allowance,
      position_allowance,
      other_deductions,
      updated_at,
      updated_at_text
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (person_name, month)
    DO UPDATE SET
      base_salary = EXCLUDED.base_salary,
      performance_allowance = EXCLUDED.performance_allowance,
      position_allowance = EXCLUDED.position_allowance,
      other_deductions = EXCLUDED.other_deductions,
      updated_at = EXCLUDED.updated_at,
      updated_at_text = EXCLUDED.updated_at_text
  `, [
    personName,
    month,
    typeof values.baseSalary === 'string' ? values.baseSalary : '',
    typeof values.performanceAllowance === 'string' ? values.performanceAllowance : '',
    typeof values.positionAllowance === 'string' ? values.positionAllowance : '',
    typeof values.otherDeductions === 'string' ? values.otherDeductions : '',
    now,
    formatTimestamp(now)
  ])
}

module.exports = {
  createLoginSession,
  createPool,
  deleteDayRecord,
  ensureSchema,
  loadActiveSessionUser,
  loadDayRecords,
  loadProfile,
  loadProfileByPersonName,
  loadSalaryInputs,
  upsertDayRecord,
  upsertProfile,
  upsertSalaryInput
}
