import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Logs Visualization Tool',
  description: 'Transform text logs into visual tables with real-time parsing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}