package com.shiftschedule.core

import java.util.Locale
import kotlin.math.round

data class SalaryInputValues(
    val baseSalary: String = "",
    val performanceAllowance: String = "",
    val positionAllowance: String = "",
    val otherDeductions: String = ""
)

val emptySalaryInputs = SalaryInputValues()

data class SalaryHours(
    val weekdayHours: Double,
    val specialHours: Double,
    val legalHours: Double,
    val leaveHours: Double
)

data class SalaryCalculation(
    val baseSalary: Double,
    val performanceAllowance: Double,
    val positionAllowance: Double,
    val otherDeductions: Double,
    val hourlyWage: Double,
    val leaveDeduction: Double,
    val weekdayOvertimePay: Double,
    val specialOvertimePay: Double,
    val legalOvertimePay: Double,
    val overtimePayTotal: Double,
    val basicPayTotal: Double,
    val deductionTotal: Double,
    val payableSalary: Double,
    val netSalary: Double
)

fun calculateSalary(inputs: SalaryInputValues, hours: SalaryHours): SalaryCalculation {
    val baseSalary = parseMoneyInput(inputs.baseSalary)
    val performanceAllowance = parseMoneyInput(inputs.performanceAllowance)
    val positionAllowance = parseMoneyInput(inputs.positionAllowance)
    val otherDeductions = parseMoneyInput(inputs.otherDeductions)
    val rawHourlyWage = baseSalary / 21.75 / 8
    val hourlyWage = roundMoney(rawHourlyWage)
    val leaveDeduction = roundMoney(safeHours(hours.leaveHours) * rawHourlyWage)
    val weekdayOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.weekdayHours) * 1.5)
    val specialOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.specialHours) * 2)
    val legalOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.legalHours) * 3)
    val overtimePayTotal = roundMoney(weekdayOvertimePay + specialOvertimePay + legalOvertimePay)
    val basicPayTotal = roundMoney(baseSalary + performanceAllowance + positionAllowance)
    val deductionTotal = roundMoney(otherDeductions + leaveDeduction)
    val payableSalary = roundMoney(basicPayTotal + overtimePayTotal)
    val netSalary = roundMoney(payableSalary - deductionTotal)

    return SalaryCalculation(
        baseSalary = baseSalary,
        performanceAllowance = performanceAllowance,
        positionAllowance = positionAllowance,
        otherDeductions = otherDeductions,
        hourlyWage = hourlyWage,
        leaveDeduction = leaveDeduction,
        weekdayOvertimePay = weekdayOvertimePay,
        specialOvertimePay = specialOvertimePay,
        legalOvertimePay = legalOvertimePay,
        overtimePayTotal = overtimePayTotal,
        basicPayTotal = basicPayTotal,
        deductionTotal = deductionTotal,
        payableSalary = payableSalary,
        netSalary = netSalary
    )
}

fun calculateOvertimePay(inputs: SalaryInputValues, overtimeHours: Double, multiplier: Double): Double {
    val rawHourlyWage = parseMoneyInput(inputs.baseSalary) / 21.75 / 8
    return roundMoney(rawHourlyWage * safeHours(overtimeHours) * safeMultiplier(multiplier))
}

fun formatMoney(value: Double): String = String.format(Locale.US, "%.2f", roundMoney(value))

private fun parseMoneyInput(value: String): Double {
    val parsed = value.trim().toDoubleOrNull() ?: return 0.0
    if (parsed.isNaN() || !parsed.isFinite() || parsed <= 0) return 0.0
    return roundMoney(parsed)
}

private fun safeHours(value: Double): Double = if (value.isFinite() && value > 0) value else 0.0

private fun safeMultiplier(value: Double): Double = if (value.isFinite() && value > 0) value else 0.0

/** 与 JS Number.EPSILON 等值，保证与 TS 端 roundMoney 行为一致。 */
private const val MONEY_EPSILON = 2.220446049250313e-16

internal fun roundMoney(value: Double): Double {
    if (!value.isFinite()) return 0.0
    return round((value + MONEY_EPSILON) * 100) / 100
}
