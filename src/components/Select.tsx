import { cn } from 'cn'

import {
  Select as SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectGroup {
  /** 分组小标题；不传就不画标题（只有一组时用） */
  label?: string
  options: SelectOption[]
}

interface SelectProps {
  ariaLabel: string
  className?: string
  disabled?: boolean
  groups: SelectGroup[]
  value: string
  onChange: (value: string) => void
}

/**
 * Radix 的 Select 不允许「值等于空字符串」的选项 —— 它把这个值留给自己表示「未选择」。
 * 但业务里「未分组」就是一个正常的可选项（groupId 为空串），所以两边各转一次：
 * 传给 Radix 时换成哨兵值，回调时再换回空串。调用方完全感知不到。
 */
const EMPTY = '__empty__'
const encode = (value: string) => (value === '' ? EMPTY : value)
const decode = (value: string) => (value === EMPTY ? '' : value)

/**
 * 下拉选择：外壳换成 shadcn 的 `Select`，对外 API 保持原样。
 *
 * 之前的实现是 269 行自绘（portal 定位、键盘导航、分组标题、active 行、翻转判断）。
 * 这些 Radix 全都有，而且更完整（typeahead、屏幕阅读器朗读、碰撞检测、模态层）。
 * 保留同一套 `groups` / `value` / `onChange` 的原因：调用点分布在成员表、个人资料和向导里，
 * 换 API 要改七八处业务代码，而形状本来一一对应。
 *
 * `className` 落到 trigger 上：调用方传的都是布局类（`member-field-group` 的 grid-area 之类），
 * 放在触发按钮上语义一致。
 */
export function Select({ ariaLabel, className, disabled, groups, onChange, value }: SelectProps) {
  const options = groups.flatMap(group => group.options)
  const current = options.find(option => option.value === value)

  return (
    <SelectRoot
      disabled={disabled}
      value={encode(value)}
      onValueChange={next => onChange(decode(next))}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue placeholder="请选择">{current?.label ?? '请选择'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {groups.map((group, index) => (
          <SelectGroup key={group.label ?? `group-${index}`}>
            {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
            {group.options.map(option => (
              <SelectItem key={option.value || EMPTY} value={encode(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </SelectRoot>
  )
}
