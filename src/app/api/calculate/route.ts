import { NextResponse } from 'next/server'
import { simulateRepayments } from '@/lib/calculate'
import { DEFAULT_RATES } from '@/lib/plans'
import { LumpSumPayment, PlanId, SalaryStep, SimulationInput } from '@/lib/types'

const parseNumber = (value: unknown, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const parseIncomes = (raw: unknown): SalaryStep[] => {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .map((item) => {
      const obj = item as Record<string, unknown>
      return { year: parseNumber(obj?.year), salary: parseNumber(obj?.salary) }
    })
    .filter((item) => item.year > 0 && item.salary >= 0)
}

const parseLumps = (raw: unknown): LumpSumPayment[] => {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .map((item) => {
      const obj = item as Record<string, unknown>
      return {
        date: typeof obj?.date === 'string' ? obj.date : '',
        amount: parseNumber(obj?.amount),
        target:
          obj?.target === 'undergrad' || obj?.target === 'postgrad'
            ? (obj.target as 'undergrad' | 'postgrad')
            : ('auto' as const),
      }
    })
    .filter((item) => item.date && item.amount > 0)
}

const isPlanId = (value: unknown): value is PlanId =>
  value === 'plan1' || value === 'plan2' || value === 'plan5'

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>

    const input: SimulationInput = {
      undergraduatePlan: isPlanId(payload.undergraduatePlan) ? payload.undergraduatePlan : 'plan2',
      undergraduateLoan: parseNumber(payload.undergraduateLoan),
      postgraduateLoan: parseNumber(payload.postgraduateLoan),
      undergraduateStartYear: parseNumber(payload.undergraduateStartYear),
      undergraduateEndYear: parseNumber(payload.undergraduateEndYear),
      postgraduateStartYear: payload.postgraduateStartYear
        ? parseNumber(payload.postgraduateStartYear)
        : undefined,
      postgraduateEndYear: payload.postgraduateEndYear
        ? parseNumber(payload.postgraduateEndYear)
        : undefined,
      includeStudyInterest: Boolean(payload.includeStudyInterest),
      incomes: parseIncomes(payload.incomes),
      lumpSums: parseLumps(payload.lumpSums),
      rpi: parseNumber(payload.rpi, DEFAULT_RATES.rpi),
      baseRate: parseNumber(payload.baseRate, DEFAULT_RATES.baseRate),
      plan2InterestLowerIncome: parseNumber(
        payload.plan2InterestLowerIncome,
        DEFAULT_RATES.plan2InterestLowerIncome
      ),
      plan2InterestUpperIncome: parseNumber(
        payload.plan2InterestUpperIncome,
        DEFAULT_RATES.plan2InterestUpperIncome
      ),
    }

    const result = simulateRepayments(input)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to calculate'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
