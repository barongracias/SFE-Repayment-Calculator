import { PlanConfig, PlanId, RatesInput } from './types'

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  plan1: {
    id: 'plan1',
    name: 'Plan 1 (pre-2012, England/Wales)',
    repaymentThreshold: 22015,
    repaymentRate: 0.09,
    writeOffYears: 25,
    description:
      'Plan 1 thresholds from gov.uk (SFE). Interest is the lower of RPI or BoE base rate + 1%.',
  },
  plan2: {
    id: 'plan2',
    name: 'Plan 2 (2012-2023 undergrad)',
    repaymentThreshold: 27295,
    repaymentRate: 0.09,
    writeOffYears: 30,
    description:
      'Plan 2 repayment threshold £27,295; interest blends from RPI to RPI+3% depending on income.',
  },
  plan5: {
    id: 'plan5',
    name: 'Plan 5 (Aug 2023+ undergrad)',
    repaymentThreshold: 25000,
    repaymentRate: 0.09,
    writeOffYears: 40,
    description: 'Plan 5 repayment threshold £25,000; interest charged at RPI, write-off after 40 years.',
  },
}

export const POSTGRAD_PLAN: PlanConfig = {
  id: 'postgrad',
  name: 'Postgraduate Loan (PGL)',
  repaymentThreshold: 21000,
  repaymentRate: 0.06,
  writeOffYears: 30,
  description: 'Postgraduate loan repayment threshold £21,000; interest set at RPI + 3%.',
}

export const DEFAULT_RATES: RatesInput = {
  rpi: 0.035, // 3.5% as a neutral default; overwrite with current SFE rates
  baseRate: 0.0525, // BoE base rate 5.25% (late 2024)
  plan2InterestLowerIncome: 27295,
  plan2InterestUpperIncome: 49130,
}

export const MAX_SIMULATION_YEARS = 45

export const monthlyRate = (annualRate: number) => annualRate / 12

export function getAnnualInterestRate(
  plan: PlanId | 'postgrad',
  income: number,
  rates: RatesInput,
  opts?: { inStudy?: boolean }
): number {
  const { rpi, baseRate, plan2InterestLowerIncome, plan2InterestUpperIncome } = rates

  if (plan === 'postgrad') {
    return rpi + 0.03
  }

  if (plan === 'plan1') {
    // SFE: interest is the lower of RPI or (base rate + 1%)
    const capped = baseRate + 0.01
    return Math.min(rpi, capped)
  }

  if (plan === 'plan5') {
    return rpi
  }

  // Plan 2
  if (opts?.inStudy) {
    return rpi + 0.03
  }

  if (income <= plan2InterestLowerIncome) return rpi
  if (income >= plan2InterestUpperIncome) return rpi + 0.03

  const slope =
    (income - plan2InterestLowerIncome) /
    Math.max(1, plan2InterestUpperIncome - plan2InterestLowerIncome)

  return rpi + 0.03 * slope
}
