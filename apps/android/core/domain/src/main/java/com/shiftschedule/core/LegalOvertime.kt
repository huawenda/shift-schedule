package com.shiftschedule.core

import com.shiftschedule.core.model.ShiftType

fun canMarkLegalShift(shift: ShiftType): Boolean =
    shift != ShiftType.REST && shift != ShiftType.LEAVE

fun normalizeLegalOverride(shift: ShiftType, isLegal: Boolean): Boolean =
    canMarkLegalShift(shift) && isLegal
