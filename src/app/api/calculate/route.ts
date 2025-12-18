import { NextResponse } from 'next/server'
import { simulateRepayments } from '@/lib/calculate'
import { DEFAULT_RATES } from '@/lib/plans'
import { LumpSumPayment, SalaryStep, SimulationInput } from '@/lib/types'

const parseNumber = (value: any, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const parseIncomes = (raw: any): SalaryStep[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({ year: parseNumber(item?.year), salary: parseNumber(item?.salary) }))
    .filter((item) => item.year > 0 && item.salary >= 0)
}

const parseLumps = (raw: any): LumpSumPayment[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      date: typeof item?.date === 'string' ? item.date : '',
      amount: parseNumber(item?.amount),
      target: item?.target === 'undergrad' || item?.target === 'postgrad' ? item.target : 'auto',
    }))
    .filter((item) => item.date && item.amount > 0)
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()

    const input: SimulationInput = {
      undergraduatePlan: payload.undergraduatePlan ?? 'plan2',
      undergraduateLoan: parseNumber(payload.undergraduateLoan),
      postgraduateLoan: parseNumber(payload.postgraduateLoan),
      undergraduateStartYear: parseNumber(payload.undergraduateStartYear),
      undergraduateEndYear: parseNumber(payload.undergraduateEndYear),
      postgraduateStartYear: payload.postgraduateStartYear ? parseNumber(payload.postgraduateStartYear) : undefined,
      postgraduateEndYear: payload.postgraduateEndYear ? parseNumber(payload.postgraduateEndYear) : undefined,
      includeStudyInterest: Boolean(payload.includeStudyInterest),
      incomes: parseIncomes(payload.incomes),
      lumpSums: parseLumps(payload.lumpSums),
      rpi: parseNumber(payload.rpi, DEFAULT_RATES.rpi),
      baseRate: parseNumber(payload.baseRate, DEFAULT_RATES.baseRate),
      plan2InterestLowerIncome: parseNumber(payload.plan2InterestLowerIncome, DEFAULT_RATES.plan2InterestLowerIncome),
      plan2InterestUpperIncome: parseNumber(payload.plan2InterestUpperIncome, DEFAULT_RATES.plan2InterestUpperIncome),
    }

    const result = simulateRepayments(input)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Unable to calculate' }, { status: 400 })
  }
}
