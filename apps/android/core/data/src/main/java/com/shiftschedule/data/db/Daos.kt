package com.shiftschedule.data.db

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ShiftOverrideDao {
    @Query("SELECT * FROM day_shift_overrides")
    fun observeAll(): Flow<List<ShiftOverrideEntity>>

    @Upsert
    suspend fun upsert(entity: ShiftOverrideEntity)

    @Query("DELETE FROM day_shift_overrides WHERE person_name = :personName AND record_date = :recordDate")
    suspend fun delete(personName: String, recordDate: String)
}

@Dao
interface DayPrivateRecordDao {
    @Query("SELECT * FROM day_private_records")
    fun observeAll(): Flow<List<DayPrivateRecordEntity>>

    @Upsert
    suspend fun upsert(entity: DayPrivateRecordEntity)

    @Query("DELETE FROM day_private_records WHERE person_name = :personName AND record_date = :recordDate")
    suspend fun delete(personName: String, recordDate: String)
}

@Dao
interface SalaryInputDao {
    @Query("SELECT * FROM salary_inputs WHERE person_name = :personName AND month = :month")
    fun observe(personName: String, month: String): Flow<SalaryInputEntity?>

    @Upsert
    suspend fun upsert(entity: SalaryInputEntity)
}
