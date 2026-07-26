package com.shiftschedule.core.data

import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScheduleSeedTest {

    @Test
    fun `covers May through December work months with 245 generated days`() {
        assertEquals("2026-04-19", scheduleData.startDate)
        assertEquals("2026-12-19", scheduleData.endDate)
        assertEquals(245, scheduleData.dates.size)
        assertEquals("04/19", scheduleData.dates.first())
        assertEquals("12/19", scheduleData.dates.last())
    }

    @Test
    fun `contains all 13 people and 245 shifts per person`() {
        assertEquals(13, scheduleData.people.size)
        assertTrue(scheduleData.people.all { it.shifts.size == 245 })
    }

    @Test
    fun `includes the default highlighted user`() {
        val person = scheduleData.people.find { it.name == "华文达" }
        assertNotNull(person)
        assertEquals("4F", person?.group)
    }

    @Test
    fun `preserves the provided 06-07 to 06-30 cycle for every person`() {
        val cycleStartIndex = scheduleData.dates.indexOf("06/07")
        val highlightedPerson = scheduleData.people.first { it.name == "华文达" }
        val coworker = scheduleData.people.first { it.name == "张舒棋" }

        assertEquals(
            listOf(
                NIGHT, NIGHT, NIGHT, NIGHT, REST, REST,
                NIGHT, NIGHT, NIGHT, NIGHT, REST, REST,
                DAY, DAY, DAY, DAY, REST, REST,
                DAY, DAY, DAY, DAY, REST, REST
            ),
            highlightedPerson.shifts.subList(cycleStartIndex, cycleStartIndex + 24)
        )
        assertEquals(
            listOf(
                REST, NIGHT, NIGHT, NIGHT, NIGHT, REST,
                REST, NIGHT, NIGHT, NIGHT, NIGHT, REST,
                REST, DAY, DAY, DAY, DAY, REST,
                REST, DAY, DAY, DAY, DAY, REST
            ),
            coworker.shifts.subList(cycleStartIndex, cycleStartIndex + 24)
        )
    }

    @Test
    fun `maps generated dates by cycling backward from the provided 06-07 anchor`() {
        val highlightedPerson = scheduleData.people.first { it.name == "华文达" }
        val coworker = scheduleData.people.first { it.name == "张舒棋" }

        assertEquals(
            listOf(REST, NIGHT, NIGHT, NIGHT, NIGHT, REST, REST),
            highlightedPerson.shifts.take(7)
        )
        assertEquals(
            listOf(REST, REST, NIGHT, NIGHT, NIGHT, NIGHT, REST),
            coworker.shifts.take(7)
        )
    }
}
