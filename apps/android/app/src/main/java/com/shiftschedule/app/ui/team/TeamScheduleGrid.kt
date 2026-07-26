package com.shiftschedule.app.ui.team

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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

private val nameColumnWidth = 84.dp
private val dayCellWidth = 44.dp
private val dayCellHeight = 48.dp
private val headerHeight = 44.dp

/**
 * 团队排班表：冻结姓名列 + 横向滚动日期区，整表垂直滚动。
 * 标记规则：蓝点=班次覆盖，红点=法定加班，蓝描边=今天。
 * 只有“我是谁”当前人的行可点击进入编辑。
 */
@Composable
fun TeamScheduleGrid(
    state: TeamUiState,
    onCellClick: (TeamRowUi, TeamCellUi) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = ShiftColors.surface,
        shape = MaterialTheme.shapes.large,
        modifier = modifier
    ) {
        Row(modifier = Modifier.verticalScroll(rememberScrollState())) {
            // 冻结姓名列
            Column {
                Box(
                    modifier = Modifier
                        .width(nameColumnWidth)
                        .height(headerHeight)
                        .padding(start = 12.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Text(
                        text = "姓名",
                        style = MaterialTheme.typography.labelMedium,
                        color = ShiftColors.muted
                    )
                }
                state.rows.forEach { row ->
                    Column(
                        modifier = Modifier
                            .width(nameColumnWidth)
                            .height(dayCellHeight)
                            .background(
                                if (row.isCurrentPerson) ShiftColors.primarySoft
                                else ShiftColors.surface
                            )
                            .padding(start = 12.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = row.personName,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (row.isCurrentPerson) ShiftColors.primary else ShiftColors.ink
                        )
                        Text(
                            text = row.group,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = ShiftColors.muted
                        )
                    }
                }
            }

            // 横向滚动日期区
            Column(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                Row {
                    state.dateLabels.forEach { label ->
                        val isToday = state.rows
                            .firstOrNull()
                            ?.cells
                            ?.firstOrNull { it.date == label.date }
                            ?.isToday == true
                        Column(
                            modifier = Modifier
                                .width(dayCellWidth)
                                .height(headerHeight),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = label.date.substring(3),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isToday) ShiftColors.primary else ShiftColors.ink
                            )
                            Text(
                                text = label.weekday,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = ShiftColors.muted
                            )
                        }
                    }
                }
                state.rows.forEach { row ->
                    Row {
                        row.cells.forEach { cell ->
                            ShiftDayCell(
                                row = row,
                                cell = cell,
                                onClick = { onCellClick(row, cell) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ShiftDayCell(
    row: TeamRowUi,
    cell: TeamCellUi,
    onClick: () -> Unit
) {
    val (background, foreground) = cell.shift.colors()
    Surface(
        modifier = Modifier
            .padding(2.dp)
            .width(dayCellWidth - 4.dp)
            .height(dayCellHeight - 4.dp),
        color = background,
        shape = RoundedCornerShape(8.dp),
        border = if (cell.isToday) BorderStroke(2.dp, ShiftColors.primary) else null
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(enabled = row.isCurrentPerson, onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = cell.shift.label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = foreground,
                textAlign = TextAlign.Center
            )
            if (cell.isOverridden) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(3.dp)
                        .size(6.dp)
                        .background(ShiftColors.primary, CircleShape)
                )
            }
            if (cell.isLegalOvertime) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(3.dp)
                        .size(6.dp)
                        .background(ShiftColors.legalText, CircleShape)
                )
            }
        }
    }
}
