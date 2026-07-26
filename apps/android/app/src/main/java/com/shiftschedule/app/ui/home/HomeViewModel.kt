package com.shiftschedule.app.ui.home

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.shiftschedule.app.ShiftScheduleApp
import com.shiftschedule.core.CalendarCell
import com.shiftschedule.core.data.scheduleData
import com.shiftschedule.core.formatScheduleMonthDay
import com.shiftschedule.core.getCalendarDateMeta
import com.shiftschedule.core.getCurrentScheduleMonth
import com.shiftschedule.core.getPersonMonthCalendarCells
import com.shiftschedule.core.model.ScheduleMonth
import com.shiftschedule.core.model.SchedulePerson
import com.shiftschedule.core.model.ShiftType
import com.shiftschedule.core.repository.SettingsRepository
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HomeUiState(
    val personName: String = "",
    val personGroup: String = "",
    val people: List<SchedulePerson> = emptyList(),
    val todayKey: String = "",
    val todayMetaLabel: String = "",
    val todayShift: ShiftType? = null,
    val todayInSchedule: Boolean = false,
    val month: ScheduleMonth = ScheduleMonth.M05,
    val calendarCells: List<CalendarCell> = emptyList(),
    val scheduleRangeLabel: String = ""
)

class HomeViewModel(private val settingsRepository: SettingsRepository) : ViewModel() {

    private val today: LocalDate = LocalDate.now()
    private val selectedMonth = MutableStateFlow<ScheduleMonth?>(null)

    val uiState: StateFlow<HomeUiState> = combine(
        settingsRepository.currentPersonName,
        selectedMonth
    ) { savedName, month ->
        buildState(
            person = scheduleData.people.find { it.name == savedName } ?: scheduleData.people.first(),
            month = month ?: defaultMonth()
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = buildState(scheduleData.people.first(), defaultMonth())
    )

    fun selectMonth(month: ScheduleMonth) {
        selectedMonth.value = month
    }

    fun selectPerson(name: String) {
        viewModelScope.launch { settingsRepository.setCurrentPersonName(name) }
    }

    private fun defaultMonth(): ScheduleMonth =
        getCurrentScheduleMonth(scheduleData, today) ?: ScheduleMonth.M05

    private fun buildState(person: SchedulePerson, month: ScheduleMonth): HomeUiState {
        val todayKey = formatScheduleMonthDay(today)
        val todayIndex = scheduleData.dates.indexOf(todayKey)

        return HomeUiState(
            personName = person.name,
            personGroup = person.group,
            people = scheduleData.people,
            todayKey = todayKey,
            todayMetaLabel = getCalendarDateMeta(today.toString()).label,
            todayShift = if (todayIndex >= 0) person.shifts.getOrNull(todayIndex) else null,
            todayInSchedule = todayIndex >= 0,
            month = month,
            calendarCells = getPersonMonthCalendarCells(scheduleData, month, person.name),
            scheduleRangeLabel = "${scheduleData.startDate} ~ ${scheduleData.endDate}"
        )
    }

    companion object {
        fun factory(application: Application): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val container = (application as ShiftScheduleApp).container
                HomeViewModel(container.settingsRepository)
            }
        }
    }
}
