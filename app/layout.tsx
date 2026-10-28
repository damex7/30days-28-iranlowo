import type { Metadata, Viewport } from "next";
import { Alegreya, Source_Sans_3 } from "next/font/google";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ProviderBanner } from "@/components/provider-banner";
import "./globals.css";

// Alegreya: a warm, calligraphic serif for headings (the shop-counter
// feel). Source Sans 3: a calm, very readable body face. Both were checked
// for ₦ and the Yoruba letters ọ ẹ ṣ plus combining tone marks.
const alegreya = Alegreya({ variable: "--font-alegreya", subsets: ["latin", "latin-ext", "vietnamese"], weight: ["500", "700"] });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin", "latin-ext", "vietnamese"] });

export const metadata: Metadata = {
  title: { default: "Ìrànlọ́wọ́ · Ọjà Express support", template: "%s · Ìrànlọ́wọ́" },
  description: "Help for Ọjà Express customers: delivery, returns, payments and your orders, with a person always one tap away.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#111814" },
  ],
  // Lets the chat composer stay above the on-screen keyboard on phones.
  interactiveWidget: "resizes-content",
};

// Runs before first paint: sets data-theme from the saved choice or the
// system setting, so dark-mode users never see a white flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${alegreya.variable} ${sourceSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-card focus:p-3">
          Skip to content
        </a>
        <Suspense fallback={<div className="h-8 bg-iroko-soft" />}>
          <ProviderBanner />
        </Suspense>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-sand px-4 py-6 text-sm text-muted">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2">
            <p>Ọjà Express is a fictional store. Ìrànlọ́wọ́ means &ldquo;help&rdquo; in Yoruba.</p>
            <p>AI answers can be wrong. A person is always available.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
