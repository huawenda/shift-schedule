package com.shiftschedule.app.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.shiftschedule.core.model.ScheduleMonth

/** 结算月 tabs（5~12 月），横向可滚动，选中项居中。 */
@Composable
fun ScheduleMonthTabs(
    selected: ScheduleMonth,
    onSelect: (ScheduleMonth) -> Unit,
    modifier: Modifier = Modifier
) {
    ScrollableTabRow(
        selectedTabIndex = selected.ordinal,
        edgePadding = 0.dp,
        divider = {},
        modifier = modifier
    ) {
        ScheduleMonth.entries.forEach { month ->
            Tab(
                selected = month == selected,
                onClick = { onSelect(month) },
                text = {
                    Text(
                        text = "${month.number}月",
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            )
        }
    }
}
