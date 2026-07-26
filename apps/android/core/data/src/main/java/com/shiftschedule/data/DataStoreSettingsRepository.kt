package com.shiftschedule.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.shiftschedule.core.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "settings")

class DataStoreSettingsRepository(private val context: Context) : SettingsRepository {

    private val keyCurrentPersonName = stringPreferencesKey("current_person_name")

    override val currentPersonName: Flow<String?> =
        context.settingsDataStore.data.map { preferences -> preferences[keyCurrentPersonName] }

    override suspend fun setCurrentPersonName(name: String) {
        context.settingsDataStore.edit { preferences ->
            preferences[keyCurrentPersonName] = name
        }
    }
}
