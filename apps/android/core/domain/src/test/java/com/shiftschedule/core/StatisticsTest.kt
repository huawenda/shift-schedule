package com.shiftschedule.core

import com.shiftschedule.core.model.ScheduleData
import com.shiftschedule.core.model.SchedulePerson
import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.LEAVE
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import com.shiftschedule.core.model.ShiftType.SPECIAL_DAY
import com.shiftschedule.core.model.ShiftType.SPECIAL_NIGHT
import com.shiftschedule.core.sync.getOverrideKey
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class StatisticsTest {

    private val sampleSchedule = ScheduleData(
        startDate = "2026-05-20",
        endDate = "2026-06-19",
        dates = listOf("05/20", "05/21", "05/22", "05/23", "05/24"),
        people = listOf(
            SchedulePerson("华文达", "4F", listOf(DAY, NIGHT, REST, SPECIAL_DAY, SPECIAL_NIGHT)),
            SchedulePerson("张舒祺", "4G", listOf(NIGHT, NIGHT, REST, REST, DAY))
        )
    )

    @Test
    fun `summarizes monthly shift counts for the selected user`() {
        val stats = getPersonMonthlyStats(sampleSchedule, "华文达", emptyMap())

        assertEquals("华文达", stats?.personName)
        assertEquals("4F", stats?.group)
        assertEquals(
            ShiftSummary(
                day = 1, night = 1, rest = 1, specialDay = 1, specialNight = 1,
                overtime = OvertimeSummary()
            ),
            stats?.shiftSummary
        )
        assertEquals(0.0, stats?.overtimeTotal)
    }

    @Test
    fun `uses shift overrides when calculating attendance`() {
        val shiftOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to NIGHT,
            getOverrideKey("华文达", "05/23") to DAY
        )

        assertEquals(
            ShiftSummary(
                day = 1, night = 2, rest = 1, specialDay = 0, specialNight = 1,
                overtime = OvertimeSummary()
            ),
            getPersonMonthlyStats(sampleSchedule, "华文达", emptyMap(), shiftOverrides)?.shiftSummary
        )
    }

    @Test
    fun `summarizes leave days and converts leave duration to hours`() {
        val shiftOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to LEAVE,
            getOverrideKey("华文达", "05/21") to LEAVE
        )
        val leaveDurationOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to com.shiftschedule.core.model.LeaveDuration.HALF_DAY,
            getOverrideKey("华文达", "05/21") to com.shiftschedule.core.model.LeaveDuration.FULL_DAY
        )

        val stats = getPersonMonthlyStats(
            sampleSchedule,
            "华文达",
            emptyMap(),
            shiftOverrides,
            emptyMap(),
            leaveDurationOverrides
        )

        assertEquals(LeaveSummary(days = 2, hours = 12), stats?.leaveSummary)
        assertEquals(
            ShiftSummary(
                day = 0, night = 0, rest = 1, specialDay = 1, specialNight = 1,
                leave = 2, legal = 0,
                overtime = OvertimeSummary(legal = 0.0)
            ),
            stats?.shiftSummary
        )
    }

    @Test
    fun `keeps legal marked days out of their effective shift bucket`() {
        assertEquals(
            ShiftSummary(
                day = 0, night = 1, rest = 1, specialDay = 0, specialNight = 1,
                legal = 2,
                overtime = OvertimeSummary(day = 0.0, night = 0.0, specialDay = 0.0, specialNight = 0.0, legal = 3.0)
            ),
            getPersonMonthlyStats(
                sampleSchedule,
                "华文达",
                mapOf(
                    getOverrideKey("华文达", "05/20") to 1.0,
                    getOverrideKey("华文达", "05/23") to 2.0
                ),
                emptyMap(),
                mapOf(
                    getOverrideKey("华文达", "05/20") to true,
                    getOverrideKey("华文达", "05/23") to true
                )
            )?.shiftSummary
        )
    }

    @Test
    fun `sums overtime hours for the selected user only`() {
        val overtimeOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to 1.5,
            getOverrideKey("华文达", "05/23") to 2.0,
            getOverrideKey("张舒祺", "05/20") to 8.0
        )

        assertEquals(3.5, getPersonMonthlyStats(sampleSchedule, "华文达", overtimeOverrides)?.overtimeTotal)
    }

    @Test
    fun `groups overtime hours by the effective shift bucket`() {
        val overtimeOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to 1.5,
            getOverrideKey("华文达", "05/23") to 2.0
        )

        assertEquals(
            OvertimeSummary(day = 1.5, night = 0.0, specialDay = 2.0, specialNight = 0.0),
            getPersonMonthlyStats(sampleSchedule, "华文达", overtimeOverrides)?.shiftSummary?.overtime
        )
    }

    @Test
    fun `builds ordered overtime chart items by overtime type`() {
        assertEquals(
            listOf(
                OvertimeChartItem("平日", 3.5),
                OvertimeChartItem("特勤", 4.0),
                OvertimeChartItem("法定", 5.0)
            ),
            getOvertimeChartItems(
                OvertimeSummary(day = 1.0, night = 2.5, specialDay = 0.0, specialNight = 4.0, legal = 5.0)
            )
        )
    }

    @Test
    fun `returns daily attendance and overtime details`() {
        val overtimeOverrides = mapOf(getOverrideKey("华文达", "05/23") to 2.0)

        assertEquals(
            listOf(
                DailyAttendanceRecord("05/20", DAY, 0.0),
                DailyAttendanceRecord("05/21", NIGHT, 0.0),
                DailyAttendanceRecord("05/22", REST, 0.0),
                DailyAttendanceRecord("05/23", SPECIAL_DAY, 2.0),
                DailyAttendanceRecord("05/24", SPECIAL_NIGHT, 0.0)
            ),
            getPersonMonthlyStats(sampleSchedule, "华文达", overtimeOverrides)?.dailyRecords
        )
    }

    @Test
    fun `includes legal flags in daily attendance details when provided`() {
        assertEquals(
            listOf(
                DailyAttendanceRecord("05/20", DAY, 0.0, false),
                DailyAttendanceRecord("05/21", NIGHT, 0.0, true),
                DailyAttendanceRecord("05/22", REST, 0.0, false),
                DailyAttendanceRecord("05/23", SPECIAL_DAY, 0.0, false),
                DailyAttendanceRecord("05/24", SPECIAL_NIGHT, 0.0, false)
            ),
            getPersonMonthlyStats(
                sampleSchedule,
                "华文达",
                emptyMap(),
                emptyMap(),
                mapOf(getOverrideKey("华文达", "05/21") to true)
            )?.dailyRecords
        )
    }

    @Test
    fun `summarizes all people monthly overtime by person and overtime type`() {
        val overtimeOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to 1.0,
            getOverrideKey("华文达", "05/21") to 2.0,
            getOverrideKey("华文达", "05/23") to 3.0,
            getOverrideKey("张舒祺", "05/20") to 4.0,
            getOverrideKey("张舒祺", "05/22") to 5.0
        )
        val shiftOverrides = mapOf(getOverrideKey("张舒祺", "05/22") to SPECIAL_DAY)
        val legalOverrides = mapOf(
            getOverrideKey("华文达", "05/21") to true,
            getOverrideKey("张舒祺", "05/20") to true
        )

        assertEquals(
            AllPeopleMonthlyOvertimeStats(
                maxOvertime = 9.0,
                minOvertime = 6.0,
                averageOvertime = 7.5,
                people = listOf(
                    PersonOvertimeStats("华文达", "4F", 1.0, 3.0, 2.0, 6.0),
                    PersonOvertimeStats("张舒祺", "4G", 0.0, 5.0, 4.0, 9.0)
                ),
                ranking = listOf(
                    RankedPersonOvertimeStats(1, "张舒祺", "4G", 0.0, 5.0, 4.0, 9.0),
                    RankedPersonOvertimeStats(2, "华文达", "4F", 1.0, 3.0, 2.0, 6.0)
                )
            ),
            getAllPeopleMonthlyOvertimeStats(sampleSchedule, overtimeOverrides, shiftOverrides, legalOverrides)
        )
    }

    @Test
    fun `uses the same rank number when people have equal overtime totals`() {
        val tiedSchedule = sampleSchedule.copy(
            people = sampleSchedule.people + SchedulePerson(
                "陈泳智", "4H", listOf(DAY, NIGHT, REST, SPECIAL_DAY, SPECIAL_NIGHT)
            )
        )
        val overtimeOverrides = mapOf(
            getOverrideKey("华文达", "05/20") to 4.0,
            getOverrideKey("张舒祺", "05/20") to 4.0,
            getOverrideKey("陈泳智", "05/20") to 2.0
        )

        assertEquals(
            listOf(
                Triple("华文达", 1, 4.0),
                Triple("张舒祺", 1, 4.0),
                Triple("陈泳智", 3, 2.0)
            ),
            getAllPeopleMonthlyOvertimeStats(tiedSchedule, overtimeOverrides).ranking.map {
                Triple(it.personName, it.rank, it.totalHours)
            }
        )
    }
}
