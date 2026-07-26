package com.shiftschedule.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SalaryTest {

    @Test
    fun `calculates hourly wage, overtime pay, deductions and net salary`() {
        assertEquals(
            SalaryCalculation(
                baseSalary = 4350.0,
                performanceAllowance = 500.0,
                positionAllowance = 300.0,
                otherDeductions = 120.0,
                hourlyWage = 25.0,
                leaveDeduction = 300.0,
                weekdayOvertimePay = 375.0,
                specialOvertimePay = 400.0,
                legalOvertimePay = 300.0,
                overtimePayTotal = 1075.0,
                basicPayTotal = 5150.0,
                deductionTotal = 420.0,
                payableSalary = 6225.0,
                netSalary = 5805.0
            ),
            calculateSalary(
                SalaryInputValues(
                    baseSalary = "4350",
                    performanceAllowance = "500",
                    positionAllowance = "300",
                    otherDeductions = "120"
                ),
                SalaryHours(weekdayHours = 10.0, specialHours = 8.0, legalHours = 4.0, leaveHours = 12.0)
            )
        )
    }

    @Test
    fun `treats empty, invalid and negative inputs as zero`() {
        assertEquals(
            SalaryCalculation(
                baseSalary = 0.0,
                performanceAllowance = 0.0,
                positionAllowance = 0.0,
                otherDeductions = 0.0,
                hourlyWage = 0.0,
                leaveDeduction = 0.0,
                weekdayOvertimePay = 0.0,
                specialOvertimePay = 0.0,
                legalOvertimePay = 0.0,
                overtimePayTotal = 0.0,
                basicPayTotal = 0.0,
                deductionTotal = 0.0,
                payableSalary = 0.0,
                netSalary = 0.0
            ),
            calculateSalary(
                SalaryInputValues(
                    baseSalary = "",
                    performanceAllowance = "abc",
                    positionAllowance = "-10",
                    otherDeductions = ""
                ),
                SalaryHours(weekdayHours = 5.0, specialHours = 5.0, legalHours = 5.0, leaveHours = 5.0)
            )
        )
    }

    @Test
    fun `rounds money values to two decimals`() {
        val result = calculateSalary(
            SalaryInputValues(
                baseSalary = "5000",
                performanceAllowance = "0",
                positionAllowance = "0",
                otherDeductions = "0"
            ),
            SalaryHours(weekdayHours = 1.0, specialHours = 1.0, legalHours = 1.0, leaveHours = 1.0)
        )

        assertEquals(28.74, result.hourlyWage)
        assertEquals(28.74, result.leaveDeduction)
        assertEquals(43.1, result.weekdayOvertimePay)
        assertEquals(57.47, result.specialOvertimePay)
        assertEquals(86.21, result.legalOvertimePay)
        assertEquals(186.78, result.overtimePayTotal)
        assertEquals(5158.04, result.netSalary)
    }

    @Test
    fun `calculates a single overtime pay amount with the same hourly wage basis`() {
        assertEquals(
            112.5,
            calculateOvertimePay(SalaryInputValues(baseSalary = "4350"), 3.0, 1.5)
        )
    }
}
