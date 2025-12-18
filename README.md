# SFE Repayment Simulator

Full-stack Next.js app for modelling Student Finance England (SFE) repayments across undergraduate plans (Plan 1, Plan 2, Plan 5) and the Postgraduate Loan (PGL). Enter loan balances, study period, salaries by tax year, interest assumptions, and lump-sum overpayments to visualise payoff timeframes, total repayments, and interest accrued.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Lint: `npm run lint`  
Build: `npm run build && npm start`

## Features

- Inputs: undergrad plan (1/2/5), undergraduate balance, postgraduate balance, UG start/end years plus optional PG start/end, salary timeline (per tax year), optional lump-sum payments.
- Rates: editable RPI, Bank of England base rate, and Plan 2 interest income thresholds; defaults seeded from gov.uk/SFE.
- Simulation: monthly compounding, income-based repayments (9% over plan thresholds; 6% over £21,000 for PGL), optional study-period interest, write-off rules per plan.
- Outputs: balance + cashflow charts (with write-off marker), sensitivity band (salary ±10–20%), take-home calculator (PAYE + NI + SFE), monthly paycheck impact, effective marginal repayment %, salary vs cumulative repaid, salary vs years-to-clear scatter plots, yearly principal vs interest waterfall, repayment heatmap, summary metrics, and lump-sum impact.
- CSV export for yearly breakdown; lump-sum card shows interest saved, time saved, and effective annual return vs leaving the cash in savings.

## Default assumptions (update to match current SFE guidance)

- **Thresholds:** Plan 1 £22,015; Plan 2 £27,295; Plan 5 £25,000; PGL £21,000.  
- **Interest:** Plan 1 = min(RPI, base rate + 1%); Plan 2 = RPI to RPI+3% based on income; Plan 5 = RPI; PGL = RPI+3%. Plan 2 study interest uses RPI+3% by default.  
- **Write-off:** Plan 1 after ~25 years; Plan 2 after 30 years; Plan 5 after 40 years; PGL after 30 years (all from the April after course end).
- **PAYE/NI (affordability view):** simplified 2024/25 England/Wales bands (20/40/45% income tax, 8% NI to £50,270 then 2%). Adjust in code if using Scottish bands or future tax years.

Sources (update values as rates change):
- Gov.uk: [What you pay](https://www.gov.uk/repaying-your-student-loan/what-you-pay)
- Gov.uk: [When your loan is written off](https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled)

## Usage tips

- **Income timeline:** enter the tax year start (e.g., 2025 covers Apr 2025–Mar 2026). The first row cannot be removed to keep a baseline salary.
- **Lump sums:** dates use `YYYY-MM`; targeting “auto” pays down the higher-interest balance first.
- **Study interest:** toggle on/off if your balances already include accrued study-period interest.
- **Plans:** choose the undergrad plan that matches your start date (Plan 2 for 2012–2023 starters, Plan 5 for Aug 2023+ starters, Plan 1 for pre-2012 England/Wales).

## Notes & limits

- Model is a planning aid; always confirm rates/thresholds with official SFE guidance.
- Interest is compounded monthly for simplicity; real SFE interest is calculated daily.
- Combined undergrad + PGL repayments are modelled independently (9% + 6% over respective thresholds).
- If balances remain at the write-off date, the remaining amount is marked as written off and interest stops.
