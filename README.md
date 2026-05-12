# SFE Repayment Simulator

Full-stack Next.js app for modelling Student Finance England (SFE) repayments across undergraduate plans (Plan 1, Plan 2, Plan 5) and the Postgraduate Loan (PGL). Enter loan balances, study period, salaries by tax year, interest assumptions, and lump-sum overpayments to visualise payoff timeframes, total repayments, and interest accrued.

## Features

- **Multi-plan support** — Plan 1 (pre-2012), Plan 2 (2012–2023), Plan 5 (Aug 2023+), and Postgraduate Loan (PGL) modelled simultaneously.
- **Salary timeline** — enter gross salary by tax year (April-basis); the simulator steps through each salary band automatically.
- **Interest modelling** — Plan 1 (min of RPI / base+1%), Plan 2 (RPI→RPI+3% by income), Plan 5 (RPI), PGL (RPI+3%). Study-period interest optionally compounded from course start.
- **Lump-sum payments** — one-off overpayments with auto-targeting (highest-interest first), undergrad-first, or postgrad-first allocation.
- **Write-off tracking** — balances written off at the plan write-off date (25/30/40/30 years); projection stops there.
- **Sensitivity analysis** — automatic ±10% / ±20% salary runs with balance band chart.
- **Take-home calculator** — real-time PAYE + NI + SFE breakdown at any salary; 2024/25 England/Wales bands.
- **Visualisations** — balance chart, cashflow (cumulative repaid vs interest), paycheck waterfall, marginal repayment rate, salary vs years-to-clear scatter, sensitivity band.
- **Lump-sum ROI** — computes interest saved, time saved, and effective annual return vs leaving cash in savings.
- **CSV export** — download yearly principal / interest / balance breakdown.

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Other commands:

```bash
npm run lint        # ESLint check
npm run build       # Production build
npm start           # Serve production build
```

## Calculation Methodology

All simulation is done server-side in `/src/lib/calculate.ts` via the `/api/calculate` POST route.

**Monthly simulation loop:**
1. Start from April after the last course end year (or the later of UG/PG end).
2. Each month: accrue interest (monthly compounding: `annualRate / 12` applied to opening balance), apply any lump sums for that month, then deduct income-based repayments.
3. Repayments = 9% of monthly income above the plan threshold (UG) + 6% above £21,000 (PGL), capped at remaining balance.
4. Stop when both balances reach zero, or when the write-off date is reached (whichever comes first).

**Interest rates:**
- Plan 1: `min(RPI, BoE base rate + 1%)`
- Plan 2: `RPI` at the lower income threshold, rising linearly to `RPI + 3%` at the upper threshold; `RPI + 3%` during study.
- Plan 5: `RPI`
- PGL: `RPI + 3%`

**NI calculation (2024/25 England/Wales):**
- 8% on earnings between £12,570 and £50,270
- 2% on earnings above £50,270

> Note: interest is compounded monthly for simplicity; actual SFE interest is calculated daily. Use this tool for planning guidance and always verify rates/thresholds with official SFE/gov.uk sources.

## Default Assumptions (update to match current SFE guidance)

- **Thresholds:** Plan 1 £22,015; Plan 2 £27,295; Plan 5 £25,000; PGL £21,000.
- **Interest:** Plan 1 = min(RPI, base rate + 1%); Plan 2 = RPI to RPI+3% based on income; Plan 5 = RPI; PGL = RPI+3%.
- **Write-off:** Plan 1 after 25 years; Plan 2 after 30 years; Plan 5 after 40 years; PGL after 30 years (all from the April after course end).
- **PAYE/NI (affordability view):** simplified 2024/25 England/Wales bands (20/40/45% income tax; 8% NI to £50,270 then 2%).

Sources (update values as rates change):
- Gov.uk: [What you pay](https://www.gov.uk/repaying-your-student-loan/what-you-pay)
- Gov.uk: [When your loan is written off](https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled)

## Usage Tips

- **Income timeline:** enter the tax year start (e.g., 2025 covers Apr 2025–Mar 2026). The first row cannot be removed to keep a baseline salary.
- **Lump sums:** dates use `YYYY-MM`; targeting "auto" pays down the higher-interest balance first.
- **Study interest:** toggle on/off if your balances already include accrued study-period interest.
- **Plans:** choose the undergrad plan that matches your start date (Plan 2 for 2012–2023 starters, Plan 5 for Aug 2023+ starters, Plan 1 for pre-2012 England/Wales).

## Notes & Limits

- Model is a planning aid; always confirm rates/thresholds with official SFE guidance.
- Interest is compounded monthly for simplicity; real SFE interest is calculated daily.
- Combined undergrad + PGL repayments are modelled independently (9% + 6% over respective thresholds).
- If balances remain at the write-off date, the remaining amount is marked as written off and interest stops.
