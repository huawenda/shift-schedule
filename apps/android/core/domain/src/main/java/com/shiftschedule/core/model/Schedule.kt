package com.shiftschedule.core.model

/** 班次类型，与 packages/core 的 ShiftType 一一对应，label 保持中文字面量不变。 */
enum class ShiftType(val label: String) {
    DAY("白班"),
    NIGHT("夜班"),
    REST("休息"),
    SPECIAL_DAY("白特"),
    SPECIAL_NIGHT("夜特"),
    LEAVE("事假");

    companion object {
        fun fromLabel(label: String?): ShiftType? = entries.firstOrNull { it.label == label }
    }
}

/** 请假时长，hours 与 TS 端 getLeaveDurationHours 保持一致（半天=4h，一天=8h）。 */
enum class LeaveDuration(val label: String, val hours: Int) {
    HALF_DAY("半天", 4),
    FULL_DAY("一天", 8);

    companion object {
        fun fromLabel(label: String?): LeaveDuration? = entries.firstOrNull { it.label == label }
    }
}

data class SchedulePerson(
    val name: String,
    val group: String,
    val shifts: List<ShiftType>
)

data class ScheduleData(
    val startDate: String,
    val endDate: String,
    val dates: List<String>,
    val people: List<SchedulePerson>
)

/** 结算月（上月 20 日 ~ 本月 19 日），与 TS 的 ScheduleMonth 联合类型等价。 */
enum class ScheduleMonth(val code: String) {
    M05("05"),
    M06("06"),
    M07("07"),
    M08("08"),
    M09("09"),
    M10("10"),
    M11("11"),
    M12("12");

    val number: Int get() = code.toInt()

    companion object {
        fun fromCode(code: String): ScheduleMonth? = entries.firstOrNull { it.code == code }
    }
}
