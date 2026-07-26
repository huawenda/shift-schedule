package com.shiftschedule.core

import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ScheduleData
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.sync.LeaveDurationOverrides
import com.shiftschedule.core.sync.LegalOverrides
import com.shiftschedule.core.sync.OvertimeOverrides
import com.shiftschedule.core.sync.ShiftOverrides
import com.shiftschedule.core.sync.getOverrideKey

val overtimeChartTypeOrder = listOf("平日", "特勤", "法定")

data class DailyAttendanceRecord(
    val date: String,
    val shift: ShiftType,
    val overtimeHours: Double,
    val isLegal: Boolean? = null
)

data class OvertimeChartItem(val type: String, val hours: Double)

data class LeaveSummary(val days: Int, val hours: Int)

data class PersonMonthlyStats(
    val personName: String,
    val group: String,
    val shiftSummary: ShiftSummary,
    val leaveSummary: LeaveSummary,
    val overtimeTotal: Double,
    val dailyRecords: List<DailyAttendanceRecord>
)

data class PersonOvertimeStats(
    val personName: String,
    val group: String,
    val weekdayHours: Double,
    val specialHours: Double,
    val legalHours: Double,
    val totalHours: Double
)

data class RankedPersonOvertimeStats(
    val rank: Int,
    val personName: String,
    val group: String,
    val weekdayHours: Double,
    val specialHours: Double,
    val legalHours: Double,
    val totalHours: Double
)

data class AllPeopleMonthlyOvertimeStats(
    val maxOvertime: Double,
    val minOvertime: Double,
    val averageOvertime: Double,
    val people: List<PersonOvertimeStats>,
    val ranking: List<RankedPersonOvertimeStats>
)

fun getOvertimeChartItems(overtimeByShift: OvertimeSummary? = null): List<OvertimeChartItem> {
    val summary = overtimeByShift ?: OvertimeSummary()
    return listOf(
        OvertimeChartItem("平日", normalizeOvertimeHours(summary.day + summary.night)),
        OvertimeChartItem("特勤", normalizeOvertimeHours(summary.specialDay + summary.specialNight)),
        OvertimeChartItem("法定", normalizeOvertimeHours(summary.legal ?: 0.0))
    )
}

fun getPersonMonthlyStats(
    scheduleData: ScheduleData,
    personName: String,
    overtimeOverrides: OvertimeOverrides,
    shiftOverrides: ShiftOverrides = emptyMap(),
    legalOverrides: LegalOverrides? = null,
    leaveDurationOverrides: LeaveDurationOverrides = emptyMap()
): PersonMonthlyStats? {
    val person = scheduleData.people.find { it.name == personName } ?: return null

    val dailyRecords = scheduleData.dates.mapIndexed { index, date ->
        val key = getOverrideKey(person.name, date)
        DailyAttendanceRecord(
            date = date,
            shift = shiftOverrides[key] ?: person.shifts[index],
            overtimeHours = normalizeOvertimeHours(overtimeOverrides[key] ?: 0.0),
            isLegal = legalOverrides?.let { it[key] == true }
        )
    }
    val shifts = dailyRecords.map { it.shift }
    val overtimeHours = dailyRecords.map { it.overtimeHours }
    val legalFlags = legalOverrides?.let { dailyRecords.map { record -> record.isLegal == true } }
    val overtimeTotal = overtimeHours.sum()

    var leaveDays = 0
    var leaveHours = 0
    dailyRecords.forEach { record ->
        if (record.shift == ShiftType.LEAVE) {
            val key = getOverrideKey(person.name, record.date)
            val duration = leaveDurationOverrides[key] ?: LeaveDuration.FULL_DAY
            leaveDays += 1
            leaveHours += duration.hours
        }
    }

    return PersonMonthlyStats(
        personName = person.name,
        group = person.group,
        shiftSummary = getPersonShiftSummary(person.copy(shifts = shifts), overtimeHours, legalFlags),
        leaveSummary = LeaveSummary(days = leaveDays, hours = leaveHours),
        overtimeTotal = overtimeTotal,
        dailyRecords = dailyRecords
    )
}

fun getAllPeopleMonthlyOvertimeStats(
    scheduleData: ScheduleData,
    overtimeOverrides: OvertimeOverrides,
    shiftOverrides: ShiftOverrides = emptyMap(),
    legalOverrides: LegalOverrides? = null
): AllPeopleMonthlyOvertimeStats {
    val people = scheduleData.people.map { person ->
        val stats = getPersonMonthlyStats(
            scheduleData,
            person.name,
            overtimeOverrides,
            shiftOverrides,
            legalOverrides
        )
        val overtimeByType = getOvertimeChartItems(stats?.shiftSummary?.overtime)
        PersonOvertimeStats(
            personName = person.name,
            group = person.group,
            weekdayHours = overtimeByType.first { it.type == "平日" }.hours,
            specialHours = overtimeByType.first { it.type == "特勤" }.hours,
            legalHours = overtimeByType.first { it.type == "法定" }.hours,
            totalHours = normalizeOvertimeHours(stats?.overtimeTotal ?: 0.0)
        )
    }
    val overtimeTotals = people.map { it.totalHours }
    val totalOvertime = overtimeTotals.sum()

    var currentRank = 0
    val sorted = people.sortedByDescending { it.totalHours }
    val ranking = sorted.mapIndexed { index, person ->
        val previous = sorted.getOrNull(index - 1)
        currentRank = if (previous != null && previous.totalHours == person.totalHours) {
            currentRank
        } else {
            index + 1
        }
        RankedPersonOvertimeStats(
            rank = currentRank,
            personName = person.personName,
            group = person.group,
            weekdayHours = person.weekdayHours,
            specialHours = person.specialHours,
            legalHours = person.legalHours,
            totalHours = person.totalHours
        )
    }

    return AllPeopleMonthlyOvertimeStats(
        maxOvertime = normalizeOvertimeHours((overtimeTotals + 0.0).max()),
        minOvertime = normalizeOvertimeHours(if (overtimeTotals.isNotEmpty()) overtimeTotals.min() else 0.0),
        averageOvertime = normalizeOvertimeHours(if (people.isNotEmpty()) totalOvertime / people.size else 0.0),
        people = people,
        ranking = ranking
    )
}
