package com.shiftschedule.core.repository

import com.shiftschedule.core.SalaryInputValues
import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.sync.DayOverrides
import kotlinx.coroutines.flow.Flow

/**
 * 数据访问接缝（后端预留点）：
 * - 纯本地阶段由 :core:data 的 Room/DataStore 实现；
 * - 将来接后端时，新增远端实现（如 Supabase）+ 同步协调器即可，
 *   ViewModel/UI 只依赖这里的接口，无需改动。
 */
interface DayRecordsRepository {
    /** 观察全量覆盖记录聚合（排班覆盖 + 加班/法定/请假），供排班与统计展示使用。 */
    fun observeOverrides(): Flow<DayOverrides>

    /** 设置或清除（shift = null）某人的班次覆盖。 */
    suspend fun setShiftOverride(personName: String, date: String, shift: ShiftType?)

    /** 写入某人的私有记录（加班时长 / 法定标记 / 请假时长）。 */
    suspend fun setPrivateRecord(
        personName: String,
        date: String,
        overtimeHours: Double,
        isLegalOvertime: Boolean,
        leaveDuration: LeaveDuration?
    )

    /** 清除某人某日全部覆盖与私有记录。 */
    suspend fun clearDayRecords(personName: String, date: String)
}

interface SalaryRepository {
    fun observeSalaryInput(personName: String, month: String): Flow<SalaryInputValues?>

    suspend fun saveSalaryInput(personName: String, month: String, input: SalaryInputValues)
}

interface SettingsRepository {
    /** “我是谁”——当前查看/编辑视角的人员姓名。 */
    val currentPersonName: Flow<String?>

    suspend fun setCurrentPersonName(name: String)
}
