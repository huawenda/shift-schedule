package com.shiftschedule.core

import com.shiftschedule.core.data.scheduleData
import com.shiftschedule.core.model.ScheduleMonth
import com.shiftschedule.core.model.SchedulePerson
import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.LEAVE
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import com.shiftschedule.core.model.ShiftType.SPECIAL_DAY
import com.shiftschedule.core.model.ShiftType.SPECIAL_NIGHT
import java.time.LocalDate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScheduleLogicTest {

    @Test
    fun `counts shift totals for the highlighted person`() {
        val highlightedPerson = scheduleData.people[0]

        assertEquals(
            ShiftSummary(day = 80, night = 84, rest = 81, specialDay = 0, specialNight = 0),
            getPersonShiftSummary(highlightedPerson)
        )
    }

    @Test
    fun `counts special duty shifts separately from day and night shifts`() {
        assertEquals(
            ShiftSummary(day = 1, night = 1, rest = 1, specialDay = 1, specialNight = 1),
            getPersonShiftSummary(
                SchedulePerson("测试", "T", listOf(DAY, NIGHT, REST, SPECIAL_DAY, SPECIAL_NIGHT))
            )
        )
    }

    @Test
    fun `adds overtime totals to matching shift buckets without changing day counts`() {
        assertEquals(
            ShiftSummary(
                day = 1, night = 1, rest = 1, specialDay = 1, specialNight = 1,
                overtime = OvertimeSummary(day = 1.5, night = 2.0, specialDay = 3.0, specialNight = 4.5)
            ),
            getPersonShiftSummary(
                SchedulePerson("测试", "T", listOf(DAY, NIGHT, REST, SPECIAL_DAY, SPECIAL_NIGHT)),
                listOf(1.5, 2.0, 8.0, 3.0, 4.5)
            )
        )
    }

    @Test
    fun `counts legal marked work days separately from the effective shift bucket`() {
        assertEquals(
            ShiftSummary(
                day = 0, night = 1, rest = 1, specialDay = 0, specialNight = 1,
                legal = 2,
                overtime = OvertimeSummary(day = 0.0, night = 2.0, specialDay = 0.0, specialNight = 4.5, legal = 4.5)
            ),
            getPersonShiftSummary(
                SchedulePerson("测试", "T", listOf(DAY, NIGHT, REST, SPECIAL_DAY, SPECIAL_NIGHT)),
                listOf(1.5, 2.0, 0.0, 3.0, 4.5),
                listOf(true, false, true, true, false)
            )
        )
    }

    @Test
    fun `normalizes overtime input to half-hour units`() {
        assertEquals(0.0, normalizeOvertimeHours(""))
        assertEquals(2.0, normalizeOvertimeHours("2"))
        assertEquals(2.5, normalizeOvertimeHours("2.5"))
        assertEquals(2.5, normalizeOvertimeHours("2.7"))
        assertEquals(0.0, normalizeOvertimeHours("0.4"))
        assertEquals(0.0, normalizeOvertimeHours("-1"))
        assertEquals(0.0, normalizeOvertimeHours("abc"))
    }

    @Test
    fun `returns seven upcoming shifts from the start of the period`() {
        val highlightedPerson = scheduleData.people[0]

        assertEquals(
            listOf(
                UpcomingShift("04/19", REST),
                UpcomingShift("04/20", NIGHT),
                UpcomingShift("04/21", NIGHT),
                UpcomingShift("04/22", NIGHT),
                UpcomingShift("04/23", NIGHT),
                UpcomingShift("04/24", REST),
                UpcomingShift("04/25", REST)
            ),
            getUpcomingShifts(scheduleData.dates, highlightedPerson, 7)
        )
    }

    @Test
    fun `adds weekday labels to each date`() {
        assertEquals(
            listOf(
                DateLabel("04/19", "日"),
                DateLabel("04/20", "一"),
                DateLabel("04/21", "二")
            ),
            getDateLabels(scheduleData.startDate, scheduleData.dates).take(3)
        )
    }

    @Test
    fun `formats runtime dates for schedule matching`() {
        assertEquals("05/24", formatScheduleMonthDay(LocalDate.of(2026, 5, 24)))
        assertEquals("12/03", formatScheduleMonthDay(LocalDate.of(2026, 12, 3)))
    }

    @Test
    fun `detects the current schedule month only when today is in range`() {
        assertEquals(ScheduleMonth.M05, getCurrentScheduleMonth(scheduleData, LocalDate.of(2026, 5, 19)))
        assertEquals(ScheduleMonth.M06, getCurrentScheduleMonth(scheduleData, LocalDate.of(2026, 5, 20)))
        assertEquals(ScheduleMonth.M06, getCurrentScheduleMonth(scheduleData, LocalDate.of(2026, 5, 24)))
        assertEquals(ScheduleMonth.M12, getCurrentScheduleMonth(scheduleData, LocalDate.of(2026, 12, 19)))
        assertNull(getCurrentScheduleMonth(scheduleData, LocalDate.of(2026, 12, 20)))
        assertNull(getCurrentScheduleMonth(scheduleData, LocalDate.of(2027, 1, 1)))
    }

    @Test
    fun `detects future schedule months by the selected period start date`() {
        val today = LocalDate.of(2026, 5, 27)

        assertFalse(isFutureScheduleMonth(scheduleData, ScheduleMonth.M05, today))
        assertFalse(isFutureScheduleMonth(scheduleData, ScheduleMonth.M06, today))
        assertTrue(isFutureScheduleMonth(scheduleData, ScheduleMonth.M07, today))
    }

    @Test
    fun `returns compact lunar, solar holiday, lunar holiday, and solar term labels`() {
        assertEquals(CalendarDateMeta("劳动", true), getCalendarDateMeta("2026-05-01"))
        assertEquals(CalendarDateMeta("立夏", true), getCalendarDateMeta("2026-05-05"))
        assertEquals(CalendarDateMeta("端午", true), getCalendarDateMeta("2026-06-19"))
        assertEquals(CalendarDateMeta("初八", false), getCalendarDateMeta("2026-05-24"))
        assertEquals(CalendarDateMeta("青年", true), getCalendarDateMeta("2026-05-04"))
        assertEquals(CalendarDateMeta("教师", true), getCalendarDateMeta("2026-09-10"))
    }

    @Test
    fun `slices the generated schedule by selected work month without changing person order`() {
        val mayView = getMonthScheduleView(scheduleData, ScheduleMonth.M05)
        val juneView = getMonthScheduleView(scheduleData, ScheduleMonth.M06)
        val decemberView = getMonthScheduleView(scheduleData, ScheduleMonth.M12)

        assertEquals("2026-04-20", mayView.startDate)
        assertEquals("2026-05-19", mayView.endDate)
        assertEquals(30, mayView.dates.size)
        assertEquals(13, mayView.people.size)
        assertEquals("华文达", mayView.people[0].name)
        assertEquals(30, mayView.people[0].shifts.size)

        assertEquals("2026-05-20", juneView.startDate)
        assertEquals("2026-06-19", juneView.endDate)
        assertEquals(31, juneView.dates.size)
        assertEquals(31, juneView.people[0].shifts.size)

        assertEquals("2026-11-20", decemberView.startDate)
        assertEquals("2026-12-19", decemberView.endDate)
        assertEquals(30, decemberView.dates.size)
        assertEquals(30, decemberView.people[0].shifts.size)
    }

    @Test
    fun `builds a 7-column calendar grid for the highlighted person`() {
        val mayCells = getPersonMonthCalendarCells(scheduleData, ScheduleMonth.M05, "华文达")
        val juneCells = getPersonMonthCalendarCells(scheduleData, ScheduleMonth.M06, "华文达")

        assertEquals(35, mayCells.size)
        assertEquals(listOf("19", "20", "21", "22", "23"), mayCells.take(5).map { it.day })
        assertEquals("04/19", mayCells[0].key)
        assertEquals("19", mayCells[0].day)
        assertEquals(REST, mayCells[0].shift)
        assertFalse(mayCells[0].inCurrentMonth)
        assertEquals("04/20", mayCells[1].key)
        assertEquals("20", mayCells[1].day)
        assertEquals(NIGHT, mayCells[1].shift)
        assertTrue(mayCells[1].inCurrentMonth)
        assertEquals(listOf("05/20", "05/21", "05/22", "05/23"), mayCells.takeLast(4).map { it.key })
        assertEquals(NIGHT, mayCells[31].shift)

        assertEquals(35, juneCells.size)
        assertEquals("05/17", juneCells[0].key)
        assertEquals("17", juneCells[0].day)
        assertEquals(NIGHT, juneCells[0].shift)
        assertFalse(juneCells[0].inCurrentMonth)
        assertEquals("05/20", juneCells[3].key)
        assertEquals("20", juneCells[3].day)
        assertEquals(NIGHT, juneCells[3].shift)
        assertTrue(juneCells[3].inCurrentMonth)
        assertEquals(listOf("06/20"), juneCells.takeLast(1).map { it.key })
    }

    @Test
    fun `leave shifts are counted separately in the summary`() {
        assertEquals(
            ShiftSummary(day = 1, night = 1, rest = 1, specialDay = 0, specialNight = 0, leave = 2),
            getPersonShiftSummary(
                SchedulePerson("测试", "T", listOf(DAY, NIGHT, REST, LEAVE, LEAVE))
            )
        )
    }
}
