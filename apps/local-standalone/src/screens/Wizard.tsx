import { useMemo, useState } from 'react'
import { fromRows, MemberRowsEditor, createRow, type MemberRow } from '../components/MemberRowsEditor'
import { PATTERN_ANCHOR_DATE } from '../data/patterns'
import { validateMembers, type Member } from '../data/roster'

interface WizardProps {
  onFinish: (members: Member[]) => void
  onSkip: () => void
}

/**
 * 首次配置：三步向导。
 * 只在成员数为 0 时出现，可以跳过（跳到空状态，不阻塞使用）。
 */
export function Wizard({ onFinish, onSkip }: WizardProps) {
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState<MemberRow[]>(() => [createRow('4F'), createRow('4G'), createRow('4H')])

  const members = useMemo(() => fromRows(rows), [rows])
  const errors = useMemo(() => validateMembers(members), [members])

  function next() {
    if (step === 2 && errors.length > 0) return
    setStep(current => Math.min(3, current + 1))
  }

  return (
    <div className="wizard">
      <div className="wizard-card">
        <header className="wizard-head">
          <span className="wizard-step">第 {step} / 3 步</span>
          <h1 className="wizard-title">
            {step === 1 ? '先认识一下这个工具' : step === 2 ? '把成员加到班序上' : '确认一下'}
          </h1>
        </header>

        {step === 1 ? (
          <div className="wizard-body">
            <p className="wizard-lead">
              倒班表按一套固定的 24 天班序循环排班。13 条班序（4F–4X）已经内置好，规律不用你填。
            </p>
            <ul className="wizard-list">
              <li><strong>班序是固定的</strong>：规律照搬 4F–4X，只选不改。</li>
              <li><strong>人是自由的</strong>：姓名自己填，人数不限，同一个班序可以挂多人。</li>
              <li><strong>改班随时可做</strong>：点某天的格子换成别的班次，改回原样就等于撤销。</li>
              <li><strong>数据只在这台电脑</strong>：不联网、不需要账号，记得定期导出备份。</li>
            </ul>
            <p className="wizard-note">班序从 {PATTERN_ANCHOR_DATE} 起算，前后任意月份都能排。</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <p className="wizard-lead">填姓名，选他/她对应的班序。同一班序可以挂多个人。</p>
            <MemberRowsEditor rows={rows} onChange={setRows} />
            {errors.length > 0 ? (
              <ul className="error-list" role="alert">
                {errors.map(error => <li key={error}>{error}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <p className="wizard-lead">
              共 <strong>{members.length}</strong> 位成员，班序从 {PATTERN_ANCHOR_DATE} 起算。
            </p>
            <div className="wizard-summary">
              {members.map(member => (
                <div className="wizard-summary-row" key={member.id}>
                  <span>{member.name}</span>
                  <span className="muted">{member.patternId}{member.label ? ` · ${member.label}` : ''}</span>
                </div>
              ))}
            </div>
            <p className="wizard-note">后面想改人、加人或换班序，都可以在「设置」里做。</p>
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
            <button className="btn btn-primary" disabled={step === 2 && errors.length > 0} type="button" onClick={next}>
              下一步
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => onFinish(members)}>
              进入排班表
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
