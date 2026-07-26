package com.shiftschedule.app.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.shiftschedule.app.ui.theme.colors
import com.shiftschedule.core.model.ShiftType

/** 班次 Chip：始终同时展示语义色与文字，绝不只用颜色区分（DESIGN.md 硬性规则）。 */
@Composable
fun ShiftChip(
    shift: ShiftType,
    modifier: Modifier = Modifier
) {
    val (background, textColor) = shift.colors()
    Surface(
        modifier = modifier,
        color = background,
        shape = RoundedCornerShape(999.dp)
    ) {
        Text(
            text = shift.label,
            color = textColor,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}
