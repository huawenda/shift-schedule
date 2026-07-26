package com.shiftschedule.app.ui.team

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.shiftschedule.app.ui.components.ScheduleMonthTabs
import com.shiftschedule.app.ui.theme.ShiftColors
import com.shiftschedule.core.canMarkLegalShift
import com.shiftschedule.core.getEditableShiftOptionsForBase
import com.shiftschedule.core.getOvertimePresetOptions
import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.normalizeOvertimeHours

@Composable
fun TeamRoute(
    viewModel: TeamViewModel = viewModel(
        factory = TeamViewModel.factory(LocalContext.current.applicationContext as Application)
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    TeamScreen(
        state = state,
        onSelectMonth = viewModel::selectMonth,
        onEditCell = viewModel::startEdit,
        onDismissEdit = viewModel::dismissEdit,
        onSaveEdit = viewModel::saveEdit,
        onClearEdit = viewModel::clearEdit
    )
}

@Composable
fun TeamScreen(
    state: TeamUiState,
    onSelectMonth: (com.shiftschedule.core.model.ScheduleMonth) -> Unit,
    onEditCell: (String, String) -> Unit,
    onDismissEdit: () -> Unit,
    onSaveEdit: (DayEditUi) -> Unit,
    onClearEdit: (String, String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        ScheduleMonthTabs(
            selected = state.month,
            onSelect = onSelectMonth
        )
        Spacer(modifier = Modifier.height(8.dp))
        TeamScheduleGrid(
            state = state,
            onCellClick = { row, cell ->
                if (row.isCurrentPerson) onEditCell(row.personName, cell.date)
            },
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "点击你的班次可编辑：覆盖班次 / 加班 / 法定 / 请假",
            style = MaterialTheme.typography.labelMedium,
            color = ShiftColors.muted,
            modifier = Modifier.padding(horizontal = 18.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))
    }

    state.editing?.let { editing ->
        DayEditSheet(
            edit = editing,
            onDismiss = onDismissEdit,
            onSave = onSaveEdit,
            onClear = { onClearEdit(editing.personName, editing.date) }
        )
    }
}

private fun formatHoursInput(value: Double): String =
    if (value <= 0) "" else if (value == value.toLong().toDouble()) {
        value.toLong().toString()
    } else {
        value.toString()
    }

/**
 * 日期编辑弹层。全部选项由 domain 规则驱动：
 * 可改班次 getEditableShiftOptionsForBase、法定约束 canMarkLegalShift、
 * 加班预设 getOvertimePresetOptions、请假时长仅事假时出现。
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DayEditSheet(
    edit: DayEditUi,
    onDismiss: () -> Unit,
    onSave: (DayEditUi) -> Unit,
    onClear: () -> Unit
) {
    var shiftOverride by remember { mutableStateOf(edit.shiftOverride) }
    var isLegal by remember { mutableStateOf(edit.isLegalOvertime) }
    var overtimeText by remember { mutableStateOf(formatHoursInput(edit.overtimeHours)) }
    var leaveDuration by remember { mutableStateOf(edit.leaveDuration ?: LeaveDuration.FULL_DAY) }

    val effectiveShift = shiftOverride ?: edit.baseShift
    val shiftOptions = getEditableShiftOptionsForBase(edit.baseShift)
    val legalAllowed = canMarkLegalShift(effectiveShift)
    val overtimePresets = getOvertimePresetOptions(effectiveShift, isLegal)

    // 班次变化后若不再允许法定标记，自动清除（对应 normalizeLegalOverride）
    LaunchedEffect(legalAllowed) {
        if (!legalAllowed) isLegal = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
        ) {
            Text(
                text = "${edit.personName} · ${edit.date}",
                style = MaterialTheme.typography.headlineSmall
            )
            Text(
                text = "周期班次：${edit.baseShift.label}",
                style = MaterialTheme.typography.labelMedium,
                color = ShiftColors.muted
            )
            Spacer(modifier = Modifier.height(14.dp))

            if (shiftOptions.isNotEmpty()) {
                Text(text = "班次调整", style = MaterialTheme.typography.labelLarge)
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = shiftOverride == null,
                        onClick = { shiftOverride = null },
                        label = { Text("跟随周期") }
                    )
                    shiftOptions.forEach { option ->
                        FilterChip(
                            selected = shiftOverride == option,
                            onClick = { shiftOverride = option },
                            label = { Text(option.label) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(14.dp))
            }

            if (legalAllowed) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "法定节假日加班",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Switch(checked = isLegal, onCheckedChange = { isLegal = it })
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (overtimePresets.isNotEmpty()) {
                Text(text = "加班时长", style = MaterialTheme.typography.labelLarge)
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    overtimePresets.forEach { preset ->
                        FilterChip(
                            selected = overtimeText == formatHoursInput(preset),
                            onClick = { overtimeText = formatHoursInput(preset) },
                            label = { Text("${formatHoursInput(preset)}h") }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = overtimeText,
                    onValueChange = { overtimeText = it },
                    label = { Text("加班小时（按 0.5 取整）") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(14.dp))
            }

            if (effectiveShift == ShiftType.LEAVE) {
                Text(text = "请假时长", style = MaterialTheme.typography.labelLarge)
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LeaveDuration.entries.forEach { duration ->
                        FilterChip(
                            selected = leaveDuration == duration,
                            onClick = { leaveDuration = duration },
                            label = { Text("${duration.label}（${duration.hours}h）") }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(14.dp))
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                TextButton(onClick = onClear) {
                    Text(text = "清除记录", color = ShiftColors.danger)
                }
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = onDismiss) {
                    Text(text = "取消")
                }
                Spacer(modifier = Modifier.padding(4.dp))
                Button(
                    onClick = {
                        onSave(
                            edit.copy(
                                shiftOverride = shiftOverride,
                                isLegalOvertime = isLegal && legalAllowed,
                                overtimeHours = if (overtimePresets.isEmpty()) {
                                    0.0
                                } else {
                                    normalizeOvertimeHours(overtimeText)
                                },
                                leaveDuration = if (effectiveShift == ShiftType.LEAVE) {
                                    leaveDuration
                                } else {
                                    null
                                }
                            )
                        )
                    }
                ) {
                    Text(text = "保存")
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
