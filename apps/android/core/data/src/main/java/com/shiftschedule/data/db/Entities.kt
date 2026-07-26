package com.shiftschedule.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity

/**
 * 表结构沿用 Supabase schema（docs/supabase-schema.sql）：
 * 相同的表名、列名与主键约定，并保留 updated_at_ms，
 * 将来做云同步时本地数据可零迁移直接映射。
 */
@Entity(
    tableName = "day_shift_overrides",
    primaryKeys = ["person_name", "record_date"]
)
data class ShiftOverrideEntity(
    @ColumnInfo(name = "person_name") val personName: String,
    @ColumnInfo(name = "record_date") val recordDate: String,
    @ColumnInfo(name = "shift_override") val shiftOverride: String,
    @ColumnInfo(name = "updated_at_ms") val updatedAtMs: Long
)

@Entity(
    tableName = "day_private_records",
    primaryKeys = ["person_name", "record_date"]
)
data class DayPrivateRecordEntity(
    @ColumnInfo(name = "person_name") val personName: String,
    @ColumnInfo(name = "record_date") val recordDate: String,
    @ColumnInfo(name = "overtime_hours") val overtimeHours: Double,
    @ColumnInfo(name = "is_legal_overtime") val isLegalOvertime: Boolean,
    @ColumnInfo(name = "leave_duration") val leaveDuration: String?,
    @ColumnInfo(name = "updated_at_ms") val updatedAtMs: Long
)

@Entity(
    tableName = "salary_inputs",
    primaryKeys = ["person_name", "month"]
)
data class SalaryInputEntity(
    @ColumnInfo(name = "person_name") val personName: String,
    @ColumnInfo(name = "month") val month: String,
    @ColumnInfo(name = "base_salary") val baseSalary: String,
    @ColumnInfo(name = "performance_allowance") val performanceAllowance: String,
    @ColumnInfo(name = "position_allowance") val positionAllowance: String,
    @ColumnInfo(name = "other_deductions") val otherDeductions: String,
    @ColumnInfo(name = "updated_at_ms") val updatedAtMs: Long
)
