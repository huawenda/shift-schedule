import { Text, View } from '@tarojs/components'

interface Props {
  syncing: boolean
  blocked: boolean
  onRetry: () => void
}

/**
 * 云同步状态胶囊（月历页顶栏中部）。
 * 灰点=同步中，绿点=已同步，红点=失败（整颗可点重试）。
 * 未登录 / 未绑定用户由调用方负责不渲染本组件。
 */
export default function SyncPill({ syncing, blocked, onRetry }: Props) {
  const state = blocked ? 'is-err' : syncing ? 'is-syncing' : 'is-ok'
  const label = blocked ? '同步失败' : syncing ? '同步中' : '已同步'

  return (
    <View
      className={`sync-pill ${state}`}
      hoverClass={blocked ? 'press-dim' : 'none'}
      onClick={blocked ? onRetry : undefined}
    >
      <View className="sync-pill-dot" />
      <Text>{label}</Text>
      {blocked ? <Text className="sync-pill-act">重试</Text> : null}
    </View>
  )
}
