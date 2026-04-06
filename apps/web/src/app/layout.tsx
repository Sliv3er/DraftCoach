import type { Metadata } from "next";
import "./globals.css";
import SearchInput from "@/components/SearchInput";
import Link from "next/link";
import { Inter, Space_Grotesk } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: "DraftCoach | The Kinetic Archive",
  description: "League of Legends Draft & Gameplay Coach. Statistical analysis reinvented.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-surface min-h-screen flex flex-col font-body text-slate-200">
        {/* Global Hextech Navigation */}
        <header className="bg-hextech-blue border-b border-white/5 sticky top-0 z-50 shadow-hextech-ambient">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            {/* Branding - The "Archive" Logo */}
            <Link href="/" className="flex items-center space-x-3 no-underline group">
              <div className="w-9 h-9 bg-hextech-gold rounded-sm flex items-center justify-center font-bold text-hextech-blue transition-transform group-hover:scale-105">
                <span className="font-display text-lg">D</span>
              </div>
              <div className="flex flex-col -space-y-1">
                <span className="text-lg font-display font-bold text-white tracking-widest uppercase">
                  Draft<span className="text-hextech-gold">Coach</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-hextech-gold/40 font-bold">The Archive</span>
              </div>
            </Link>

            {/* Global Search - Compact Nav Variant */}
            <div className="hidden lg:block">
              <SearchInput variant="nav" />
            </div>

            {/* Support/Links */}
            <nav className="flex items-center space-x-6">
              <Link href="/champions" className="text-xs uppercase tracking-widest font-bold text-slate-400 hover:text-hextech-gold transition-colors">Champions</Link>
              <Link href="/leaderboards" className="text-xs uppercase tracking-widest font-bold text-slate-400 hover:text-hextech-gold transition-colors">Leaderboards</Link>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full">
          {children}
        </main>

        <footer className="bg-hextech-blue-lighter/20 py-12 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-6 text-center">
             <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-hextech-gold/30">Built for the Elite. Powered by Riot Games.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
