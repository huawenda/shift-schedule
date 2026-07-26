package com.shiftschedule.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        ShiftOverrideEntity::class,
        DayPrivateRecordEntity::class,
        SalaryInputEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun shiftOverrideDao(): ShiftOverrideDao
    abstract fun dayPrivateRecordDao(): DayPrivateRecordDao
    abstract fun salaryInputDao(): SalaryInputDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "shift-schedule.db")
                .build()
    }
}
