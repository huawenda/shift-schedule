package com.shiftschedule.core

import com.shiftschedule.core.model.ShiftType.DAY
import com.shiftschedule.core.model.ShiftType.LEAVE
import com.shiftschedule.core.model.ShiftType.NIGHT
import com.shiftschedule.core.model.ShiftType.REST
import com.shiftschedule.core.model.ShiftType.SPECIAL_DAY
import com.shiftschedule.core.model.ShiftType.SPECIAL_NIGHT
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LegalOvertimeTest {

    @Test
    fun `allows legal marking only when the effective shift is not rest`() {
        assertTrue(canMarkLegalShift(DAY))
        assertTrue(canMarkLegalShift(NIGHT))
        assertTrue(canMarkLegalShift(SPECIAL_DAY))
        assertTrue(canMarkLegalShift(SPECIAL_NIGHT))
        assertFalse(canMarkLegalShift(REST))
        assertFalse(canMarkLegalShift(LEAVE))
    }

    @Test
    fun `clears legal marking when the effective shift is rest or leave`() {
        assertTrue(normalizeLegalOverride(DAY, true))
        assertFalse(normalizeLegalOverride(REST, true))
        assertFalse(normalizeLegalOverride(LEAVE, true))
        assertFalse(normalizeLegalOverride(NIGHT, false))
    }
}
