package com.shiftschedule.core

import com.nlf.calendar.Solar
import com.shiftschedule.core.model.ScheduleData
import com.shiftschedule.core.model.ScheduleMonth
import com.shiftschedule.core.model.SchedulePerson
import com.shiftschedule.core.model.ShiftType
import java.time.LocalDate
import kotlin.math.floor

/** 加班时长按班次桶汇总，legal 仅在提供法定标记时存在。 */
data class OvertimeSummary(
    val day: Double = 0.0,
    val night: Double = 0.0,
    val specialDay: Double = 0.0,
    val specialNight: Double = 0.0,
    val legal: Double? = null
)

/** 班次计数汇总；leave/legal/overtime 与 TS 端可选字段语义一致（无数据时为 null）。 */
data class ShiftSummary(
    val day: Int = 0,
    val night: Int = 0,
    val rest: Int = 0,
    val specialDay: Int = 0,
    val specialNight: Int = 0,
    val leave: Int? = null,
    val legal: Int? = null,
    val overtime: OvertimeSummary? = null
)

data class UpcomingShift(val date: String, val shift: ShiftType)

data class DateLabel(val date: String, val weekday: String)

data class CalendarDateMeta(val label: String, val isHoliday: Boolean)

data class CalendarCell(
    val key: String,
    val day: String,
    val shift: ShiftType?,
    val inCurrentMonth: Boolean,
    val meta: CalendarDateMeta
)

private val weekdays = listOf("日", "一", "二", "三", "四", "五", "六")
private const val CYCLE_LENGTH = 24
private const val MAX_VISIBLE_FESTIVAL_NAME_LENGTH = 3

private fun formatFestivalLabel(festival: String): String {
    if (festival.endsWith("节") && festival.length == MAX_VISIBLE_FESTIVAL_NAME_LENGTH) {
        return festival.dropLast(1)
    }
    return festival
}

fun getPersonShiftSummary(
    person: SchedulePerson,
    overtimeHours: List<Double>? = null,
    legalFlags: List<Boolean>? = null
): ShiftSummary {
    var day = 0
    var night = 0
    var rest = 0
    var specialDay = 0
    var specialNight = 0
    var leave: Int? = null
    var legal: Int? = if (legalFlags != null) 0 else null
    var overtime: OvertimeSummary? = if (overtimeHours != null) {
        OvertimeSummary(legal = if (legalFlags != null) 0.0 else null)
    } else {
        null
    }

    person.shifts.forEachIndexed { index, shift ->
        val hours = overtimeHours?.getOrNull(index) ?: 0.0
        val isLegal = legalFlags?.getOrNull(index) == true && shift != ShiftType.REST
        when {
            isLegal -> {
                legal = (legal ?: 0) + 1
                overtime = overtime?.let { it.copy(legal = (it.legal ?: 0.0) + hours) }
            }
            shift == ShiftType.SPECIAL_DAY -> {
                specialDay += 1
                overtime = overtime?.let { it.copy(specialDay = it.specialDay + hours) }
            }
            shift == ShiftType.SPECIAL_NIGHT -> {
                specialNight += 1
                overtime = overtime?.let { it.copy(specialNight = it.specialNight + hours) }
            }
            shift == ShiftType.DAY -> {
                day += 1
                overtime = overtime?.let { it.copy(day = it.day + hours) }
            }
            shift == ShiftType.NIGHT -> {
                night += 1
                overtime = overtime?.let { it.copy(night = it.night + hours) }
            }
            shift == ShiftType.LEAVE -> {
                leave = (leave ?: 0) + 1
            }
            else -> {
                rest += 1
            }
        }
    }

    return ShiftSummary(
        day = day,
        night = night,
        rest = rest,
        specialDay = specialDay,
        specialNight = specialNight,
        leave = leave,
        legal = legal,
        overtime = overtime
    )
}

fun normalizeOvertimeHours(value: String): Double =
    normalizeOvertimeHours(value.trim().toDoubleOrNull() ?: Double.NaN)

fun normalizeOvertimeHours(value: Double): Double {
    if (value.isNaN() || !value.isFinite() || value <= 0) return 0.0
    return floor(value * 2) / 2
}

fun formatScheduleMonthDay(date: LocalDate): String =
    "${date.monthValue.toString().padStart(2, '0')}/${date.dayOfMonth.toString().padStart(2, '0')}"

fun getCurrentScheduleMonth(
    scheduleData: ScheduleData,
    date: LocalDate = LocalDate.now()
): ScheduleMonth? {
    val today = formatScheduleMonthDay(date)
    if (today !in scheduleData.dates) return null

    val settlementMonth = if (date.dayOfMonth >= 20) date.monthValue + 1 else date.monthValue
    val code = settlementMonth.toString().padStart(2, '0')
    return ScheduleMonth.fromCode(code)
}

fun getCalendarDateMeta(date: String): CalendarDateMeta {
    val (year, month, day) = date.split('-').map { it.toInt() }
    val solar = Solar.fromYmd(year, month, day)
    val lunar = solar.lunar
    val festival = (solar.festivals + lunar.festivals)
        .firstOrNull { it.length <= MAX_VISIBLE_FESTIVAL_NAME_LENGTH }
    val jieQi = lunar.jieQi

    if (festival != null) {
        return CalendarDateMeta(label = formatFestivalLabel(festival), isHoliday = true)
    }
    if (!jieQi.isNullOrEmpty()) {
        return CalendarDateMeta(label = jieQi, isHoliday = true)
    }

    val lunarDay = lunar.dayInChinese
    return CalendarDateMeta(
        label = if (lunarDay == "初一") "${lunar.monthInChinese}月" else lunarDay,
        isHoliday = false
    )
}

fun getUpcomingShifts(
    dates: List<String>,
    person: SchedulePerson,
    count: Int
): List<UpcomingShift> =
    dates.take(count).mapIndexed { index, date ->
        UpcomingShift(date = date, shift = person.shifts[index])
    }

fun getDateLabels(startDate: String, dates: List<String>): List<DateLabel> {
    val start = LocalDate.parse(startDate)
    return dates.mapIndexed { index, date ->
        val current = start.plusDays(index.toLong())
        DateLabel(date = date, weekday = weekdays[current.dayOfWeek.value % 7])
    }
}

fun getMonthScheduleView(scheduleData: ScheduleData, month: ScheduleMonth): ScheduleData {
    val startMonth = (month.number - 1).toString().padStart(2, '0')
    val periodStart = "$startMonth/20"
    val periodEnd = "${month.code}/19"
    val firstIndex = scheduleData.dates.indexOf(periodStart)
    val lastIndex = scheduleData.dates.indexOf(periodEnd)

    if (firstIndex < 0 || lastIndex < firstIndex) {
        return ScheduleData(
            startDate = scheduleData.startDate,
            endDate = scheduleData.endDate,
            dates = emptyList(),
            people = scheduleData.people.map { it.copy(shifts = emptyList()) }
        )
    }

    return ScheduleData(
        startDate = "2026-$startMonth-20",
        endDate = "2026-${month.code}-19",
        dates = scheduleData.dates.subList(firstIndex, lastIndex + 1),
        people = scheduleData.people.map { person ->
            person.copy(shifts = person.shifts.subList(firstIndex, lastIndex + 1))
        }
    )
}

fun isFutureScheduleMonth(
    scheduleData: ScheduleData,
    month: ScheduleMonth,
    date: LocalDate = LocalDate.now()
): Boolean {
    val monthView = getMonthScheduleView(scheduleData, month)
    if (monthView.dates.isEmpty()) return false

    return LocalDate.parse(monthView.startDate) > date
}

private fun formatMonthDay(date: LocalDate): String =
    "${date.monthValue.toString().padStart(2, '0')}/${date.dayOfMonth.toString().padStart(2, '0')}"

private fun positiveModulo(value: Int, modulo: Int): Int = ((value % modulo) + modulo) % modulo

private fun getShiftAtIndex(person: SchedulePerson, index: Int): ShiftType =
    person.shifts.getOrNull(index) ?: person.shifts[positiveModulo(index, CYCLE_LENGTH)]

fun getPersonMonthCalendarCells(
    scheduleData: ScheduleData,
    month: ScheduleMonth,
    personName: String
): List<CalendarCell> {
    val monthView = getMonthScheduleView(scheduleData, month)
    val person = scheduleData.people.find { it.name == personName }
    val firstIndex = scheduleData.dates.indexOf(monthView.dates.firstOrNull())

    if (person == null || firstIndex < 0 || monthView.dates.isEmpty()) return emptyList()

    val start = LocalDate.parse(monthView.startDate)
    val leadingEmptyCount = start.dayOfWeek.value % 7
    val filledCells = monthView.dates.mapIndexed { index, date ->
        CalendarCell(
            key = date,
            day = date.substring(3),
            shift = getShiftAtIndex(person, firstIndex + index),
            inCurrentMonth = true,
            meta = getCalendarDateMeta(start.plusDays(index.toLong()).toString())
        )
    }
    val leadingCells = (0 until leadingEmptyCount).map { index ->
        val offset = index - leadingEmptyCount
        val date = start.plusDays(offset.toLong())
        val key = formatMonthDay(date)
        CalendarCell(
            key = key,
            day = key.substring(3),
            shift = getShiftAtIndex(person, firstIndex + offset),
            inCurrentMonth = false,
            meta = getCalendarDateMeta(date.toString())
        )
    }
    val trailingEmptyCount = (7 - ((leadingCells.size + filledCells.size) % 7)) % 7
    val trailingCells = (0 until trailingEmptyCount).map { index ->
        val offset = monthView.dates.size + index
        val date = start.plusDays(offset.toLong())
        val key = formatMonthDay(date)
        CalendarCell(
            key = key,
            day = key.substring(3),
            shift = getShiftAtIndex(person, firstIndex + offset),
            inCurrentMonth = false,
            meta = getCalendarDateMeta(date.toString())
        )
    }

    return leadingCells + filledCells + trailingCells
}
