import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TextureForge — photo → 4K UE5 PBR",
  description: "Upload a photo, get a 4K Unreal-Engine-ready PBR texture set. Powered by fal.ai PATINA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] font-sans antialiased">
        {/* ambient mesh blob */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div
            className="absolute left-1/2 top-[-12%] h-[55vh] w-[70vw] -translate-x-1/2 animate-drift rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle at center, rgba(224,135,91,0.18), rgba(199,91,57,0.06) 45%, transparent 70%)",
            }}
          />
        </div>

        {/* floating glass pill nav */}
        <header className="sticky top-0 z-40">
          <nav className="mx-auto mt-6 flex w-max items-center gap-1 rounded-full bg-forge-panel/70 p-1.5 shadow-softer ring-1 ring-black/[0.06] backdrop-blur-2xl">
            <Link href="/" className="flex items-center gap-2 rounded-full px-3 py-1.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-forge-text text-[11px] font-black text-forge-bg">
                T
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Texture<span className="text-forge-accent">Forge</span>
              </span>
            </Link>
            <Link
              href="/"
              className="rounded-full px-3.5 py-1.5 text-sm text-forge-muted transition-colors hover:bg-black/[0.04] hover:text-forge-text"
            >
              Studio
            </Link>
            <Link
              href="/settings"
              className="rounded-full px-3.5 py-1.5 text-sm text-forge-muted transition-colors hover:bg-black/[0.04] hover:text-forge-text"
            >
              Settings
            </Link>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>

        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4">
          <div className="border-t border-black/[0.06] pt-6 font-mono text-[11px] uppercase tracking-[0.15em] text-forge-muted">
            TextureForge — photo → 4K UE5 PBR — powered by PATINA
          </div>
        </footer>
      </body>
    </html>
  );
}
