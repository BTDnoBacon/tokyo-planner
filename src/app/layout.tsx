import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import SwRegister from "@/components/sw-register";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tokyo Planner",
  description: "도쿄 여행 일정을 계획하세요 — 지도에 핀을 찍고 타임라인을 만들어보세요.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ef4444",
  // env(safe-area-inset-*)가 실제 값을 갖도록 필수 (바텀시트 하단 패딩)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geist.variable} h-full`}>
      <body className="h-full bg-zinc-50 text-zinc-900 font-sans antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
