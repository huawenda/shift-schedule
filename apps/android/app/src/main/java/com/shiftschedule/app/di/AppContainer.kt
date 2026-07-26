package com.shiftschedule.app.di

import android.content.Context
import com.shiftschedule.core.repository.DayRecordsRepository
import com.shiftschedule.core.repository.SalaryRepository
import com.shiftschedule.core.repository.SettingsRepository
import com.shiftschedule.data.DataStoreSettingsRepository
import com.shiftschedule.data.RoomDayRecordsRepository
import com.shiftschedule.data.RoomSalaryRepository
import com.shiftschedule.data.db.AppDatabase

/**
 * 手动依赖注入容器。
 * 当前装配本地实现（Room/DataStore）；将来接后端时只改这里，
 * 替换为带同步协调器的实现即可，ViewModel/UI 不动。
 */
class AppContainer(context: Context) {

    private val database: AppDatabase = AppDatabase.build(context)

    val dayRecordsRepository: DayRecordsRepository = RoomDayRecordsRepository(database)
    val salaryRepository: SalaryRepository = RoomSalaryRepository(database)
    val settingsRepository: SettingsRepository = DataStoreSettingsRepository(context)
}
