package com.shiftschedule.app.ui.home

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shiftschedule.app.ui.components.MonthCalendar
import com.shiftschedule.app.ui.components.ScheduleMonthTabs
import com.shiftschedule.app.ui.components.ShiftChip
import com.shiftschedule.app.ui.theme.ShiftColors
import com.shiftschedule.core.model.ScheduleMonth

@Composable
fun HomeRoute(
    viewModel: HomeViewModel = viewModel(
        factory = HomeViewModel.factory(LocalContext.current.applicationContext as Application)
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HomeScreen(
        state = state,
        onSelectMonth = viewModel::selectMonth,
        onSelectPerson = viewModel::selectPerson
    )
}

@Composable
fun HomeScreen(
    state: HomeUiState,
    onSelectMonth: (ScheduleMonth) -> Unit,
    onSelectPerson: (String) -> Unit
) {
    var showPersonSheet by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "倒班表",
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = { showPersonSheet = true }) {
                Text(
                    text = "${state.personName} · ${state.personGroup}",
                    style = MaterialTheme.typography.labelLarge
                )
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = "切换人员"
                )
            }
        }
        Spacer(modifier = Modifier.height(18.dp))

        Surface(color = ShiftColors.surface, shape = MaterialTheme.shapes.large) {
            Row(
                modifier = Modifier.padding(18.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "今天 ${state.todayKey}（${state.todayMetaLabel}）",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f)
                )
                if (state.todayInSchedule && state.todayShift != null) {
                    ShiftChip(shift = state.todayShift)
                } else {
                    Text(
                        text = "不在排班周期",
                        style = MaterialTheme.typography.labelMedium,
                        color = ShiftColors.muted
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        ScheduleMonthTabs(
            selected = state.month,
            onSelect = onSelectMonth
        )
        Spacer(modifier = Modifier.height(12.dp))

        Surface(color = ShiftColors.surface, shape = MaterialTheme.shapes.large) {
            MonthCalendar(
                cells = state.calendarCells,
                todayKey = state.todayKey,
                modifier = Modifier.padding(8.dp)
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        if (!state.todayInSchedule) {
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = "当前日期不在排班周期（${state.scheduleRangeLabel}）内",
                style = MaterialTheme.typography.bodyMedium,
                color = ShiftColors.muted
            )
        }
    }

    if (showPersonSheet) {
        @OptIn(ExperimentalMaterial3Api::class)
        ModalBottomSheet(onDismissRequest = { showPersonSheet = false }) {
            Text(
                text = "我是谁",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp)
            )
            state.people.forEach { person ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            onSelectPerson(person.name)
                            showPersonSheet = false
                        }
                        .padding(horizontal = 18.dp, vertical = 14.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = person.name, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            text = person.group,
                            style = MaterialTheme.typography.labelMedium,
                            color = ShiftColors.muted
                        )
                    }
                    if (person.name == state.personName) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = "当前人员",
                            tint = ShiftColors.primary
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
