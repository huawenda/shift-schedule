/** 数据实例：模块加载时建一次索引，全页共用 */
import { FSPM_TABLE, LOOKUP_GROUPS } from '../data/lookupData'
import { buildLookupIndex } from './indexes'

export const lookupIndex = buildLookupIndex(LOOKUP_GROUPS, FSPM_TABLE)
