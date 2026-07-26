package com.shiftschedule.app.ui.team

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.shiftschedule.app.ShiftScheduleApp
import com.shiftschedule.core.DateLabel
import com.shiftschedule.core.data.scheduleData
import com.shiftschedule.core.formatScheduleMonthDay
import com.shiftschedule.core.getCurrentScheduleMonth
import com.shiftschedule.core.getDateLabels
import com.shiftschedule.core.getMonthScheduleView
import com.shiftschedule.core.model.LeaveDuration
import com.shiftschedule.core.model.ScheduleMonth
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.repository.DayRecordsRepository
import com.shiftschedule.core.repository.SettingsRepository
import com.shiftschedule.core.sync.DayOverrides
import com.shiftschedule.core.sync.getOverrideKey
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class TeamCellUi(
    val date: String,
    val baseShift: ShiftType,
    val shift: ShiftType,
    val isOverridden: Boolean,
    val isLegalOvertime: Boolean,
    val overtimeHours: Double,
    val leaveDuration: LeaveDuration?,
    val isToday: Boolean
)

data class TeamRowUi(
    val personName: String,
    val group: String,
    val isCurrentPerson: Boolean,
    val cells: List<TeamCellUi>
)

data class DayEditUi(
    val personName: String,
    val date: String,
    val baseShift: ShiftType,
    val shiftOverride: ShiftType?,
    val overtimeHours: Double,
    val isLegalOvertime: Boolean,
    val leaveDuration: LeaveDuration?
) {
    val effectiveShift: ShiftType get() = shiftOverride ?: baseShift
}

data class TeamUiState(
    val month: ScheduleMonth = ScheduleMonth.M05,
    val dateLabels: List<DateLabel> = emptyList(),
    val rows: List<TeamRowUi> = emptyList(),
    val currentPersonName: String = "",
    val editing: DayEditUi? = null
)

class TeamViewModel(
    private val dayRecordsRepository: DayRecordsRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val today: LocalDate = LocalDate.now()
    private val selectedMonth = MutableStateFlow(defaultMonth())
    private val editing = MutableStateFlow<DayEditUi?>(null)

    val uiState: StateFlow<TeamUiState> = combine(
        selectedMonth,
        dayRecordsRepository.observeOverrides(),
        settingsRepository.currentPersonName,
        editing
    ) { month, overrides, savedName, edit ->
        buildState(month, overrides, savedName, edit)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = TeamUiState()
    )

    fun selectMonth(month: ScheduleMonth) {
        selectedMonth.value = month
    }

    fun startEdit(personName: String, date: String) {
        val state = uiState.value
        if (personName != state.currentPersonName) return
        val cell = state.rows
            .firstOrNull { it.personName == personName }
            ?.cells
            ?.firstOrNull { it.date == date }
            ?: return
        editing.value = DayEditUi(
            personName = personName,
            date = date,
            baseShift = cell.baseShift,
            shiftOverride = if (cell.isOverridden) cell.shift else null,
            overtimeHours = cell.overtimeHours,
            isLegalOvertime = cell.isLegalOvertime,
            leaveDuration = cell.leaveDuration
        )
    }

    fun dismissEdit() {
        editing.value = null
    }

    fun saveEdit(edit: DayEditUi) {
        viewModelScope.launch {
            dayRecordsRepository.setShiftOverride(edit.personName, edit.date, edit.shiftOverride)
            dayRecordsRepository.setPrivateRecord(
                personName = edit.personName,
                date = edit.date,
                overtimeHours = edit.overtimeHours,
                isLegalOvertime = edit.isLegalOvertime,
                leaveDuration = if (edit.effectiveShift == ShiftType.LEAVE) edit.leaveDuration else null
            )
            editing.value = null
        }
    }

    fun clearEdit(personName: String, date: String) {
        viewModelScope.launch {
            dayRecordsRepository.clearDayRecords(personName, date)
            editing.value = null
        }
    }

    private fun defaultMonth(): ScheduleMonth =
        getCurrentScheduleMonth(scheduleData, today) ?: ScheduleMonth.M05

    private fun buildState(
        month: ScheduleMonth,
        overrides: DayOverrides,
        savedName: String?,
        edit: DayEditUi?
    ): TeamUiState {
        val monthView = getMonthScheduleView(scheduleData, month)
        val todayKey = formatScheduleMonthDay(today)
        val currentName = savedName
            ?.takeIf { name -> monthView.people.any { it.name == name } }
            ?: monthView.people.first().name

        val rows = monthView.people.map { person ->
            TeamRowUi(
                personName = person.name,
                group = person.group,
                isCurrentPerson = person.name == currentName,
                cells = monthView.dates.mapIndexed { index, date ->
                    val key = getOverrideKey(person.name, date)
                    val shiftOverride = overrides.shiftOverrides[key]
                    val base = person.shifts[index]
                    TeamCellUi(
                        date = date,
                        baseShift = base,
                        shift = shiftOverride ?: base,
                        isOverridden = shiftOverride != null,
                        isLegalOvertime = overrides.legalOverrides[key] == true,
                        overtimeHours = overrides.overtimeOverrides[key] ?: 0.0,
                        leaveDuration = overrides.leaveDurationOverrides[key],
                        isToday = date == todayKey
                    )
                }
            )
        }

        return TeamUiState(
            month = month,
            dateLabels = getDateLabels(monthView.startDate, monthView.dates),
            rows = rows,
            currentPersonName = currentName,
            editing = edit
        )
    }

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val container = (application as ShiftScheduleApp).container
                TeamViewModel(container.dayRecordsRepository, container.settingsRepository)
            }
        }
    }
}
