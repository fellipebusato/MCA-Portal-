import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FB Client Portal',
  description: 'Private client portal operated by Fellipe Busato',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "'DM Sans', sans-serif", WebkitFontSmoothing: 'antialiased' }}>
        {children}
      </body>
    </html>
  );
}