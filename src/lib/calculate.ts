import { PLAN_CONFIG, POSTGRAD_PLAN, getAnnualInterestRate, monthlyRate, MAX_SIMULATION_YEARS } from './plans'
import {
  LumpSumPayment,
  MonthlySnapshot,
  PlanConfig,
  PlanId,
  RatesInput,
  SalaryStep,
  SimulationInput,
  SimulationResult,
  SimulationSummary,
  YearlySummary,
} from './types'

const clampCurrency = (value: number) => (Number.isFinite(value) ? Math.max(0, Number(value)) : 0)

const cloneDate = (date: Date) => new Date(date.getTime())

const addMonths = (date: Date, months: number) => {
  const d = cloneDate(date)
  d.setMonth(d.getMonth() + months)
  d.setDate(1)
  return d
}

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`

const taxYearStart = (year: number) => new Date(year, 3, 1) // April 1st

const sortIncomes = (incomes: SalaryStep[]) => [...incomes].sort((a, b) => a.year - b.year)

const getSalaryForDate = (date: Date, incomes: SalaryStep[]): number => {
  if (!incomes.length) return 0
  const sorted = sortIncomes(incomes)
  let current = sorted[0].salary

  for (const step of sorted) {
    const start = taxYearStart(step.year)
    if (date >= start) {
      current = step.salary
    } else {
      break
    }
  }

  return current
}

const accrualMonths = (from: Date, to: Date) => {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, months)
}

const applyStudyInterest = (amount: number, plan: PlanId | 'postgrad', rates: RatesInput, months: number) => {
  let balance = clampCurrency(amount)
  if (balance <= 0 || months <= 0) return balance

  const annualRate = getAnnualInterestRate(plan, 0, rates, { inStudy: true })
  const monthly = monthlyRate(annualRate)

  for (let i = 0; i < months; i += 1) {
    balance += balance * monthly
  }

  return balance
}

const applyLumpToBalances = (
  lump: LumpSumPayment,
  balances: { undergrad: number; postgrad: number },
  rates: RatesInput,
  income: number,
  plan: PlanId
) => {
  let remaining = clampCurrency(lump.amount)
  if (remaining <= 0) return balances

  const ugRate = getAnnualInterestRate(plan, income, rates)
  const pgRate = getAnnualInterestRate('postgrad', income, rates)

  const payUndergrad = (amt: number) => {
    const payment = Math.min(amt, balances.undergrad)
    balances.undergrad = clampCurrency(balances.undergrad - payment)
    remaining -= payment
  }

  const payPostgrad = (amt: number) => {
    const payment = Math.min(amt, balances.postgrad)
    balances.postgrad = clampCurrency(balances.postgrad - payment)
    remaining -= payment
  }

  const target = lump.target ?? 'auto'

  if (target === 'undergrad') {
    payUndergrad(remaining)
  } else if (target === 'postgrad') {
    payPostgrad(remaining)
  } else {
    // Target the balance with the higher rate, then spill over.
    const undergradFirst = ugRate >= pgRate
    if (undergradFirst) {
      payUndergrad(remaining)
      if (remaining > 0) payPostgrad(remaining)
    } else {
      payPostgrad(remaining)
      if (remaining > 0) payUndergrad(remaining)
    }
  }

  return balances
}

const groupYearly = (monthly: MonthlySnapshot[], initialBalance: number): YearlySummary[] => {
  if (!monthly.length) return []

  const byYear = new Map<number, YearlySummary>()
  let openingBalance = initialBalance

  monthly.forEach((entry, idx) => {
    const year = new Date(entry.date).getFullYear()
    const bucket = byYear.get(year)

    if (!bucket) {
      byYear.set(year, {
        year,
        openingBalance,
        interestAccrued: entry.interestAccrued,
        repayments: entry.repayment,
        closingBalance: entry.totalBalance,
      })
    } else {
      bucket.interestAccrued += entry.interestAccrued
      bucket.repayments += entry.repayment
      bucket.closingBalance = entry.totalBalance
    }

    // When the year changes on next loop, opening = previous closing.
    const nextEntry = monthly[idx + 1]
    if (nextEntry && new Date(nextEntry.date).getFullYear() !== year) {
      openingBalance = entry.totalBalance
    }
  })

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year)
}

export function simulateRepayments(input: SimulationInput): SimulationResult {
  const {
    undergraduatePlan,
    undergraduateLoan,
    postgraduateLoan,
    undergraduateStartYear,
    undergraduateEndYear,
    postgraduateStartYear,
    postgraduateEndYear,
    includeStudyInterest,
    incomes,
    lumpSums,
    rpi,
    baseRate,
    plan2InterestLowerIncome,
    plan2InterestUpperIncome,
  } = input

  const rates: RatesInput = { rpi, baseRate, plan2InterestLowerIncome, plan2InterestUpperIncome }

  const ugStart = new Date(undergraduateStartYear, 8, 1)
  const ugEnd = new Date(undergraduateEndYear + 1, 3, 1) // April after UG end
  const pgStart = postgraduateStartYear ? new Date(postgraduateStartYear, 8, 1) : null
  const pgEnd = postgraduateEndYear ? new Date(postgraduateEndYear + 1, 3, 1) : null
  const repaymentStart = pgEnd ? (pgEnd > ugEnd ? pgEnd : ugEnd) : ugEnd // repayments begin after the latest course end

  const ugStudyMonths = includeStudyInterest ? accrualMonths(ugStart, repaymentStart) : 0
  const pgStudyMonths =
    includeStudyInterest && pgStart && postgraduateLoan > 0 ? accrualMonths(pgStart, repaymentStart) : 0

  let undergraduateBalance = includeStudyInterest
    ? applyStudyInterest(undergraduateLoan, undergraduatePlan, rates, ugStudyMonths)
    : clampCurrency(undergraduateLoan)

  let postgraduateBalance = includeStudyInterest
    ? applyStudyInterest(postgraduateLoan, 'postgrad', rates, pgStudyMonths)
    : clampCurrency(postgraduateLoan)

  const initialBalance = undergraduateBalance + postgraduateBalance

  const undergradPlan = PLAN_CONFIG[undergraduatePlan]
  const writeOffUndergradDate = addMonths(repaymentStart, undergradPlan.writeOffYears * 12)
  const writeOffPostgradDate = addMonths(repaymentStart, POSTGRAD_PLAN.writeOffYears * 12)

  const lumpByMonth = new Map<string, LumpSumPayment[]>()
  lumpSums.forEach((lump) => {
    if (!lump.date) return
    const key = `${lump.date}-01`
    const existing = lumpByMonth.get(key) ?? []
    existing.push(lump)
    lumpByMonth.set(key, existing)
  })

  const monthly: MonthlySnapshot[] = []
  let cumulativeInterest = 0
  let cumulativeRepayments = 0
  let clearedAtMonth: number | undefined
  let clearedDate: string | undefined
  let writtenOffUndergrad = 0
  let writtenOffPostgrad = 0

  const maxMonths = MAX_SIMULATION_YEARS * 12

  for (let monthIdx = 0; monthIdx < maxMonths; monthIdx += 1) {
    const currentDate = addMonths(repaymentStart, monthIdx)

    // Stop if both balances cleared and no further lumps scheduled.
    if (undergraduateBalance <= 0 && postgraduateBalance <= 0) break

    let writeOffTriggered = false

    // Apply write-off if date reached.
    if (currentDate >= writeOffUndergradDate && undergraduateBalance > 0) {
      writtenOffUndergrad += undergraduateBalance
      undergraduateBalance = 0
      writeOffTriggered = true
    }

    if (currentDate >= writeOffPostgradDate && postgraduateBalance > 0) {
      writtenOffPostgrad += postgraduateBalance
      postgraduateBalance = 0
      writeOffTriggered = true
    }

    const annualSalary = getSalaryForDate(currentDate, incomes)
    const monthlySalary = annualSalary / 12

    // Interest accrues before repayment each month.
    const ugInterest =
      undergraduateBalance > 0
        ? undergraduateBalance * monthlyRate(getAnnualInterestRate(undergraduatePlan, annualSalary, rates))
        : 0

    const pgInterest =
      postgraduateBalance > 0 ? postgraduateBalance * monthlyRate(getAnnualInterestRate('postgrad', annualSalary, rates)) : 0

    undergraduateBalance += ugInterest
    postgraduateBalance += pgInterest
    cumulativeInterest += ugInterest + pgInterest

    // Apply lump sums scheduled for this month.
    const lumps = lumpByMonth.get(dateKey(currentDate)) ?? []
    if (lumps.length) {
      lumps.forEach((lump) => {
        const balances = applyLumpToBalances(lump, { undergrad: undergraduateBalance, postgrad: postgraduateBalance }, rates, annualSalary, undergraduatePlan)
        undergraduateBalance = balances.undergrad
        postgraduateBalance = balances.postgrad
      })
    }

    // Standard repayments.
    const ugPayRaw =
      undergraduateBalance > 0
        ? Math.max(0, monthlySalary - undergradPlan.repaymentThreshold / 12) * undergradPlan.repaymentRate
        : 0

    const pgPayRaw =
      postgraduateBalance > 0
        ? Math.max(0, monthlySalary - POSTGRAD_PLAN.repaymentThreshold / 12) * POSTGRAD_PLAN.repaymentRate
        : 0

    const ugPay = Math.min(ugPayRaw, undergraduateBalance)
    const pgPay = Math.min(pgPayRaw, postgraduateBalance)

    undergraduateBalance = clampCurrency(undergraduateBalance - ugPay)
    postgraduateBalance = clampCurrency(postgraduateBalance - pgPay)

    const repayment = ugPay + pgPay
    cumulativeRepayments += repayment

    const totalBalance = undergraduateBalance + postgraduateBalance

    monthly.push({
      date: dateKey(currentDate),
      totalBalance,
      undergraduateBalance,
      postgraduateBalance,
      interestAccrued: ugInterest + pgInterest,
      repayment,
      cumulativeRepayments,
      cumulativeInterest,
      annualSalary,
    })

    if (totalBalance <= 0 && clearedAtMonth === undefined) {
      const monthsElapsed = writeOffTriggered ? monthIdx : monthIdx + 1
      clearedAtMonth = monthsElapsed
      clearedDate = dateKey(currentDate)
      break
    }

    // Stop when we have reached both write-off dates.
    if (currentDate >= writeOffUndergradDate && currentDate >= writeOffPostgradDate) {
      break
    }
  }

  const summary: SimulationSummary = {
    totalRepaid: cumulativeRepayments,
    totalInterest: cumulativeInterest,
    clearedInMonths: clearedAtMonth,
    clearedDate,
    writeOffDate: dateKey(writeOffUndergradDate > writeOffPostgradDate ? writeOffUndergradDate : writeOffPostgradDate),
    writtenOffUndergrad: writtenOffUndergrad || undefined,
    writtenOffPostgrad: writtenOffPostgrad || undefined,
  }

  const yearly = groupYearly(monthly, initialBalance)

  return { monthly, yearly, summary, inputEcho: input }
}
