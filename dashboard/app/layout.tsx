import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monox | Personal Finance Bot",
  description: "Your AI-powered personal finance dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg min-h-screen">
        {children}
      </body>
    </html>
  );
}