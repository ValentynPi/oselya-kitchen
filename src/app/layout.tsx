import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { SharedKitchenSync } from "@/components/SharedKitchenSync";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Оселя — сімейний кулінарний помічник",
  description:
    "Спільні рецепти, ШІ-категорії, план меню та список покупок для всієї родини.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className={`${unbounded.variable} ${manrope.variable} antialiased`}>
        <SharedKitchenSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
