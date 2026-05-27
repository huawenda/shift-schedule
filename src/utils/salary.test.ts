import { describe, expect, it } from 'vitest'
import { calculateOvertimePay, calculateSalary } from './salary'

describe('salary calculation', () => {
  it('calculates hourly wage, overtime pay, deductions and net salary', () => {
    expect(calculateSalary(
      {
        baseSalary: '4350',
        performanceAllowance: '500',
        positionAllowance: '300',
        otherDeductions: '120'
      },
      {
        weekdayHours: 10,
        specialHours: 8,
        legalHours: 4,
        leaveHours: 12
      }
    )).toEqual({
      baseSalary: 4350,
      performanceAllowance: 500,
      positionAllowance: 300,
      otherDeductions: 120,
      hourlyWage: 25,
      leaveDeduction: 300,
      weekdayOvertimePay: 375,
      specialOvertimePay: 400,
      legalOvertimePay: 300,
      overtimePayTotal: 1075,
      basicPayTotal: 5150,
      deductionTotal: 420,
      payableSalary: 6225,
      netSalary: 5805
    })
  })

  it('treats empty, invalid and negative inputs as zero', () => {
    expect(calculateSalary(
      {
        baseSalary: '',
        performanceAllowance: 'abc',
        positionAllowance: '-10',
        otherDeductions: ''
      },
      {
        weekdayHours: 5,
        specialHours: 5,
        legalHours: 5,
        leaveHours: 5
      }
    )).toEqual({
      baseSalary: 0,
      performanceAllowance: 0,
      positionAllowance: 0,
      otherDeductions: 0,
      hourlyWage: 0,
      leaveDeduction: 0,
      weekdayOvertimePay: 0,
      specialOvertimePay: 0,
      legalOvertimePay: 0,
      overtimePayTotal: 0,
      basicPayTotal: 0,
      deductionTotal: 0,
      payableSalary: 0,
      netSalary: 0
    })
  })

  it('rounds money values to two decimals', () => {
    expect(calculateSalary(
      {
        baseSalary: '5000',
        performanceAllowance: '0',
        positionAllowance: '0',
        otherDeductions: '0'
      },
      {
        weekdayHours: 1,
        specialHours: 1,
        legalHours: 1,
        leaveHours: 1
      }
    )).toEqual(expect.objectContaining({
      hourlyWage: 28.74,
      leaveDeduction: 28.74,
      weekdayOvertimePay: 43.1,
      specialOvertimePay: 57.47,
      legalOvertimePay: 86.21,
      overtimePayTotal: 186.78,
      netSalary: 5158.04
    }))
  })

  it('calculates a single overtime pay amount with the same hourly wage basis', () => {
    expect(calculateOvertimePay({
      baseSalary: '4350',
      performanceAllowance: '',
      positionAllowance: '',
      otherDeductions: ''
    }, 3, 1.5)).toBe(112.5)
  })
})
