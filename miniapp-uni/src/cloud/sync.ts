import type { Roster } from '../data/roster/model'
import { callRosterApi, cloudSupported } from './client'
import {
  emptyChangeSet,
  isEmptyChangeSet,
  mergeChangeSets,
  type SyncChangeSet
} from './diff'
import { readMeta, writeMeta } from './meta'
import { mergeLocalAndCloud, stampLocalRows, type CloudSnapshot } from './merge'

/**
 * 本地优先 + 逐行合并的云端同步。
 *
 * 写：本地立即生效，随后由 diff 增量排队、防抖推送（失败回滚队列并退避重试）。
 * 读：每次启动都拉云端，按「行级时间戳 + 墓碑」与本地逐行仲裁：
 *     - 云端更新且未删 → 采用云端；
 *     - 云端删除比本地修改新 → 本地也删；
 *     - 其余 → 本地赢，并把这行推上去。
 * 这样模拟器与真机（同一个 openid）打开后看到的是同一份数据。
 */

const FLUSH_DELAY = 800
const RETRY_BASE = 2000
const MAX_RETRY = 4

const EMPTY_CLOUD: CloudSnapshot = {
  members: [],
  patterns: [],
  dayRecords: [],
  todos: [],
  profile: null
}

export interface SyncHost {
  /** 当前本地的整份 roster */
  snapshot: () => Roster
  /** 用合并后的数据替换本地（不触发回推） */
  adopt: (roster: Roster) => void
}

let pending: SyncChangeSet = emptyChangeSet()
let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let retries = 0
let enabled = false

function schedule(delay = FLUSH_DELAY) {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, delay)
}

async function flush() {
  if (flushing || isEmptyChangeSet(pending)) return

  flushing = true
  const batch = pending
  pending = emptyChangeSet()

  try {
    await callRosterApi({ action: 'apply', payload: batch })
    retries = 0
  } catch (error) {
    pending = mergeChangeSets(batch, pending)
    retries += 1
    if (retries <= MAX_RETRY) {
      schedule(RETRY_BASE * retries)
    } else {
      console.warn('[cloud] 同步多次失败，本轮暂停重试', error)
      retries = 0
    }
  } finally {
    flushing = false
    if (!isEmptyChangeSet(pending) && timer === null && retries > 0 && retries <= MAX_RETRY) {
      schedule(RETRY_BASE * retries)
    }
  }
}

/** 交给 store 调用：每次 commit 后传 diff 结果进来 */
export function enqueue(changes: SyncChangeSet) {
  if (!enabled || isEmptyChangeSet(changes)) return
  pending = mergeChangeSets(pending, changes)
  schedule()
}

async function loadRemote(): Promise<CloudSnapshot> {
  const result = await callRosterApi<CloudSnapshot>({ action: 'load' })
  return result.data ?? EMPTY_CLOUD
}

async function bootstrap(host: SyncHost) {
  try {
    const local = host.snapshot()
    let meta = readMeta()

    // 首次同步：给本地已有行补时间戳，避免被云端的旧记录覆盖
    if (Object.keys(meta.rows).length === 0 && Object.keys(meta.tombstones).length === 0) {
      meta = stampLocalRows(local)
      writeMeta(meta)
    }

    const cloud = await loadRemote()
    const result = mergeLocalAndCloud(local, meta, cloud)

    if (result.changed) host.adopt(result.roster)
    writeMeta(result.meta)

    pending = mergeChangeSets(pending, result.push)
    if (!isEmptyChangeSet(pending)) schedule()
  } catch (error) {
    console.warn('[cloud] 启动同步失败，继续用本地数据', error)
  }
}

/** 启动同步：小程序端才会真正联网，H5 里直接返回 */
export function startCloudSync(host: SyncHost): void {
  if (!cloudSupported || enabled) return
  enabled = true
  void bootstrap(host)
}
