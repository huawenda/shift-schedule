package com.shiftschedule.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shiftschedule.core.model.ShiftType

/**
 * 设计 token，直接取自 DESIGN.md：
 * - 蓝色 #2563eb 是唯一命令色；
 * - 班次语义色仅用于表示班次数据；
 * - 卡片 14dp 圆角、按钮/Chip 全圆角、文字固定字号梯度。
 */
object ShiftColors {
    val canvas = Color(0xFFEEF4FB)
    val canvasSoft = Color(0xFFF7F9FC)
    val surface = Color(0xFFFFFFFF)
    val surfaceMuted = Color(0xFFF6F9FD)
    val borderSoft = Color(0xFFEEF2F7)
    val borderStrong = Color(0xFFCDD7E5)
    val ink = Color(0xFF172033)
    val inkSoft = Color(0xFF526071)
    val muted = Color(0xFF667085)
    val primary = Color(0xFF2563EB)
    val primarySoft = Color(0xFFEFF6FF)
    val primaryBorder = Color(0xFFBFDBFE)

    val dayBg = Color(0xFFDFF3FF)
    val dayText = Color(0xFF02689F)
    val nightBg = Color(0xFFEEE9FF)
    val nightText = Color(0xFF5B21B6)
    val restBg = Color(0xFFDCFCE7)
    val restText = Color(0xFF047857)
    val specialDayBg = Color(0xFFFFF0C2)
    val specialDayText = Color(0xFFB45309)
    val specialNightBg = Color(0xFFFDE7C7)
    val specialNightText = Color(0xFF9A3412)
    val leaveBg = Color(0xFFE5E7EB)
    val leaveText = Color(0xFF475467)
    val legalBg = Color(0xFFFEE2E2)
    val legalText = Color(0xFFDC2626)

    val success = Color(0xFF15803D)
    val warning = Color(0xFFF59E0B)
    val danger = Color(0xFFEF4444)
}

/** 班次类型对应的语义色对（背景 / 文字）。 */
fun ShiftType.colors(): Pair<Color, Color> = when (this) {
    ShiftType.DAY -> ShiftColors.dayBg to ShiftColors.dayText
    ShiftType.NIGHT -> ShiftColors.nightBg to ShiftColors.nightText
    ShiftType.REST -> ShiftColors.restBg to ShiftColors.restText
    ShiftType.SPECIAL_DAY -> ShiftColors.specialDayBg to ShiftColors.specialDayText
    ShiftType.SPECIAL_NIGHT -> ShiftColors.specialNightBg to ShiftColors.specialNightText
    ShiftType.LEAVE -> ShiftColors.leaveBg to ShiftColors.leaveText
}

val ShiftColorScheme = lightColorScheme(
    primary = ShiftColors.primary,
    onPrimary = Color.White,
    primaryContainer = ShiftColors.primarySoft,
    onPrimaryContainer = ShiftColors.primary,
    secondary = ShiftColors.inkSoft,
    onSecondary = Color.White,
    background = ShiftColors.canvas,
    onBackground = ShiftColors.ink,
    surface = ShiftColors.surface,
    onSurface = ShiftColors.ink,
    surfaceVariant = ShiftColors.surfaceMuted,
    onSurfaceVariant = ShiftColors.inkSoft,
    outline = ShiftColors.borderStrong,
    outlineVariant = ShiftColors.borderSoft,
    error = ShiftColors.danger,
    onError = Color.White
)

val ShiftTypography = Typography(
    headlineLarge = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, lineHeight = 38.sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, lineHeight = 32.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 27.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 18.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 16.sp)
)

val ShiftShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(14.dp),
    extraLarge = RoundedCornerShape(18.dp)
)
