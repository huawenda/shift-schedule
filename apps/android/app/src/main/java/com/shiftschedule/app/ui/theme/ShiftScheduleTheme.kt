package com.shiftschedule.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

@Composable
fun ShiftScheduleTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ShiftColorScheme,
        typography = ShiftTypography,
        shapes = ShiftShapes,
        content = content
    )
}
