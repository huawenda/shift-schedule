package com.shiftschedule.core

import com.shiftschedule.core.model.ShiftType

fun hasShiftOverrideChanged(baseShift: ShiftType, overrideShift: ShiftType?): Boolean =
    overrideShift != null && overrideShift != baseShift
