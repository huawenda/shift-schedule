package com.shiftschedule.core

import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.LEAVE
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import com.shiftschedule.core.model.ShiftType.SPECIAL_DAY
import com.shiftschedule.core.model.ShiftType.SPECIAL_NIGHT
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ShiftEditRulesTest {

    @Test
    fun `hides the base shift from editable regular shift options`() {
        assertEquals(listOf(NIGHT, LEAVE), getEditableShiftOptionsForBase(DAY))
        assertEquals(listOf(DAY, LEAVE), getEditableShiftOptionsForBase(NIGHT))
    }

    @Test
    fun `allows rest shifts to change only to special duty shifts`() {
        assertEquals(listOf(SPECIAL_DAY, SPECIAL_NIGHT), getEditableShiftOptionsForBase(REST))
    }

    @Test
    fun `returns no edit options when no alternative exists`() {
        assertEquals(emptyList<Any>(), getEditableShiftOptionsForBase(SPECIAL_DAY))
    }

    @Test
    fun `uses regular overtime presets for non-legal day and night shifts`() {
        assertEquals(listOf(2.0, 3.0, 3.5), getOvertimePresetOptions(DAY, false))
        assertEquals(listOf(2.0, 3.0, 3.5), getOvertimePresetOptions(NIGHT, false))
    }

    @Test
    fun `uses special overtime presets for special and legal regular shifts`() {
        assertEquals(listOf(10.0, 11.0, 11.5), getOvertimePresetOptions(SPECIAL_DAY, false))
        assertEquals(listOf(10.0, 11.0, 11.5), getOvertimePresetOptions(SPECIAL_NIGHT, false))
        assertEquals(listOf(10.0, 11.0, 11.5), getOvertimePresetOptions(DAY, true))
        assertEquals(listOf(10.0, 11.0, 11.5), getOvertimePresetOptions(NIGHT, true))
    }

    @Test
    fun `hides overtime presets for shifts without overtime`() {
        assertEquals(emptyList<Double>(), getOvertimePresetOptions(REST, false))
        assertEquals(emptyList<Double>(), getOvertimePresetOptions(LEAVE, false))
    }
}
