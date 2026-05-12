# SFE Repayment Simulator

A Next.js + TypeScript + Tailwind CSS calculator for modelling UK Student Finance England repayments across all undergraduate plans and the Postgraduate Loan. Enter your loan balance, salary timeline, interest assumptions, and optional lump-sum overpayments to visualise your payoff path, total repayments, and accrued interest.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

No environment variables are required. The app runs entirely locally.

Other commands:

```bash
npm run build   # Production build
npm start       # Serve production build
npm run lint    # ESLint
```

## Supported plans

| Plan | Who it covers | Threshold | Rate | Write-off |
|------|--------------|-----------|------|-----------|
| **Plan 1** | Pre-2012 undergrads (England/Wales) | £22,015 | 9% above threshold | 25 years |
| **Plan 2** | 2012–2023 undergrads | £27,295 | 9% above threshold | 30 years |
| **Plan 5** | Aug 2023+ undergrads | £25,000 | 9% above threshold | 40 years |
| **Postgraduate (PGL)** | Masters/PhD loans | £21,000 | 6% above threshold | 30 years |

Undergraduate and postgraduate loans are modelled independently and deducted simultaneously from your salary each month.

## Features

- **Salary timeline** — enter gross salary by tax year (April-basis); simulation steps through each band automatically.
- **Interest modelling** — Plan 1 (`min(RPI, base+1%)`), Plan 2 (RPI→RPI+3% income taper), Plan 5 (RPI), PGL (RPI+3%). Study-period interest optionally compounded from course start.
- **Lump-sum payments** — one-off overpayments with auto-targeting (highest-interest first), undergrad-first, or postgrad-first allocation.
- **Write-off tracking** — balances written off at the plan write-off horizon; projection stops at the relevant date.
- **Sensitivity analysis** — automatic ±10% / ±20% salary runs with balance band chart.
- **Take-home calculator** — real-time PAYE + NI + SFE breakdown at any salary (2024/25 England/Wales bands).
- **Charts** — balance over time, cumulative cash vs interest, paycheck waterfall, marginal repayment rate, salary vs years-to-clear scatter, sensitivity band.
- **Lump-sum ROI** — computes interest saved, time saved, and effective annual return.
- **CSV export** — download yearly principal / interest / balance breakdown.

## How it works

All simulation runs server-side in `/src/lib/calculate.ts` via the `/api/calculate` POST route.

**Monthly loop:**
1. Start from April after the last course end year.
2. Each month: accrue interest (monthly compounding), apply any scheduled lump sums, then deduct income-based repayments.
3. Repayments = 9% of income above the UG threshold + 6% above £21,000 (PGL), capped at remaining balance.
4. Stop when both balances reach zero, or when the write-off date is reached.

**Interest rates:**
- Plan 1: `min(RPI, BoE base rate + 1%)`
- Plan 2: `RPI` at lower income threshold → `RPI + 3%` at upper threshold (linear taper); `RPI + 3%` during study
- Plan 5: `RPI`
- PGL: `RPI + 3%`

## Default assumptions

Defaults are seeded from official SFE / gov.uk guidance — update them in the UI as rates change:

- **RPI:** 3.5% (neutral planning default)
- **BoE base rate:** 5.25% (late 2024)
- **Plan 2 income taper:** £27,295–£49,130

> Interest is compounded monthly for simplicity; actual SFE interest is calculated daily. Use this tool for planning guidance and always verify rates and thresholds with official [gov.uk](https://www.gov.uk/repaying-your-student-loan) sources.
