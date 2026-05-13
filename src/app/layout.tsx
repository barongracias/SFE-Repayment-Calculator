import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SFE Repayment Simulator',
  description:
    'Model Student Finance England Plan 1, Plan 2, Plan 5 and Postgraduate Loan repayments with salary growth, interest rates and lump sum inputs.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-[#0a0a0f]">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
