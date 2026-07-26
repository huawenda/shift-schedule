package com.shiftschedule.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shiftschedule.app.ui.theme.ShiftColors
import com.shiftschedule.app.ui.theme.colors
import com.shiftschedule.core.CalendarCell

private val weekHeaders = listOf("日", "一", "二", "三", "四", "五", "六")

/**
 * 个人月历：7 列网格，单元格展示日号 + 班次（色+文字）+ 农历/节假日标注。
 * 非本月单元格降透明度，今天用命令蓝描边（颜色之外的第二指示）。
 */
@Composable
fun MonthCalendar(
    cells: List<CalendarCell>,
    todayKey: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Row {
            weekHeaders.forEach { weekday ->
                Text(
                    text = weekday,
                    style = MaterialTheme.typography.labelMedium,
                    color = ShiftColors.muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f)
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        cells.chunked(7).forEach { week ->
            Row {
                week.forEach { cell ->
                    CalendarDayCell(
                        cell = cell,
                        isToday = cell.key == todayKey,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarDayCell(
    cell: CalendarCell,
    isToday: Boolean,
    modifier: Modifier = Modifier
) {
    val shiftColors = cell.shift?.colors()
    val background = when {
        shiftColors == null -> ShiftColors.surfaceMuted
        cell.inCurrentMonth -> shiftColors.first
        else -> shiftColors.first.copy(alpha = 0.45f)
    }
    val foreground = when {
        shiftColors == null -> ShiftColors.muted
        cell.inCurrentMonth -> shiftColors.second
        else -> ShiftColors.muted
    }

    Surface(
        modifier = modifier.padding(2.dp),
        color = background,
        shape = RoundedCornerShape(10.dp),
        border = if (isToday) BorderStroke(2.dp, ShiftColors.primary) else null
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .height(74.dp)
                .padding(2.dp)
        ) {
            Text(
                text = cell.day,
                fontSize = 15.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                color = if (isToday) ShiftColors.primary else foreground
            )
            Text(
                text = cell.shift?.label ?: "",
                fontSize = 12.sp,
                lineHeight = 14.sp,
                fontWeight = FontWeight.Bold,
                color = foreground
            )
            Text(
                text = cell.meta.label,
                fontSize = 10.sp,
                lineHeight = 12.sp,
                fontWeight = FontWeight.Bold,
                color = when {
                    !cell.inCurrentMonth -> ShiftColors.muted
                    cell.meta.isHoliday -> ShiftColors.specialDayText
                    else -> ShiftColors.inkSoft
                },
                maxLines = 1
            )
        }
    }
}
