import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppHeader from "./_components/AppHeader";
import AuthGate from "@/components/auth/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "w",
  description: "부부 자산과 소비를 함께 관리하는 가계부",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f7f8fa] text-slate-900">
        <AuthGate>
          <div className="min-h-screen">
            <AppHeader />
            <div className="pb-10">{children}</div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}