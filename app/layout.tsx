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
  title: "기도쀼 가계부",
  description: "부부 자산과 소비를 함께 관리하는 가계부",
  manifest: "/manifest.webmanifest",
  themeColor: "#fff1a8",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "기도쀼",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
  <div className="min-h-screen bg-[#f7f8fa]">
    <AppHeader />
    <div className="pb-28 md:pb-10">{children}</div>
  </div>
</AuthGate>
      </body>
    </html>
  );
}