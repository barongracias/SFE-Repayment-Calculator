export type PlanId = 'plan1' | 'plan2' | 'plan5'

export interface SalaryStep {
  /**
   * Tax year starting in April of this calendar year.
   * Example: 2025 applies from Apr 2025 to Mar 2026.
   */
  year: number
  /** Gross annual salary in GBP */
  salary: number
}

export interface LumpSumPayment {
  /** ISO-like month string: YYYY-MM */
  date: string
  /** Payment amount in GBP */
  amount: number
  /** Which balance to target; auto defaults to highest-interest first */
  target?: 'auto' | 'undergrad' | 'postgrad'
}

export interface RatesInput {
  /** Retail Price Index (RPI) as a decimal e.g. 0.035 = 3.5% */
  rpi: number
  /** Bank of England base rate as a decimal e.g. 0.0525 = 5.25% */
  baseRate: number
  /** Income where Plan 2 interest starts rising above RPI */
  plan2InterestLowerIncome: number
  /** Income where Plan 2 interest tops out at RPI + 3% */
  plan2InterestUpperIncome: number
}

export interface SimulationInput extends RatesInput {
  undergraduateLoan: number
  undergraduatePlan: PlanId
  postgraduateLoan: number
  undergraduateStartYear: number
  undergraduateEndYear: number
  postgraduateStartYear?: number
  postgraduateEndYear?: number
  includeStudyInterest: boolean
  incomes: SalaryStep[]
  lumpSums: LumpSumPayment[]
}

export interface PlanConfig {
  id: PlanId | 'postgrad'
  name: string
  repaymentThreshold: number
  repaymentRate: number // e.g. 0.09 for 9%
  writeOffYears: number
  description: string
}

export interface MonthlySnapshot {
  date: string // YYYY-MM-01
  totalBalance: number
  undergraduateBalance: number
  postgraduateBalance: number
  interestAccrued: number
  repayment: number
  cumulativeRepayments: number
  cumulativeInterest: number
  annualSalary: number
}

export interface YearlySummary {
  year: number
  openingBalance: number
  interestAccrued: number
  repayments: number
  closingBalance: number
}

export interface SimulationSummary {
  totalRepaid: number
  totalInterest: number
  clearedInMonths?: number
  clearedDate?: string
  writeOffDate?: string
  writtenOffUndergrad?: number
  writtenOffPostgrad?: number
}

export interface SimulationResult {
  monthly: MonthlySnapshot[]
  yearly: YearlySummary[]
  summary: SimulationSummary
  inputEcho: SimulationInput
}
