import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SFE Repayment Simulator — Editorial Edition',
  description:
    'A considered, editorial reading of Student Finance England repayments. Model Plan 1, Plan 2, Plan 5 and Postgraduate Loan repayments across salary curves, interest, and lump sums.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,500&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-serif antialiased">{children}</body>
    </html>
  )
}
