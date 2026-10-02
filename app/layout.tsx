import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Footer } from "@/components/footer";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Ten Percent", template: "%s · Ten Percent" },
  description: "Run a Hollywood talent agency. Real actors, fictional films.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable} flex min-h-screen flex-col bg-paper font-sans text-ink antialiased`}>
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
