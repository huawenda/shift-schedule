package com.shiftschedule.app

import android.app.Application
import com.shiftschedule.app.di.AppContainer

class ShiftScheduleApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
