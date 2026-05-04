import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tokyo Planner",
  description: "도쿄 여행 일정을 계획하세요 — 지도에 핀을 찍고 타임라인을 만들어보세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geist.variable} h-full`}>
      <body className="h-full bg-zinc-50 text-zinc-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
