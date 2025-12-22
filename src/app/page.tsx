'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Bar, Line, Scatter } from 'react-chartjs-2'
import clsx from 'clsx'
import { DEFAULT_RATES, PLAN_CONFIG, POSTGRAD_PLAN } from '@/lib/plans'
import { LumpSumPayment, PlanId, SalaryStep, SimulationInput, SimulationResult } from '@/lib/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  BarElement,
  Title,
  annotationPlugin
)

const formatGBP = (value: number, maximumFractionDigits = 0) =>
  value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits })

const yearsAndMonths = (months?: number) => {
  if (!months) return '—'
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  if (years === 0) return `${remMonths} mo`
  return `${years}y ${remMonths}mo`
}

const DEFAULT_INCOMES: SalaryStep[] = [
  { year: 2025, salary: 32000 },
  { year: 2027, salary: 40000 },
  { year: 2030, salary: 52000 },
]

const DEFAULT_INPUT: SimulationInput = {
  undergraduatePlan: 'plan2',
  undergraduateLoan: 50000,
  postgraduateLoan: 0,
  undergraduateStartYear: 2020,
  undergraduateEndYear: 2023,
  postgraduateStartYear: undefined,
  postgraduateEndYear: undefined,
  includeStudyInterest: true,
  incomes: DEFAULT_INCOMES,
  lumpSums: [],
  ...DEFAULT_RATES,
}

const DEFAULT_REPAYMENT_YEAR =
  Math.max(
    DEFAULT_INPUT.undergraduateEndYear,
    DEFAULT_INPUT.postgraduateEndYear ?? DEFAULT_INPUT.undergraduateEndYear
  ) + 1

const createDefaultInput = (): SimulationInput => ({
  ...DEFAULT_INPUT,
  incomes: DEFAULT_INCOMES.map((inc) => ({ ...inc })),
  lumpSums: [],
})

const createDefaultExtraLump = () => ({ amount: 2000, date: `${DEFAULT_REPAYMENT_YEAR}-04` })

type TaxBreakdown = {
  incomeTax: number
  nationalInsurance: number
  takeHomePreSfe: number
}

// Simplified 2024/25 England/Wales PAYE + NI assumptions.
const computeTaxes = (annualSalary: number): TaxBreakdown => {
  const personalAllowance = 12570
  const basicRateLimit = 50270
  const higherRateLimit = 125140

  let taxable = Math.max(0, annualSalary - personalAllowance)
  let incomeTax = 0

  if (taxable > 0) {
    const basicBand = Math.min(taxable, basicRateLimit - personalAllowance)
    incomeTax += basicBand * 0.2
    taxable -= basicBand
  }
  if (taxable > 0) {
    const higherBand = Math.min(taxable, higherRateLimit - basicRateLimit)
    incomeTax += higherBand * 0.4
    taxable -= higherBand
  }
  if (taxable > 0) {
    incomeTax += taxable * 0.45
  }

  const niLower = 12570
  const niUpper = 50270
  const niIncome = Math.max(0, annualSalary - niLower)
  const niBasic = Math.min(Math.max(0, niUpper - niLower), niIncome)
  const niAbove = Math.max(0, niIncome - niBasic)
  const nationalInsurance = niBasic * 0.08 + niAbove * 0.02

  const takeHomePreSfe = annualSalary - incomeTax - nationalInsurance

  return { incomeTax, nationalInsurance, takeHomePreSfe }
}

const computeTakeHome = (annualSalary: number, undergraduatePlan: PlanId, includePgl: boolean) => {
  const taxes = computeTaxes(annualSalary)
  const monthlySalary = annualSalary / 12
  const ug = PLAN_CONFIG[undergraduatePlan]
  const ugMonthlyThreshold = ug.repaymentThreshold / 12
  const ugSfe = Math.max(0, monthlySalary - ugMonthlyThreshold) * ug.repaymentRate
  const pgMonthlyThreshold = POSTGRAD_PLAN.repaymentThreshold / 12
  const pgSfe = includePgl ? Math.max(0, monthlySalary - pgMonthlyThreshold) * POSTGRAD_PLAN.repaymentRate : 0
  const sfeMonthly = ugSfe + pgSfe
  const netMonthly = monthlySalary - taxes.incomeTax / 12 - taxes.nationalInsurance / 12 - sfeMonthly
  const sfeRate = monthlySalary > 0 ? (sfeMonthly / monthlySalary) * 100 : 0
  return {
    monthlySalary,
    monthlyTax: taxes.incomeTax / 12,
    monthlyNi: taxes.nationalInsurance / 12,
    sfeMonthly,
    netMonthly,
    sfeRate,
    annualNet: netMonthly * 12,
  }
}

export default function Home() {
  const [input, setInput] = useState<SimulationInput>(createDefaultInput)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [activeView, setActiveView] = useState<'overview' | 'salary' | 'cashflow'>('overview')
  const [sensitivityResults, setSensitivityResults] = useState<Array<{ multiplier: number; result: SimulationResult }>>([])
  const [extraLump, setExtraLump] = useState<{ amount: number; date: string }>(createDefaultExtraLump)
  const [extraLumpResult, setExtraLumpResult] = useState<SimulationResult | null>(null)
  const [salaryCurve, setSalaryCurve] = useState<
    Array<{ multiplier: number; avgSalary: number; totalRepaid: number; clearedInMonths?: number }>
  >([])
  const [takeHomeInput, setTakeHomeInput] = useState<{ salary: number; plan: PlanId; includePgl: boolean }>(() => {
    const base = createDefaultInput()
    return {
      salary: base.incomes[0]?.salary ?? DEFAULT_INCOMES[0].salary,
      plan: base.undergraduatePlan,
      includePgl: base.postgraduateLoan > 0,
    }
  })
  const selectedPlan = PLAN_CONFIG[input.undergraduatePlan]

  const repaymentStartYear = useMemo(
    () => Math.max(input.undergraduateEndYear, input.postgraduateEndYear ?? input.undergraduateEndYear) + 1,
    [input.undergraduateEndYear, input.postgraduateEndYear]
  )

  useEffect(() => {
    // Keep take-home toggle in sync with PGL balance changes.
    setTakeHomeInput((prev) => ({ ...prev, includePgl: prev.includePgl || input.postgraduateLoan > 0 }))
  }, [input.postgraduateLoan])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNumberChange = (field: keyof SimulationInput) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    setInput((prev) => ({ ...prev, [field]: Number.isFinite(value) ? value : 0 }))
  }

  const updateIncome = (index: number, key: keyof SalaryStep, value: number) => {
    setInput((prev) => {
      const incomes = [...prev.incomes]
      incomes[index] = { ...incomes[index], [key]: value }
      return { ...prev, incomes }
    })
  }

  const updateLump = (index: number, key: keyof LumpSumPayment, value: string | number) => {
    setInput((prev) => {
      const lumpSums = [...prev.lumpSums]
      lumpSums[index] = { ...lumpSums[index], [key]: value }
      return { ...prev, lumpSums }
    })
  }

  const runScenario = async (payload: SimulationInput) => {
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to calculate right now.')
    }
    return data as SimulationResult
  }

  const runSimulation = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const baseAvgSalary = input.incomes.reduce((sum, inc) => sum + inc.salary, 0) / Math.max(1, input.incomes.length)

      const baseResult = await runScenario(input)
      setResult(baseResult)
      // Sensitivity runs: +/- 10% and 20% salary paths.
      const multipliers = [0.8, 0.9, 1.1, 1.2]
      const sensitivityPromises = multipliers.map(async (multiplier) => {
        const scaled: SimulationInput = {
          ...input,
          incomes: input.incomes.map((inc) => ({ ...inc, salary: Math.round(inc.salary * multiplier) })),
        }
        const result = await runScenario(scaled)
        return { multiplier, result }
      })
      const sensResults = await Promise.all(sensitivityPromises)
      setSensitivityResults(sensResults)

      // Salary curve (lifetime repaid vs average salary, constant salary paths £10k → £200k).
      const targetSalaries = Array.from({ length: 20 }, (_, idx) => 10000 + idx * 10000)
      const firstIncomeYear = input.incomes[0]?.year ?? new Date().getFullYear()
      const curvePromises = targetSalaries.map(async (targetSalary) => {
        const scaled: SimulationInput = {
          ...input,
          incomes: [{ year: firstIncomeYear, salary: targetSalary }],
        }
        const res = await runScenario(scaled)
        return {
          multiplier: targetSalary / Math.max(1, baseAvgSalary),
          avgSalary: targetSalary,
          totalRepaid: res.summary.totalRepaid,
          clearedInMonths: res.summary.clearedInMonths,
        }
      })
      const curveResults = await Promise.all(curvePromises)
      setSalaryCurve(curveResults.sort((a, b) => a.avgSalary - b.avgSalary))

      // Extra lump scenario.
      if (extraLump.amount > 0 && extraLump.date) {
        const lumpScenario: SimulationInput = {
          ...input,
          lumpSums: [...input.lumpSums, { date: extraLump.date, amount: extraLump.amount, target: 'auto' }],
        }
        const lumpResult = await runScenario(lumpScenario)
        setExtraLumpResult(lumpResult)
      } else {
        setExtraLumpResult(null)
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong while calculating.')
    } finally {
      setIsLoading(false)
    }
  }

  const resetAll = () => {
    const baseInput = createDefaultInput()
    const defaultLump = createDefaultExtraLump()
    const firstSalary = baseInput.incomes[0]?.salary ?? DEFAULT_INCOMES[0].salary

    setInput(baseInput)
    setResult(null)
    setSensitivityResults([])
    setExtraLump(defaultLump)
    setExtraLumpResult(null)
    setSalaryCurve([])
    setTakeHomeInput({
      salary: firstSalary,
      plan: baseInput.undergraduatePlan,
      includePgl: baseInput.postgraduateLoan > 0,
    })
    setActiveView('overview')
    setError(null)
    setIsLoading(false)
  }

  const sampledTimeline = useMemo(() => {
    if (!result?.monthly?.length) return null
    const step = result.monthly.length > 240 ? 3 : 1
    return result.monthly.filter((_, idx) => idx % step === 0 || idx === result.monthly.length - 1)
  }, [result])

  const balanceChart = useMemo(() => {
    if (!sampledTimeline) return null
    const labels = sampledTimeline.map((m) => m.date.slice(0, 7))
    return {
      labels,
      datasets: [
        {
          label: 'Total outstanding',
          data: sampledTimeline.map((m) => m.totalBalance),
          borderColor: '#0f172a',
          backgroundColor: 'rgba(15, 23, 42, 0.1)',
          fill: true,
          tension: 0.25,
        },
        {
          label: 'Undergrad balance',
          data: sampledTimeline.map((m) => m.undergraduateBalance),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: false,
          tension: 0.2,
        },
        {
          label: 'Postgrad balance',
          data: sampledTimeline.map((m) => m.postgraduateBalance),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: false,
          borderDash: [6, 4],
          tension: 0.2,
        },
      ],
    }
  }, [sampledTimeline])

  const cashChart = useMemo(() => {
    if (!sampledTimeline) return null
    const labels = sampledTimeline.map((m) => m.date.slice(0, 7))
    return {
      labels,
      datasets: [
        {
          label: 'Cumulative repaid',
          data: sampledTimeline.map((m) => m.cumulativeRepayments),
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Cumulative interest',
          data: sampledTimeline.map((m) => m.cumulativeInterest),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          fill: true,
          tension: 0.25,
        },
      ],
    }
  }, [sampledTimeline])

  const summary = result?.summary

  const writeOffAnnotation = useMemo(() => {
    if (!summary?.writeOffDate || !sampledTimeline) return undefined
    const label = summary.writeOffDate.slice(0, 7)
    return {
      type: 'line',
      xMin: label,
      xMax: label,
      borderColor: '#7c3aed',
      borderWidth: 1,
      borderDash: [4, 4],
      label: {
        content: 'Write-off horizon',
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        color: '#4c1d95',
        padding: 4,
      },
    }
  }, [summary?.writeOffDate, sampledTimeline])

  const salaryVsRepaid = useMemo(() => {
    if (!result?.monthly?.length) return null
    const timelinePoints: { x: number; y: number }[] = []
    result.monthly.forEach((m, idx) => {
      const x = Number(m.annualSalary) || 0
      const y = Number(m.cumulativeRepayments) || 0
      if (x < 0) return
      if (timelinePoints.length && timelinePoints[timelinePoints.length - 1].x === x) {
        timelinePoints[timelinePoints.length - 1] = { x, y }
      } else if (idx % (result.monthly.length > 240 ? 3 : 1) === 0 || idx === result.monthly.length - 1) {
        timelinePoints.push({ x, y })
      }
    })

    const sweepPoints = salaryCurve.map((p) => ({ x: p.avgSalary, y: p.totalRepaid }))
    const peak =
      sweepPoints.length > 0
        ? sweepPoints.reduce((max, pt) => (pt.y > max.y ? pt : max), sweepPoints[0])
        : null

    const peakAnnotation = peak
      ? {
          type: 'line',
          xMin: peak.x,
          xMax: peak.x,
          borderColor: '#f97316',
          borderWidth: 1.5,
          borderDash: [5, 5],
          label: {
            content: 'Peak repayment zone',
            enabled: true,
            position: 'start',
            backgroundColor: 'rgba(249, 115, 22, 0.12)',
            color: '#9a3412',
            padding: 4,
          },
        }
      : undefined

    const peakPoint = peak ? [{ x: peak.x, y: peak.y }] : []

    return {
      annotation: peakAnnotation,
      datasets: [
        {
          label: 'Current path (cumulative repaid)',
          data: timelinePoints,
          backgroundColor: '#0ea5e9',
          borderColor: '#0ea5e9',
          showLine: true,
          pointRadius: 3,
          parsing: false,
          tension: 0.25,
        },
        {
          label: 'Constant-salary sweep (lifetime repaid)',
          data: sweepPoints,
          backgroundColor: '#f97316',
          borderColor: '#f97316',
          showLine: true,
          pointRadius: 3,
          parsing: false,
          tension: 0.2,
        },
        {
          label: 'Peak total repayment',
          data: peakPoint,
          backgroundColor: '#f97316',
          borderColor: '#f97316',
          showLine: false,
          pointRadius: 6,
          parsing: false,
        },
      ],
    }
  }, [result?.monthly, salaryCurve])

  const salaryVsYears = useMemo(() => {
    if (!salaryCurve.length) return null

    const sweepPoints = salaryCurve
      .map((p) => ({
        x: p.avgSalary,
        y: p.clearedInMonths ? p.clearedInMonths / 12 : null,
      }))
      .filter((p) => p.y !== null) as { x: number; y: number }[]

    const lastSalary = input.incomes[input.incomes.length - 1]?.salary ?? 0
    const baseYears = summary?.clearedInMonths ? summary.clearedInMonths / 12 : null
    const basePoint = baseYears ? [{ x: lastSalary, y: baseYears }] : []

    return {
      datasets: [
        {
          label: 'Constant-salary sweep (years to clear/write-off)',
          data: sweepPoints,
          backgroundColor: '#10b981',
          borderColor: '#10b981',
          showLine: true,
          pointRadius: 3,
          parsing: false,
          tension: 0.2,
        },
        {
          label: 'Current inputs (last salary)',
          data: basePoint,
          backgroundColor: '#f59e0b',
          borderColor: '#f59e0b',
          showLine: false,
          pointRadius: 6,
          parsing: false,
        },
      ],
    }
  }, [salaryCurve, input.incomes, summary?.clearedInMonths])

  const marginalChart = useMemo(() => {
    if (!result?.monthly?.length) return null
    const aggregate = new Map<number, { total: number; count: number }>()
    result.monthly.forEach((m) => {
      const monthlySalary = m.annualSalary / 12
      if (monthlySalary <= 0) return
      const rate = (m.repayment / monthlySalary) * 100
      const bucket = aggregate.get(m.annualSalary) ?? { total: 0, count: 0 }
      aggregate.set(m.annualSalary, { total: bucket.total + rate, count: bucket.count + 1 })
    })
    const data = Array.from(aggregate.entries())
      .map(([salary, bucket]) => ({ salary, rate: bucket.total / Math.max(1, bucket.count) }))
      .sort((a, b) => a.salary - b.salary)
    return {
      datasets: [
        {
          label: 'Effective repayment rate',
          data: data.map((d) => ({ x: d.salary, y: d.rate })),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          tension: 0.25,
          fill: true,
          parsing: false,
          showLine: true,
          pointRadius: 3,
        },
      ],
    }
  }, [result?.monthly])

  const waterfallChart = useMemo(() => {
    if (!result?.yearly?.length) return null
    const labels = result.yearly.map((y) => y.year.toString())
    return {
      labels,
      datasets: [
        {
          label: 'Interest',
          data: result.yearly.map((y) => y.interestAccrued),
          backgroundColor: 'rgba(239, 68, 68, 0.6)',
          stack: 'cash',
        },
        {
          label: 'Principal repaid',
          data: result.yearly.map((y) => Math.max(0, y.repayments - y.interestAccrued)),
          backgroundColor: 'rgba(14, 165, 233, 0.7)',
          stack: 'cash',
        },
      ],
    }
  }, [result?.yearly])

  const paycheckChart = useMemo(() => {
    if (!result?.monthly?.length) return null
    const first = result.monthly[0]
    const annualSalary = first.annualSalary
    if (annualSalary <= 0) return null
    const taxes = computeTaxes(annualSalary)
    const monthlyGross = annualSalary / 12
    const monthlyTax = taxes.incomeTax / 12
    const monthlyNi = taxes.nationalInsurance / 12
    const monthlySfe = first.repayment
    const net = monthlyGross - monthlyTax - monthlyNi - monthlySfe

    return {
      labels: ['Monthly pay'],
      datasets: [
        {
          label: 'Income tax',
          data: [monthlyTax],
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          stack: 'pay',
        },
        {
          label: 'National Insurance',
          data: [monthlyNi],
          backgroundColor: 'rgba(249, 115, 22, 0.7)',
          stack: 'pay',
        },
        {
          label: 'Student loan',
          data: [monthlySfe],
          backgroundColor: 'rgba(37, 99, 235, 0.7)',
          stack: 'pay',
        },
        {
          label: 'Take-home after SFE',
          data: [net],
          backgroundColor: 'rgba(34, 197, 94, 0.75)',
          stack: 'pay',
        },
      ],
    }
  }, [result?.monthly])

  const sensitivityBand = useMemo(() => {
    if (!result?.monthly?.length) return null
    const all = [result, ...sensitivityResults.map((s) => s.result)].filter(Boolean)
    const labels = result.monthly.map((m) => m.date.slice(0, 7))
    const balanceByDate = all.map((res) => {
      const map = new Map<string, number>()
      res.monthly.forEach((m) => map.set(m.date.slice(0, 7), m.totalBalance))
      return map
    })

    const upper: number[] = []
    const lower: number[] = []
    const baseData = result.monthly.map((m) => m.totalBalance)

    labels.forEach((label) => {
      const balances = balanceByDate.map((map) => map.get(label) ?? 0)
      upper.push(Math.max(...balances))
      lower.push(Math.min(...balances))
    })

    return {
      labels,
      datasets: [
        {
          label: 'Upper balance (+20%)',
          data: upper,
          borderColor: 'rgba(239, 68, 68, 0.35)',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          fill: false,
          pointRadius: 0,
        },
        {
          label: 'Lower balance (-20%)',
          data: lower,
          borderColor: 'rgba(34, 197, 94, 0.35)',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          fill: '-1',
          pointRadius: 0,
        },
        {
          label: 'Base balance',
          data: baseData,
          borderColor: '#0f172a',
          backgroundColor: 'rgba(15, 23, 42, 0.08)',
          pointRadius: 0,
          fill: false,
        },
      ],
    }
  }, [result, sensitivityResults])

  const probabilityText = useMemo(() => {
    if (!result) return '—'
    const baseClears = Boolean(result.summary.clearedDate)
    const lowerScenarios = sensitivityResults.filter((s) => s.multiplier < 1)
    const upperScenarios = sensitivityResults.filter((s) => s.multiplier > 1)
    const lowerClear = lowerScenarios.every((s) => Boolean(s.result.summary.clearedDate))
    const upperClear = upperScenarios.every((s) => Boolean(s.result.summary.clearedDate))

    if (baseClears && lowerClear) return 'High (all modelled scenarios clear before write-off)'
    if (baseClears && upperClear) return 'Moderate (clears at baseline; fails only in reduced salary paths)'
    if (baseClears) return 'Guarded (clears only at baseline; lower salaries may rely on write-off)'
    return 'Low (baseline does not clear before write-off)'
  }, [result, sensitivityResults])

  const lumpInsight = useMemo(() => {
    if (!result || !extraLumpResult) return null
    const interestSaved = result.summary.totalInterest - extraLumpResult.summary.totalInterest
    const monthsSaved =
      result.summary.clearedInMonths && extraLumpResult.summary.clearedInMonths
        ? result.summary.clearedInMonths - extraLumpResult.summary.clearedInMonths
        : null
    const horizonYears = (result.summary.clearedInMonths ?? 0) / 12 || 30
    const effectiveAnnualReturn = extraLump.amount > 0 ? (interestSaved / extraLump.amount) / horizonYears : 0
    return { interestSaved, monthsSaved, effectiveAnnualReturn }
  }, [result, extraLumpResult, extraLump.amount])

  const scenarioStory = useMemo(() => {
    if (!summary || !result?.monthly?.length || !result?.yearly?.length) return null

    const peakRepayment = result.monthly.reduce((max, m) => Math.max(max, m.repayment), 0)
    const avgRepayment = result.monthly.reduce((sum, m) => sum + m.repayment, 0) / Math.max(1, result.monthly.length)
    const lastYear = result.yearly[result.yearly.length - 1]?.year
    const headline = summary.clearedDate
      ? `Clears by ${summary.clearedDate} after ${yearsAndMonths(summary.clearedInMonths)} of repayments`
      : `Does not clear before write-off (write-off horizon ${summary.writeOffDate ?? 'N/A'})`

    const bullets = [
      `Total repaid ${formatGBP(summary.totalRepaid, 0)} with ${formatGBP(summary.totalInterest, 0)} interest`,
      summary.clearedDate
        ? `No write-off expected; final payment around ${summary.clearedDate}`
        : `Written off: UG ${formatGBP(summary.writtenOffUndergrad ?? 0)} | PGL ${formatGBP(summary.writtenOffPostgrad ?? 0)}`,
      `Peak monthly repayment about ${formatGBP(peakRepayment, 0)}; average ${formatGBP(avgRepayment, 0)}`,
      `Projection spans tax years up to ${lastYear}`,
    ]

    return { headline, bullets }
  }, [result?.monthly, result?.yearly, summary])

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-[#070d1a] via-[#0a1d34] to-[#0c2d45] text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-10 top-[-80px] h-80 w-80 rounded-full bg-sky-500/25 blur-[120px]" />
        <div className="absolute right-[-40px] top-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-[-120px] left-1/3 h-96 w-96 rounded-full bg-emerald-400/18 blur-[140px]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12">
        <header className="mb-10 flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-[0.28em] text-sky-200">Student Finance England</p>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Repayment Simulator</h1>
            <p className="max-w-4xl text-base text-slate-100/90">
              Model Plan 1 / Plan 2 / Plan 5 undergraduate loans and Postgraduate (PGL) repayments with salary growth and lump sums.
              Assumptions are seeded from official SFE / gov.uk guidance—update the rates as needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://www.gov.uk/repaying-your-student-loan/what-you-pay"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-sky-100 shadow-sm ring-1 ring-white/20 transition hover:bg-white/20"
            >
              Gov.uk: What you pay
            </a>
            <a
              href="https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-sky-100 shadow-sm ring-1 ring-white/20 transition hover:bg-white/20"
            >
              Gov.uk: Write-off rules
            </a>
          </div>
        </header>

        <div className="flex flex-col gap-6 xl:gap-8">
          <section className="rounded-3xl border border-white/20 bg-white/90 p-7 text-slate-900 shadow-xl backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Budget helper</p>
                <h2 className="text-xl font-semibold text-slate-900">Take-home pay calculator</h2>
                <p className="text-sm text-slate-600">Quick view of PAYE + NI + SFE deductions at a given salary.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                Gross annual salary (£)
                <input
                  type="number"
                  min={0}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                  value={takeHomeInput.salary}
                  onChange={(e) => setTakeHomeInput((prev) => ({ ...prev, salary: Number(e.target.value) }))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                Undergraduate plan
                <select
                  value={takeHomeInput.plan}
                  onChange={(e) => setTakeHomeInput((prev) => ({ ...prev, plan: e.target.value as PlanId }))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                >
                  {Object.values(PLAN_CONFIG).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-600"
                  checked={takeHomeInput.includePgl}
                  onChange={(e) => setTakeHomeInput((prev) => ({ ...prev, includePgl: e.target.checked }))}
                />
                Include Postgraduate Loan (6% over £{POSTGRAD_PLAN.repaymentThreshold.toLocaleString()})
              </label>
            </div>
            {(() => {
              const breakdown = computeTakeHome(takeHomeInput.salary, takeHomeInput.plan, takeHomeInput.includePgl)
              return (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  <Stat label="Monthly gross" value={formatGBP(breakdown.monthlySalary)} />
                  <Stat label="SFE deduction" value={formatGBP(breakdown.sfeMonthly, 0)} helper={`${breakdown.sfeRate.toFixed(1)}% of gross`} />
                  <Stat label="Monthly net" value={formatGBP(breakdown.netMonthly)} helper="After tax, NI, SFE" />
                  <Stat label="Annual net" value={formatGBP(breakdown.annualNet, 0)} />
                </div>
              )
            })()}
            <p className="mt-4 text-xs text-slate-500">
              PAYE/NI approximations use 2024/25 England/Wales bands. Scottish or future tax years may differ; adjust code as needed.
            </p>
          </section>

          <section className="rounded-3xl border border-white/20 bg-white/95 p-7 text-slate-900 shadow-xl backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Undergrad &amp; PGL</p>
                <h2 className="text-xl font-semibold text-slate-900">Loan setup</h2>
                <p className="text-sm text-slate-600">Totals at graduation; study interest can be added automatically.</p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Input</span>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                    Undergraduate plan
                    <select
                      value={input.undergraduatePlan}
                      onChange={(e) => {
                        const plan = e.target.value as SimulationInput['undergraduatePlan']
                        setInput((prev) => ({ ...prev, undergraduatePlan: plan }))
                        setTakeHomeInput((prev) => ({ ...prev, plan }))
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                    >
                      {Object.values(PLAN_CONFIG).map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs font-normal text-slate-500">Pick the plan; details update on the right.</p>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                    Undergraduate balance (£)
                    <p className="text-xs font-normal text-slate-500">Balance at graduation before repayments begin.</p>
                    <input
                      type="number"
                      min={0}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={input.undergraduateLoan}
                      onChange={handleNumberChange('undergraduateLoan')}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                    UG start year
                    <p className="text-xs font-normal text-slate-500">First academic year of study (tax year basis).</p>
                    <input
                      type="number"
                      min={2000}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={input.undergraduateStartYear}
                      onChange={handleNumberChange('undergraduateStartYear')}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                    UG end year
                    <p className="text-xs font-normal text-slate-500">Final academic year; repayments start April after.</p>
                    <input
                      type="number"
                      min={input.undergraduateStartYear}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={input.undergraduateEndYear}
                      onChange={handleNumberChange('undergraduateEndYear')}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                    Postgraduate balance (£)
                    <p className="text-xs font-normal text-slate-500">
                      Optional; PGL threshold £{POSTGRAD_PLAN.repaymentThreshold.toLocaleString()}.
                    </p>
                    <input
                      type="number"
                      min={0}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={input.postgraduateLoan}
                      onChange={handleNumberChange('postgraduateLoan')}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                      PG start year (optional)
                      <p className="text-xs font-normal text-slate-500">Fill only if you took a PGL.</p>
                      <input
                        type="number"
                        min={2000}
                        placeholder="e.g. 2024"
                        className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                        value={input.postgraduateStartYear ?? ''}
                        onChange={(e) =>
                          setInput((prev) => ({
                            ...prev,
                            postgraduateStartYear: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                      PG end year (optional)
                      <p className="text-xs font-normal text-slate-500">Repayments start April after this year.</p>
                      <input
                        type="number"
                        min={input.postgraduateStartYear ?? 2000}
                        placeholder="e.g. 2025"
                        className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                        value={input.postgraduateEndYear ?? ''}
                        onChange={(e) =>
                          setInput((prev) => ({
                            ...prev,
                            postgraduateEndYear: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={input.includeStudyInterest}
                    onChange={(e) => setInput((prev) => ({ ...prev, includeStudyInterest: e.target.checked }))}
                  />
                  Add study-period interest (Plan 2 uses RPI + 3%).
                </label>
              </div>

              <div className="space-y-3 lg:col-span-4">
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Undergraduate plan details</p>
                  <p className="mt-2 text-sm text-slate-700">{selectedPlan.description}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-900">
                    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] uppercase text-slate-500">Threshold</p>
                      <p className="text-sm font-semibold">£{selectedPlan.repaymentThreshold.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] uppercase text-slate-500">Write-off</p>
                      <p className="text-sm font-semibold">{selectedPlan.writeOffYears} years</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] uppercase text-slate-500">Repayment rate</p>
                      <p className="text-sm font-semibold">{(selectedPlan.repaymentRate * 100).toFixed(0)}% over threshold</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-[11px] uppercase text-slate-500">Repayment start</p>
                      <p className="text-sm font-semibold">From Apr {repaymentStartYear}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Postgraduate loan</p>
                    <span
                      className={clsx(
                        'rounded-full px-3 py-1 text-[11px] font-semibold',
                        input.postgraduateLoan > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {input.postgraduateLoan > 0 ? 'Included' : 'Optional'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{POSTGRAD_PLAN.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-800">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      Threshold £{POSTGRAD_PLAN.repaymentThreshold.toLocaleString()}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{(POSTGRAD_PLAN.repaymentRate * 100).toFixed(0)}% over threshold</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{POSTGRAD_PLAN.writeOffYears}-year write-off</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-12 gap-6 xl:gap-8">
            <section className="col-span-12 lg:col-span-6 rounded-3xl border border-white/20 bg-white/95 p-7 text-slate-900 shadow-xl backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Assumptions</p>
                  <h2 className="text-xl font-semibold text-slate-900">Rate assumptions</h2>
                  <p className="text-sm text-slate-600">Defaults mirror recent SFE figures—edit to reflect current guidance.</p>
                </div>
                <button
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  onClick={() => setInput((prev) => ({ ...prev, ...DEFAULT_RATES }))}
                >
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  RPI (decimal)
                  <input
                    type="number"
                    step="0.001"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                    value={input.rpi}
                    onChange={handleNumberChange('rpi')}
                  />
                  <span className="text-xs font-normal text-slate-500">Plan 1/5 use RPI; Plan 2 varies up to RPI+3%.</span>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  BoE base rate (decimal)
                  <input
                    type="number"
                    step="0.001"
                    className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                    value={input.baseRate}
                    onChange={handleNumberChange('baseRate')}
                  />
                  <span className="text-xs font-normal text-slate-500">Plan 1 interest is the lower of RPI or base + 1%.</span>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  Plan 2 interest lower income (£)
                  <input
                    type="number"
                    min={0}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                    value={input.plan2InterestLowerIncome}
                    onChange={handleNumberChange('plan2InterestLowerIncome')}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  Plan 2 interest upper income (£)
                  <input
                    type="number"
                    min={input.plan2InterestLowerIncome}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                    value={input.plan2InterestUpperIncome}
                    onChange={handleNumberChange('plan2InterestUpperIncome')}
                  />
                </label>
              </div>
            </section>

            <section className="col-span-12 lg:col-span-6 rounded-3xl border border-white/20 bg-white/95 p-7 text-slate-900 shadow-xl backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Income timeline</p>
                  <h2 className="text-xl font-semibold text-slate-900">Salary by tax year</h2>
                  <p className="text-sm text-slate-600">Applied from April of the given year.</p>
                </div>
                <button
                  className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  onClick={() => {
                    const last = input.incomes[input.incomes.length - 1]
                    setInput((prev) => ({
                      ...prev,
                      incomes: [...prev.incomes, { year: (last?.year ?? new Date().getFullYear()) + 1, salary: last?.salary ?? 30000 }],
                    }))
                  }}
                >
                  + Add year
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {input.incomes.map((row, idx) => (
                  <div key={`${row.year}-${idx}`} className="grid grid-cols-12 gap-3">
                    <input
                      type="number"
                      min={2000}
                      className="col-span-4 rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={row.year}
                      onChange={(e) => updateIncome(idx, 'year', Number(e.target.value))}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-6 rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={row.salary}
                      onChange={(e) => updateIncome(idx, 'salary', Number(e.target.value))}
                    />
                    <button
                      className={clsx(
                        'col-span-2 rounded-xl px-3 py-3 text-xs font-semibold transition',
                        idx === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      )}
                      disabled={idx === 0}
                      onClick={() =>
                        setInput((prev) => ({
                          ...prev,
                          incomes: prev.incomes.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="col-span-12 rounded-3xl border border-white/20 bg-white/95 p-7 text-slate-900 shadow-xl backdrop-blur">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">One-off payments</p>
                  <h2 className="text-xl font-semibold text-slate-900">Lump sum payments</h2>
                  <p className="text-sm text-slate-600">Optional one-off repayments to cut interest.</p>
                </div>
                <button
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  onClick={() =>
                    setInput((prev) => ({
                      ...prev,
                      lumpSums: [...prev.lumpSums, { date: `${repaymentStartYear}-04`, amount: 1000, target: 'auto' }],
                    }))
                  }
                >
                  + Add lump sum
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {input.lumpSums.length === 0 && <p className="text-sm text-slate-600">No lump sums added yet.</p>}
                {input.lumpSums.map((row, idx) => (
                  <div key={`${row.date}-${idx}`} className="grid grid-cols-12 gap-3">
                    <input
                      type="month"
                      className="col-span-4 rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={row.date}
                      onChange={(e) => updateLump(idx, 'date', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-4 rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={row.amount}
                      onChange={(e) => updateLump(idx, 'amount', Number(e.target.value))}
                    />
                    <select
                      className="col-span-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                      value={row.target ?? 'auto'}
                      onChange={(e) => updateLump(idx, 'target', e.target.value)}
                    >
                      <option value="auto">Auto (higher interest first)</option>
                      <option value="undergrad">Undergrad first</option>
                      <option value="postgrad">Postgrad first</option>
                    </select>
                    <button
                      className="col-span-1 rounded-xl bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      onClick={() =>
                        setInput((prev) => ({
                          ...prev,
                          lumpSums: prev.lumpSums.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 rounded-3xl border border-white/20 bg-white/95 p-6 text-slate-900 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Simulation</p>
                <h3 className="text-xl font-semibold text-slate-900">Run the model</h3>
                <p className="text-sm text-slate-600">
                  Repayments start from April {repaymentStartYear}. PGL and undergraduate deductions are calculated independently.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="flex items-center gap-3">
                  <button
                    onClick={runSimulation}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-sky-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLoading ? 'Calculating…' : 'Calculate repayment path'}
                  </button>
                  <button
                    onClick={resetAll}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Reset inputs
                  </button>
                </div>
                <p className="text-xs text-slate-500 sm:text-right">
                  Repayment rates: 9% over thresholds (UG), 6% over £{POSTGRAD_PLAN.repaymentThreshold.toLocaleString()} (PGL).
                </p>
              </div>
            </div>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        </div>

        {result && (
          <section className="mt-10 space-y-8 text-slate-50">
            <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total repaid" value={formatGBP(summary?.totalRepaid ?? 0, 0)} />
              <Stat
                label="Total interest"
                value={formatGBP(summary?.totalInterest ?? 0, 0)}
                helper={summary?.writtenOffUndergrad || summary?.writtenOffPostgrad ? 'Stops once write-off hits' : undefined}
              />
              <Stat
                label="Time to clear"
                value={summary?.clearedDate ? yearsAndMonths(summary?.clearedInMonths) : 'Not cleared before write-off'}
                helper={summary?.clearedDate ? `Clears by ${summary?.clearedDate}` : `Write-off: ${summary?.writeOffDate}`}
              />
              <Stat
                label="Written off"
                value={
                  summary?.writtenOffUndergrad || summary?.writtenOffPostgrad
                    ? formatGBP((summary?.writtenOffUndergrad ?? 0) + (summary?.writtenOffPostgrad ?? 0))
                    : '£0'
                }
                helper={
                  summary?.writtenOffUndergrad || summary?.writtenOffPostgrad
                    ? `UG £${(summary?.writtenOffUndergrad ?? 0).toLocaleString()} | PGL £${(
                        summary?.writtenOffPostgrad ?? 0
                      ).toLocaleString()}`
                    : undefined
                }
              />
            </div>

            {scenarioStory && (
              <div className="rounded-3xl border border-white/25 bg-gradient-to-r from-sky-600/20 via-indigo-600/15 to-emerald-500/15 p-5 shadow-xl backdrop-blur">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-200">Scenario story</p>
                <p className="mt-1 text-lg font-semibold text-white">{scenarioStory.headline}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {scenarioStory.bullets.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm text-slate-100">
                      <span className="mt-[6px] h-2.5 w-2.5 rounded-full bg-sky-200" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium shadow-lg backdrop-blur">
              <button
                className={`rounded-full px-4 py-2 transition ${
                  activeView === 'overview' ? 'bg-white text-slate-900 shadow' : 'text-slate-100 hover:bg-white/10'
                }`}
                onClick={() => setActiveView('overview')}
              >
                Overview
              </button>
              <button
                className={`rounded-full px-4 py-2 transition ${
                  activeView === 'salary' ? 'bg-white text-slate-900 shadow' : 'text-slate-100 hover:bg-white/10'
                }`}
                onClick={() => setActiveView('salary')}
              >
                Salary impact
              </button>
              <button
                className={`rounded-full px-4 py-2 transition ${
                  activeView === 'cashflow' ? 'bg-white text-slate-900 shadow' : 'text-slate-100 hover:bg-white/10'
                }`}
                onClick={() => setActiveView('cashflow')}
              >
                Cashflow & heatmap
              </button>
            </div>

            {activeView === 'overview' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <ChartCard title="Outstanding balances" description="Balances after interest and repayments each month">
                {balanceChart ? (
                  <Line
                    data={balanceChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' },
                        annotation: writeOffAnnotation ? { annotations: { writeOff: writeOffAnnotation } } : undefined,
                      },
                      scales: {
                        y: {
                          ticks: { callback: (value) => `£${Number(value).toLocaleString()}` },
                        },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Run the model to see charts.</p>
                )}
              </ChartCard>

              <ChartCard title="Cash out vs interest" description="Cumulative repayments vs interest accrued">
                {cashChart ? (
                  <Line
                    data={cashChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' },
                        annotation: writeOffAnnotation ? { annotations: { writeOff: writeOffAnnotation } } : undefined,
                      },
                      scales: {
                        y: { ticks: { callback: (value) => `£${Number(value).toLocaleString()}` } },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Run the model to see charts.</p>
                )}
              </ChartCard>
              </div>
            )}

            {activeView === 'salary' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <ChartCard
                  title="Monthly paycheck impact"
                  description="Approximate PAYE + NI + SFE deductions vs take-home (England/Wales 2024/25 bands)"
                >
                  {paycheckChart ? (
                    <Bar
                      data={paycheckChart}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } },
                        scales: {
                          x: { stacked: true },
                          y: { stacked: true, ticks: { callback: (v) => `£${Number(v).toLocaleString()}` } },
                        },
                      }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">Run the model with a salary to see deductions.</p>
                  )}
                </ChartCard>
                <ChartCard title="Effective marginal rate" description="Repayment % of salary at different income levels (9% + 6% where applicable)">
                  {marginalChart ? (
                    <Line
                      data={marginalChart}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { type: 'linear', title: { display: true, text: '% of salary' }, ticks: { callback: (v) => `${v}%` }, beginAtZero: true },
                          x: {
                            type: 'linear',
                            title: { display: true, text: 'Annual salary (£)' },
                            min: 10000,
                            max: 200000,
                          },
                        },
                      }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">Run the model to see marginal rates.</p>
                  )}
                </ChartCard>
              </div>
            )}

            {activeView === 'overview' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <ChartCard
                title="Sensitivity band"
                description="Balances with salary paths at -20%, -10%, base, +10%, +20% (shaded band shows downside/upside)"
              >
                {sensitivityBand ? (
                  <Line
                    data={sensitivityBand}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' },
                        annotation: writeOffAnnotation ? { annotations: { writeOff: writeOffAnnotation } } : undefined,
                      },
                      scales: {
                        y: { ticks: { callback: (value) => `£${Number(value).toLocaleString()}` } },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Run the model to see sensitivity.</p>
                )}
              </ChartCard>
              </div>
            )}

            {activeView === 'salary' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <ChartCard title="Salary vs total repaid" description="Scatter of annual salary against cumulative repayments to date">
                  {salaryVsRepaid ? (
                    <Scatter
                      data={salaryVsRepaid}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const x = ctx.parsed.x ?? 0
                              const y = ctx.parsed.y ?? 0
                              return `£${x.toLocaleString()} salary → repaid ${formatGBP(y)}`
                            },
                          },
                        },
                      },
                      scales: {
                        x: { type: 'linear', title: { display: true, text: 'Annual salary (£)' }, min: 10000, max: 200000 },
                        y: { type: 'linear', title: { display: true, text: 'Cumulative repaid (£)' }, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Run the model to see charts.</p>
                )}
              </ChartCard>

              <ChartCard
                title="Salary vs years to repayment"
                description="How remaining years to clear/write-off changes with salary levels over time"
              >
                  {salaryVsYears ? (
                    <Scatter
                      data={salaryVsYears}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const x = ctx.parsed.x ?? 0
                              const y = ctx.parsed.y ?? 0
                              return `£${x.toLocaleString()} salary → ${y.toFixed(1)} years remaining`
                            },
                          },
                        },
                      },
                      scales: {
                        x: { type: 'linear', title: { display: true, text: 'Annual salary (£)' }, min: 10000, max: 200000 },
                        y: { type: 'linear', title: { display: true, text: 'Years until cleared/write-off' }, suggestedMin: 0, beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Run the model to see charts.</p>
                )}
              </ChartCard>
              </div>
            )}


            {activeView === 'cashflow' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  <ChartCard
                    title="Principal vs interest (yearly)"
                    description="Stacked view of yearly interest vs principal repaid after interest charges"
                  >
                    {waterfallChart ? (
                      <Bar
                        data={waterfallChart}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'top' } },
                          scales: {
                            x: { stacked: true },
                            y: { stacked: true, ticks: { callback: (v) => `£${Number(v).toLocaleString()}` } },
                          },
                        }}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">Run the model to see the waterfall.</p>
                    )}
                  </ChartCard>

                  <div className="h-[420px] rounded-3xl border border-white/30 bg-white/95 p-5 text-slate-900 shadow-xl backdrop-blur">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Write-off likelihood</p>
                        <p className="text-xs text-slate-600">Heuristic based on salary sensitivity runs</p>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm text-slate-700">
                      <p className="text-base font-semibold text-slate-900">{probabilityText}</p>
                      <p>
                        We simulate salaries at -20%, -10%, +10%, +20%. If all paths clear before write-off, likelihood is high; if only baseline
                        clears, it is guarded; if baseline fails, it is low.
                      </p>
                      <p className="text-xs text-slate-500">
                        Not financial advice—update rates/thresholds with official SFE guidance to refine this heuristic.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  <div className="rounded-3xl border border-white/30 bg-white/95 p-5 text-slate-900 shadow-xl backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Break-even lump sum</p>
                        <p className="text-xs text-slate-600">Model an extra one-off payment to see time/interest saved</p>
                      </div>
                      <button
                        className="text-xs font-semibold text-sky-700 underline"
                        onClick={() => setExtraLump({ amount: 2000, date: `${repaymentStartYear}-04` })}
                      >
                        Reset
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        Lump sum amount (£)
                        <input
                          type="number"
                          min={0}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                          value={extraLump.amount}
                          onChange={(e) => setExtraLump((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        Lump sum date
                        <input
                          type="month"
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                          value={extraLump.date}
                          onChange={(e) => setExtraLump((prev) => ({ ...prev, date: e.target.value }))}
                        />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Included in the next calculation run.</p>
                    {lumpInsight && (
                      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        <p>
                          Interest saved: <span className="font-semibold">{formatGBP(lumpInsight.interestSaved)}</span>
                        </p>
                        <p>
                          Time saved:{' '}
                          <span className="font-semibold">
                            {lumpInsight.monthsSaved ? yearsAndMonths(lumpInsight.monthsSaved) : 'No change to clearance date'}
                          </span>
                        </p>
                        <p>
                          Effective annual return vs savings:{' '}
                          <span className="font-semibold">{`${(lumpInsight.effectiveAnnualReturn * 100).toFixed(1)}%`}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Repayment ordering uses higher-interest balance first when target = auto.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-white/30 bg-white/95 text-slate-900 shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Yearly breakdown</h3>
                      <p className="text-sm text-slate-600">Opening balance each April, total interest and repayments per tax year.</p>
                    </div>
                    <p className="text-xs text-slate-500">Repayment start: Apr {repaymentStartYear}</p>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-600">
                    <p>Export yearly cashflow to CSV for budgeting spreadsheets.</p>
                    <button
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                      onClick={() => {
                        if (!result?.yearly?.length) return
                        const headers = ['year', 'opening_balance', 'interest', 'repaid', 'closing_balance']
                        const rows = result.yearly.map((y) =>
                          [y.year, y.openingBalance, y.interestAccrued, y.repayments, y.closingBalance].join(',')
                        )
                        const csv = [headers.join(','), ...rows].join('\n')
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement('a')
                        link.href = url
                        link.setAttribute('download', 'sfe-repayment-yearly.csv')
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        URL.revokeObjectURL(url)
                      }}
                    >
                      Download CSV
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto text-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-2 font-semibold text-slate-700">Tax year (start)</th>
                          <th className="px-4 py-2 font-semibold text-slate-700">Opening balance</th>
                          <th className="px-4 py-2 font-semibold text-slate-700">Interest</th>
                          <th className="px-4 py-2 font-semibold text-slate-700">Repaid</th>
                          <th className="px-4 py-2 font-semibold text-slate-700">Closing balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.yearly.map((row) => (
                          <tr key={row.year} className="hover:bg-slate-50/70">
                            <td className="px-4 py-2 text-slate-800">{row.year}</td>
                            <td className="px-4 py-2 text-slate-800">{formatGBP(row.openingBalance)}</td>
                            <td className="px-4 py-2 text-slate-800">{formatGBP(row.interestAccrued)}</td>
                            <td className="px-4 py-2 text-slate-800">{formatGBP(row.repayments)}</td>
                            <td className="px-4 py-2 text-slate-800">{formatGBP(row.closingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="mt-10 rounded-3xl border border-white/30 bg-white/95 px-5 py-6 text-sm text-slate-700 shadow-xl backdrop-blur">
          <p className="text-base font-semibold text-slate-900">Assumptions & sources</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              Thresholds: Plan 1 £22,015; Plan 2 £27,295; Plan 5 £25,000; PGL £{POSTGRAD_PLAN.repaymentThreshold.toLocaleString()} (Gov.uk).
            </li>
            <li>Interest: Plan 1 lower of RPI or base + 1%; Plan 2 RPI → RPI+3% by income; Plan 5 RPI; PGL RPI+3%.</li>
            <li>Repayments start April after the end year; 9% over thresholds for undergraduate plans and 6% for PGL.</li>
            <li>Update RPI/base-rate values from the official SFE/GOV.UK pages for the most accurate projections.</li>
          </ul>
        </footer>
      </div>
    </main>
  )
}

function Stat({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-white/30 bg-white/90 px-5 py-4 text-slate-900 shadow-lg backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      {helper && <p className="text-xs text-slate-500">{helper}</p>}
    </div>
  )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="h-[420px] rounded-3xl border border-white/30 bg-white/95 p-5 text-slate-900 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{description}</p>
        </div>
      </div>
      <div className="h-[340px]">{children}</div>
    </div>
  )
}
