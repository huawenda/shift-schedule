package com.shiftschedule.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.shiftschedule.app.ui.home.HomeRoute
import com.shiftschedule.app.ui.team.TeamRoute
import com.shiftschedule.app.ui.theme.ShiftScheduleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ShiftScheduleTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppRoot()
                }
            }
        }
    }
}

private enum class AppView(val label: String) {
    MY("我的"),
    TEAM("团队")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot() {
    var view by rememberSaveable { mutableStateOf(AppView.MY) }
    val views = AppView.entries

    Column(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
        SingleChoiceSegmentedButtonRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 8.dp)
        ) {
            views.forEachIndexed { index, item ->
                SegmentedButton(
                    selected = view == item,
                    onClick = { view = item },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = views.size)
                ) {
                    Text(text = item.label, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        when (view) {
            AppView.MY -> HomeRoute()
            AppView.TEAM -> TeamRoute()
        }
    }
}
