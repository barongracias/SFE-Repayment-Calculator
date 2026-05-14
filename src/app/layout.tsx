import type { Metadata } from 'next'
import { Source_Serif_4, Newsreader, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SFE Repayment Simulator — Editorial Edition',
  description:
    'A considered, editorial reading of Student Finance England repayments. Model Plan 1, Plan 2, Plan 5 and Postgraduate Loan repayments across salary curves, interest, and lump sums.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-serif antialiased">{children}</body>
    </html>
  )
}
