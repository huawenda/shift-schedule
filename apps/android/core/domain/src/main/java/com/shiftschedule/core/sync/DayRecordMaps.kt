package com.shiftschedule.core.sync

import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.normalizeOvertimeHours
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * 覆盖记录的 key 约定与云同步载荷映射。
 * 纯本地阶段已用于内存态聚合；将来接后端时，这里的 DayRecord 字段
 * 与 Supabase day_shift_overrides / day_private_records 表一一对应。
 */
typealias ShiftOverrides = Map<String, ShiftType>
typealias OvertimeOverrides = Map<String, Double>
typealias LegalOverrides = Map<String, Boolean>
typealias LeaveDurationOverrides = Map<String, LeaveDuration>

data class DayRecord(
    val personName: String,
    val date: String,
    val shiftOverride: ShiftType? = null,
    val overtimeHours: Double = 0.0,
    val isLegalOvertime: Boolean = false,
    val leaveDuration: LeaveDuration? = null,
    val createdAtMs: Long? = null,
    val updatedAtMs: Long? = null
)

data class DayOverrides(
    val shiftOverrides: ShiftOverrides,
    val overtimeOverrides: OvertimeOverrides,
    val legalOverrides: LegalOverrides,
    val leaveDurationOverrides: LeaveDurationOverrides
)

fun getOverrideKey(personName: String, date: String): String = "$personName::$date"

fun splitOverrideKey(key: String): Pair<String, String>? {
    val parts = key.split("::")
    if (parts.size != 2 || parts[0].isEmpty() || parts[1].isEmpty()) return null
    return parts[0] to parts[1]
}

private val chinaTimestampFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.ofHours(8))

fun formatCloudTimestamp(timestamp: Long): String =
    chinaTimestampFormatter.format(Instant.ofEpochMilli(timestamp))

fun hasDayRecordChanged(existingRecord: DayRecord, nextRecord: DayRecord): Boolean =
    existingRecord.personName != nextRecord.personName ||
        existingRecord.date != nextRecord.date ||
        existingRecord.shiftOverride != nextRecord.shiftOverride ||
        normalizeOvertimeHours(existingRecord.overtimeHours) != normalizeOvertimeHours(nextRecord.overtimeHours) ||
        existingRecord.isLegalOvertime != nextRecord.isLegalOvertime ||
        existingRecord.leaveDuration != nextRecord.leaveDuration

fun getDeletedRecordKeys(
    existingRecords: List<DayRecord>,
    nextRecords: List<DayRecord>,
    deletedKeys: List<String>
): List<String> {
    val nextKeys = nextRecords.map { getOverrideKey(it.personName, it.date) }.toSet()
    return existingRecords
        .map { getOverrideKey(it.personName, it.date) }
        .filter { key -> key in deletedKeys && key !in nextKeys }
}

fun recordsToOverrides(records: List<DayRecord>): DayOverrides {
    val shiftOverrides = LinkedHashMap<String, ShiftType>()
    val overtimeOverrides = LinkedHashMap<String, Double>()
    val legalOverrides = LinkedHashMap<String, Boolean>()
    val leaveDurationOverrides = LinkedHashMap<String, LeaveDuration>()

    records.forEach { record ->
        val key = getOverrideKey(record.personName, record.date)
        record.shiftOverride?.let { shiftOverrides[key] = it }

        val overtimeHours = normalizeOvertimeHours(record.overtimeHours)
        if (overtimeHours > 0) {
            overtimeOverrides[key] = overtimeHours
        }
        if (record.isLegalOvertime) {
            legalOverrides[key] = true
        }
        if (record.shiftOverride == ShiftType.LEAVE && record.leaveDuration != null) {
            leaveDurationOverrides[key] = record.leaveDuration
        }
    }

    return DayOverrides(
        shiftOverrides = shiftOverrides,
        overtimeOverrides = overtimeOverrides,
        legalOverrides = legalOverrides,
        leaveDurationOverrides = leaveDurationOverrides
    )
}

fun buildDayRecords(
    shiftOverrides: ShiftOverrides,
    overtimeOverrides: OvertimeOverrides,
    legalOverrides: LegalOverrides = emptyMap(),
    leaveDurationOverrides: LeaveDurationOverrides = emptyMap()
): List<DayRecord> {
    val keys = (
        shiftOverrides.keys + overtimeOverrides.keys +
            legalOverrides.keys + leaveDurationOverrides.keys
        ).toSortedSet()

    return keys.mapNotNull { key ->
        val (personName, date) = splitOverrideKey(key) ?: return@mapNotNull null
        val shiftOverride = shiftOverrides[key]
        val overtimeHours = normalizeOvertimeHours(overtimeOverrides[key] ?: 0.0)
        val isLegalOvertime = legalOverrides[key] == true
        val leaveDuration = if (shiftOverride == ShiftType.LEAVE) {
            leaveDurationOverrides[key]
        } else {
            null
        }
        if (shiftOverride == null && overtimeHours <= 0 && !isLegalOvertime && leaveDuration == null) {
            return@mapNotNull null
        }

        DayRecord(
            personName = personName,
            date = date,
            shiftOverride = shiftOverride,
            overtimeHours = overtimeHours,
            isLegalOvertime = isLegalOvertime,
            leaveDuration = leaveDuration
        )
    }
}
