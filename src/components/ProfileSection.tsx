import { useEffect, useMemo, useState } from 'react'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import type { PatternOption } from './MemberRowsEditor'
import {
  SALARY_FIELDS,
  emptySalary,
  sanitizeMoneyInput,
  type SalaryInput,
  type SalaryKey,
  type SelfIdentity
} from '../data/profile'
import { getSelf, patternNameOf, selfImpact, validateSelf, type Roster, type SelfImpact } from '../data/roster'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { Select } from './Select'

interface ProfileSectionProps {
  roster: Roster
  /** 可选班序，内置在前、自定义在后 */
  patterns: PatternOption[]
  onSaveSelf: (input: SelfIdentity) => void
  onSaveSalary: (salary: SalaryInput) => void
  onNotice: (text: string) => void
}

/**
 * 个人信息：本人是谁 + 薪资基线。
 *
 * 身份与薪资**分两块、各自保存**。理由：改身份会清空薪资（换人），
 * 如果两块共用一个保存按钮，用户在改名字时顺手改了薪资，一点保存就两头都没了。
 *
 * 本人只是 `members` 里的一条，所以这里改的是那条成员的姓名与班序 ——
 * 成员表里那一行是只读的，避免出现两条编辑路径。
 */
export function ProfileSection({ roster, patterns, onSaveSelf, onSaveSalary, onNotice }: ProfileSectionProps) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const self = getSelf(roster)
  const fallbackPattern = patterns[0]?.id ?? '4F'

  const [name, setName] = useState(self?.name ?? '')
  const [patternId, setPatternId] = useState(self?.patternId ?? fallbackPattern)
  const [position, setPosition] = useState(self?.position ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState<SelfImpact | null>(null)
  useDismissOnBack(Boolean(pending), () => setPending(null))
  const [salary, setSalary] = useState<SalaryInput>(roster.profile?.salary ?? { ...emptySalary })
  const [salaryDirty, setSalaryDirty] = useState(false)

  // 外部数据变了（保存、导入、清空）就同步回来
  useEffect(() => {
    setName(self?.name ?? '')
    setPatternId(self?.patternId ?? fallbackPattern)
    setPosition(self?.position ?? '')
    setErrors([])
    setPending(null)
  }, [self?.id, self?.name, self?.patternId, self?.position, fallbackPattern])

  useEffect(() => {
    setSalary(roster.profile?.salary ?? { ...emptySalary })
    setSalaryDirty(false)
  }, [roster.profile?.salary])

  const identityDirty = useMemo(() => {
    if (!self) return Boolean(name.trim())
    return (
      name.trim() !== self.name ||
      patternId !== self.patternId ||
      position.trim() !== (self.position ?? '')
    )
  }, [self, name, patternId, position])

  const builtin = patterns.filter(option => option.builtin)
  const custom = patterns.filter(option => !option.builtin)

  function submitIdentity() {
    const input: SelfIdentity = { name: name.trim(), patternId, position: position.trim() }
    const found = validateSelf(roster, input)
    if (found.length > 0) {
      setErrors(found)
      return
    }
    setErrors([])

    // 还没设过本人 → 直接建，没有东西可清
    if (!self) {
      onSaveSelf(input)
      onNotice(`已把「${input.name}」设为本人。`)
      return
    }

    const impact = selfImpact(roster, input)
    if (!impact.changed) {
      // 姓名与班序都没变 = 没换人。只可能是改了岗位，或什么都没改。
      if (position.trim() !== (self.position ?? '')) {
        onSaveSelf(input)
        onNotice('已更新本人的岗位。')
      } else {
        onNotice('本人信息没有变化。')
      }
      return
    }
    // 有东西会丢才弹确认；只是改个名字而一条记录都没有时不必吓人
    if (impact.overrides > 0 || impact.salaryFilled > 0) {
      setPending(impact)
      return
    }
    onSaveSelf(input)
    onNotice(`已更新本人：${input.name} · ${patternNameOf(roster, input.patternId)}。`)
  }

  function confirmSwap() {
    const input: SelfIdentity = { name: name.trim(), patternId, position: position.trim() }
    onSaveSelf(input)
    setPending(null)
    onNotice(`已更换本人为「${input.name}」，此前的考勤记录与薪资已清空。`)
  }

  function patchSalary(key: SalaryKey, raw: string) {
    setSalary(current => ({ ...current, [key]: sanitizeMoneyInput(raw) }))
    setSalaryDirty(true)
  }

  function submitSalary() {
    onSaveSalary(salary)
    setSalaryDirty(false)
    onNotice('已保存薪资基线。')
  }

  return (
    <>
    <section className="settings-section profile-section">
      <div className="settings-label">
        <h2>本人</h2>
        <p className="settings-meta">
          {self ? `本人 ${self.name} · ${patternNameOf(roster, self.patternId)}` : '还没有设置本人'}
        </p>
      </div>

      <div className="settings-panel">
          <div className="profile-form">
            <label className="field">
              <span className="field-label">姓名</span>
              <input
                aria-label="本人姓名"
                autoComplete="off"
                className="input"
                maxLength={12}
                name="self-name"
                placeholder="你的姓名"
                spellCheck={false}
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">班序</span>
              <Select
                ariaLabel="本人的班序"
                groups={
                  custom.length === 0
                    ? [{ options: patterns.map(option => ({ value: option.id, label: option.name })) }]
                    : [
                      { label: '内置', options: builtin.map(option => ({ value: option.id, label: option.name })) },
                      { label: '自定义', options: custom.map(option => ({ value: option.id, label: option.name })) }
                    ]
                }
                value={patternId}
                onChange={setPatternId}
              />
            </label>

            <label className="field">
              <span className="field-label">岗位</span>
              <input
                aria-label="本人岗位"
                autoComplete="off"
                className="input"
                maxLength={12}
                name="self-position"
                placeholder="岗位（可选）"
                spellCheck={false}
                value={position}
                onChange={event => setPosition(event.target.value)}
              />
            </label>
          </div>

          {errors.length > 0 ? (
            <ul className="error-list" role="alert">
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          ) : null}

          <div className="settings-actions">
            <button
              className="btn btn-primary"
              disabled={!identityDirty}
              type="button"
              onClick={submitIdentity}
            >
              {self ? '保存本人信息' : '设为本人'}
            </button>
            {self ? null : <span className="settings-hint">设置后个人日历只显示你本人。</span>}
          </div>
      </div>
    </section>

    <section className="settings-section profile-section">
      <div className="settings-label">
        <h2>薪资</h2>
      </div>

      <div className="settings-panel">
          {self ? null : <p className="settings-hint">先设置本人，才能填薪资。</p>}

          <div className="salary-grid">
            {SALARY_FIELDS.map(field => (
              <label className="field" key={field.key}>
                <span className="field-label">
                  {field.label}
                  {field.note ? <span className="field-note">{field.note}</span> : null}
                </span>
                <div className="money-input">
                  <input
                    aria-label={field.label}
                    autoComplete="off"
                    className="input"
                    disabled={!self}
                    inputMode="decimal"
                    name={field.key}
                    placeholder="0.00"
                    value={salary[field.key]}
                    onChange={event => patchSalary(field.key, event.target.value)}
                  />
                  <span className="money-unit">元</span>
                </div>
              </label>
            ))}
          </div>

          <div className="settings-actions">
            <button
              className="btn btn-primary"
              disabled={!self || !salaryDirty}
              type="button"
              onClick={submitSalary}
            >
              保存薪资
            </button>
          </div>
      </div>
    </section>

      {pending ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setPending(null)}>
          <section
            aria-label="确认更换本人"
            aria-modal="true"
            className="dialog"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="dialog-head">
              <div>
                <h2 className="dialog-title">更换本人？</h2>
                <p className="dialog-sub">这会清空此前本人的数据，且不能撤销。</p>
              </div>
            </header>

            <ul className="impact-list">
              {pending.overrides > 0 ? (
                <li>
                  清空 <strong>{pending.overrides}</strong> 条改班记录
                  {pending.overtime > 0 ? `（含 ${pending.overtime} 条加班` : ''}
                  {pending.legal > 0 ? `${pending.overtime > 0 ? '、' : '（含 '}${pending.legal} 条法定` : ''}
                  {pending.overtime > 0 || pending.legal > 0 ? '）' : ''}
                </li>
              ) : null}
              {pending.salaryFilled > 0 ? <li>清空已填的 <strong>{pending.salaryFilled}</strong> 项薪资</li> : null}
              <li>同事的排班与记录不受影响</li>
            </ul>

            <footer className="dialog-foot">
              <div className="dialog-actions">
                <button className="btn" type="button" onClick={() => setPending(null)}>取消</button>
                <button className="btn btn-danger" type="button" onClick={confirmSwap}>确认更换</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
