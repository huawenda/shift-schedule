package com.shiftschedule.core

import com.shiftschedule.core.model.ShiftType

fun getEditableShiftOptionsForBase(baseShift: ShiftType): List<ShiftType> {
    val options = when (baseShift) {
        ShiftType.REST -> listOf(ShiftType.SPECIAL_DAY, ShiftType.SPECIAL_NIGHT)
        ShiftType.DAY, ShiftType.NIGHT -> listOf(ShiftType.DAY, ShiftType.NIGHT, ShiftType.LEAVE)
        else -> listOf(baseShift)
    }
    return options.filter { it != baseShift }
}

fun getOvertimePresetOptions(shift: ShiftType, isLegal: Boolean): List<Double> {
    if (isLegal && (shift == ShiftType.DAY || shift == ShiftType.NIGHT ||
            shift == ShiftType.SPECIAL_DAY || shift == ShiftType.SPECIAL_NIGHT)
    ) {
        return listOf(10.0, 11.0, 11.5)
    }
    if (shift == ShiftType.SPECIAL_DAY || shift == ShiftType.SPECIAL_NIGHT) {
        return listOf(10.0, 11.0, 11.5)
    }
    if (shift == ShiftType.DAY || shift == ShiftType.NIGHT) {
        return listOf(2.0, 3.0, 3.5)
    }
    return emptyList()
}
