package com.shiftschedule.data

import com.shiftschedule.core.SalaryInputValues
import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.repository.DayRecordsRepository
import com.shiftschedule.core.repository.SalaryRepository
import com.shiftschedule.core.sync.DayOverrides
import com.shiftschedule.core.sync.getOverrideKey
import com.shiftschedule.data.db.AppDatabase
import com.shiftschedule.data.db.DayPrivateRecordEntity
import com.shiftschedule.data.db.SalaryInputEntity
import com.shiftschedule.data.db.ShiftOverrideEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

/** Room 实现的本地仓储；将来加后端时以同步协调器组合远端实现替换。 */
class RoomDayRecordsRepository(private val db: AppDatabase) : DayRecordsRepository {

    override fun observeOverrides(): Flow<DayOverrides> = combine(
        db.shiftOverrideDao().observeAll(),
        db.dayPrivateRecordDao().observeAll()
    ) { shiftRows, privateRows ->
        val shiftOverrides = LinkedHashMap<String, ShiftType>()
        val overtimeOverrides = LinkedHashMap<String, Double>()
        val legalOverrides = LinkedHashMap<String, Boolean>()
        val leaveDurationOverrides = LinkedHashMap<String, LeaveDuration>()

        shiftRows.forEach { row ->
            ShiftType.fromLabel(row.shiftOverride)?.let { shift ->
                shiftOverrides[getOverrideKey(row.personName, row.recordDate)] = shift
            }
        }
        privateRows.forEach { row ->
            val key = getOverrideKey(row.personName, row.recordDate)
            if (row.overtimeHours > 0) overtimeOverrides[key] = row.overtimeHours
            if (row.isLegalOvertime) legalOverrides[key] = true
            LeaveDuration.fromLabel(row.leaveDuration)?.let { leaveDurationOverrides[key] = it }
        }

        DayOverrides(
            shiftOverrides = shiftOverrides,
            overtimeOverrides = overtimeOverrides,
            legalOverrides = legalOverrides,
            leaveDurationOverrides = leaveDurationOverrides
        )
    }

    override suspend fun setShiftOverride(personName: String, date: String, shift: ShiftType?) {
        if (shift == null) {
            db.shiftOverrideDao().delete(personName, date)
        } else {
            db.shiftOverrideDao().upsert(
                ShiftOverrideEntity(
                    personName = personName,
                    recordDate = date,
                    shiftOverride = shift.label,
                    updatedAtMs = System.currentTimeMillis()
                )
            )
        }
    }

    override suspend fun setPrivateRecord(
        personName: String,
        date: String,
        overtimeHours: Double,
        isLegalOvertime: Boolean,
        leaveDuration: LeaveDuration?
    ) {
        if (overtimeHours <= 0 && !isLegalOvertime && leaveDuration == null) {
            // 全空私有记录不落库，保持表内只有有效数据（与云记录语义一致）
            db.dayPrivateRecordDao().delete(personName, date)
            return
        }
        db.dayPrivateRecordDao().upsert(
            DayPrivateRecordEntity(
                personName = personName,
                recordDate = date,
                overtimeHours = overtimeHours,
                isLegalOvertime = isLegalOvertime,
                leaveDuration = leaveDuration?.label,
                updatedAtMs = System.currentTimeMillis()
            )
        )
    }

    override suspend fun clearDayRecords(personName: String, date: String) {
        db.shiftOverrideDao().delete(personName, date)
        db.dayPrivateRecordDao().delete(personName, date)
    }
}

class RoomSalaryRepository(private val db: AppDatabase) : SalaryRepository {

    override fun observeSalaryInput(personName: String, month: String): Flow<SalaryInputValues?> =
        db.salaryInputDao().observe(personName, month).map { entity ->
            entity?.let {
                SalaryInputValues(
                    baseSalary = it.baseSalary,
                    performanceAllowance = it.performanceAllowance,
                    positionAllowance = it.positionAllowance,
                    otherDeductions = it.otherDeductions
                )
            }
        }

    override suspend fun saveSalaryInput(personName: String, month: String, input: SalaryInputValues) {
        db.salaryInputDao().upsert(
            SalaryInputEntity(
                personName = personName,
                month = month,
                baseSalary = input.baseSalary,
                performanceAllowance = input.performanceAllowance,
                positionAllowance = input.positionAllowance,
                otherDeductions = input.otherDeductions,
                updatedAtMs = System.currentTimeMillis()
            )
        )
    }
}
