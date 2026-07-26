package com.shiftschedule.core.data

import com.shiftschedule.core.model.ScheduleData
import com.shiftschedule.core.model.SchedulePerson
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * 基础排班种子数据，与 packages/core/src/data/schedule.ts 保持一致：
 * 24 天轮班周期、锚定 2026-06-07、展示区间 2026-04-19 ~ 2026-12-19、13 人。
 */
const val DISPLAY_START_DATE = "2026-04-19"
const val DISPLAY_END_DATE = "2026-12-19"
const val CYCLE_ANCHOR_DATE = "2026-06-07"

private fun getInclusiveDates(startDate: String, endDate: String): List<String> {
    val start = LocalDate.parse(startDate)
    val end = LocalDate.parse(endDate)
    val dayCount = (ChronoUnit.DAYS.between(start, end) + 1).toInt()
    return (0 until dayCount).map { offset ->
        val current = start.plusDays(offset.toLong())
        "${current.monthValue.toString().padStart(2, '0')}/${current.dayOfMonth.toString().padStart(2, '0')}"
    }
}

private fun positiveModulo(value: Int, modulo: Int): Int = ((value % modulo) + modulo) % modulo

private fun expandCycleShifts(
    cycle: List<ShiftType>,
    startDate: String,
    endDate: String,
    anchorDate: String
): List<ShiftType> {
    val start = LocalDate.parse(startDate)
    val end = LocalDate.parse(endDate)
    val anchor = LocalDate.parse(anchorDate)
    val startOffset = ChronoUnit.DAYS.between(anchor, start).toInt()
    val dayCount = (ChronoUnit.DAYS.between(start, end) + 1).toInt()
    return (0 until dayCount).map { index ->
        cycle[positiveModulo(startOffset + index, cycle.size)]
    }
}

private val cyclePeople: List<SchedulePerson> = listOf(
    SchedulePerson(
        "华文达", "4F",
        listOf(NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST)
    ),
    SchedulePerson(
        "张舒棋", "4G",
        listOf(REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST)
    ),
    SchedulePerson(
        "陈泳智", "4H",
        listOf(REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY)
    ),
    SchedulePerson(
        "韩义博", "4I",
        listOf(DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY)
    ),
    SchedulePerson(
        "段志彬", "4J",
        listOf(DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY)
    ),
    SchedulePerson(
        "余昌耿", "4K",
        listOf(DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY)
    ),
    SchedulePerson(
        "张涛", "4R",
        listOf(DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST)
    ),
    SchedulePerson(
        "谢懋", "4S",
        listOf(REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST)
    ),
    SchedulePerson(
        "农伟俊", "4T",
        listOf(REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT)
    ),
    SchedulePerson(
        "帅长安", "4U",
        listOf(NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT, NIGHT)
    ),
    SchedulePerson(
        "林泽勇", "4V",
        listOf(NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT, NIGHT)
    ),
    SchedulePerson(
        "陈家辉", "4W",
        listOf(NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, NIGHT)
    ),
    SchedulePerson(
        "张增全", "4X",
        listOf(NIGHT, NIGHT, NIGHT, NIGHT, REST, REST, DAY, DAY, DAY, DAY, REST, REST, DAY, DAY, DAY, DAY, REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST)
    )
)

val scheduleData: ScheduleData by lazy {
    ScheduleData(
        startDate = DISPLAY_START_DATE,
        endDate = DISPLAY_END_DATE,
        dates = getInclusiveDates(DISPLAY_START_DATE, DISPLAY_END_DATE),
        people = cyclePeople.map { person ->
            person.copy(
                shifts = expandCycleShifts(person.shifts, DISPLAY_START_DATE, DISPLAY_END_DATE, CYCLE_ANCHOR_DATE)
            )
        }
    )
}
