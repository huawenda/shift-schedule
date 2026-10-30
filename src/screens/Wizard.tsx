import { useMemo, useState } from 'react'
import { fromRows, MemberRowsEditor, createRow, type MemberRow, type PatternOption } from '../components/MemberRowsEditor'
import { Select } from '../components/Select'
import { BUILTIN_PATTERNS, PATTERN_ANCHOR_DATE } from '../data/patterns'
import { validateMembers, type Member } from '../data/roster'
import type { SelfIdentity } from '../data/profile'

/** 首开时还没有自定义班序，下拉里只有内置 13 条 */
const BUILTIN_OPTIONS: PatternOption[] = BUILTIN_PATTERNS.map(pattern => ({
  id: pattern.id,
  name: pattern.id,
  builtin: true
}))

interface WizardProps {
  onFinish: (self: SelfIdentity, members: Member[]) => void
  onSkip: () => void
}

/**
 * 首次配置：三步 —— 先填你自己，再（可选）加同事，最后确认。
 *
 * 先问本人是因为日历要锁定本人：没有本人就没有「我的月历」，
 * 让用户先填同事再补本人，等于让他进门就撞一堵空墙。
 *
 * 同事这一步可以整步跳过 —— 一个人也能用，班表只反映自己的节奏。
 */
export function Wizard({ onFinish, onSkip }: WizardProps) {
  const [step, setStep] = useState(1)
  const [selfName, setSelfName] = useState('')
  const [selfPattern, setSelfPattern] = useState(BUILTIN_OPTIONS[0]?.id ?? '4F')
  const [rows, setRows] = useState<MemberRow[]>(() => [createRow('4F')])

  const colleagues = useMemo(() => fromRows(rows), [rows])
  const selfErrors = useMemo(() => {
    const errors: string[] = []
    const name = selfName.trim()
    if (!name) errors.push('请填上你的姓名')
    else if (name.length > 12) errors.push('姓名请控制在 12 个字以内')
    return errors
  }, [selfName])

  const colleagueErrors = useMemo(
    () =>
      colleagues.length === 0
        ? []
        : validateMembers(colleagues, [], { selfName: selfName.trim() }),
    [colleagues, selfName]
  )

  const canNext = step === 1 ? selfErrors.length === 0 : step === 2 ? colleagueErrors.length === 0 : true

  return (
    <div className="wizard">
      <div className="wizard-card">
        <header className="wizard-head">
          <span className="wizard-step">第 {step} / 3 步</span>
          <h1 className="wizard-title">
            {step === 1 ? '先填你自己' : step === 2 ? '加上同班组的同事（可选）' : '确认一下'}
          </h1>
        </header>

        {step === 1 ? (
          <div className="wizard-body">
            <p className="wizard-lead">
              这是一个个人记录工具：排班、加班、薪资都记在你自己名下。
              13 条常用班序（4F–4X）已经内置好，规律不用你填。
            </p>

            <div className="wizard-self">
              <label className="field">
                <span className="field-label">你的姓名</span>
                <input
                  aria-label="本人姓名"
                  autoComplete="off"
                  autoFocus
                  className="input"
                  maxLength={12}
                  name="self-name"
                  placeholder="比如：华文达"
                  spellCheck={false}
                  value={selfName}
                  onChange={event => setSelfName(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">你的班序</span>
                <Select
                  ariaLabel="本人的班序"
                  groups={[{ options: BUILTIN_OPTIONS.map(option => ({ value: option.id, label: option.name })) }]}
                  value={selfPattern}
                  onChange={setSelfPattern}
                />
              </label>
            </div>

            <ul className="wizard-list">
              <li><strong>日历只显示你自己</strong>：换别人的日历改班，改的也不是你的数据。</li>
              <li><strong>矩阵保留全组</strong>：看谁今天和你一起上夜班，顺手也能改全组班次。</li>
              <li><strong>改自己 = 换人</strong>：以后改姓名或班序，会清空你名下的记录（会先问你）。</li>
              <li><strong>数据只在这台电脑</strong>：不联网、不需要账号，记得定期导出备份。</li>
            </ul>

            {selfErrors.length > 0 ? (
              <ul className="error-list" role="alert">
                {selfErrors.map(error => <li key={error}>{error}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <p className="wizard-lead">
              把同班组的同事加进来，矩阵里就能看到整组的班。这一步可以跳过，以后在设置里也能加。
            </p>
            <MemberRowsEditor patterns={BUILTIN_OPTIONS} rows={rows} onChange={setRows} />
            {colleagueErrors.length > 0 ? (
              <ul className="error-list" role="alert">
                {colleagueErrors.map(error => <li key={error}>{error}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <p className="wizard-lead">
              班序从 {PATTERN_ANCHOR_DATE} 起算，前后任意月份都能排。
            </p>
            <div className="wizard-summary">
              <div className="wizard-summary-row is-self">
                <span>{selfName.trim()}</span>
                <span className="muted">{selfPattern} · 本人</span>
              </div>
              {colleagues.map(member => (
                <div className="wizard-summary-row" key={member.id}>
                  <span>{member.name}</span>
                  <span className="muted">
                    {[member.patternId, member.position].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
            <p className="wizard-note">
              {colleagues.length === 0
                ? '只有你一个人，矩阵里目前只会有你自己这一行。'
                : `另有 ${colleagues.length} 位同事。`}
              想改人、加人、换班序或新建班序，都可以在「设置」里做。
            </p>
          </div>
        ) : null}

        <footer className="wizard-foot">
          <div className="wizard-foot-left">
            {step > 1 ? (
              <button className="btn" type="button" onClick={() => setStep(current => current - 1)}>上一步</button>
            ) : (
              <button className="btn btn-quiet" type="button" onClick={onSkip}>稍后配置</button>
            )}
          </div>
          {step < 3 ? (
            <button className="btn btn-primary" disabled={!canNext} type="button" onClick={() => setStep(step + 1)}>
              {step === 2 && colleagues.length === 0 ? '跳过，下一步' : '下一步'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => onFinish({ name: selfName.trim(), patternId: selfPattern }, colleagues)}
            >
              进入排班表
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
