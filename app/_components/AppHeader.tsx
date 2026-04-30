"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/dashboard", label: "리포트", icon: "📊" },
  { href: "/transactions", label: "거래내역", icon: "🧾" },
  { href: "/assets", label: "자산현황", icon: "💰" },
  { href: "/upload", label: "업로드", icon: "📤" },
];
function getUserProfile(email: string | null) {
  const normalized = (email ?? "").toLowerCase();

  if (normalized.includes("chan9010")) {
    return {
      label: "기린",
      icon: "/icons/girin.png",
    };
  }

  if (normalized.includes("ehdus7607")) {
    return {
      label: "짱구",
      icon: "/icons/zzangu.png",
    };
  }

  return {
    label: "공동",
    icon: "/icons/girin.png",
  };
}
function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const profile = getUserProfile(email);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    }

    loadUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[#f1d67a]/60 bg-white/88 backdrop-blur-xl">
      <div className="mx-auto flex h-[74px] max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-[22px] bg-[#ffd84d] opacity-35 blur-[12px] transition group-hover:opacity-55" />
            <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#fff1a8,#ffd84d,#ffbf1f)] text-[22px] shadow-[0_12px_26px_rgba(255,191,31,0.32)]">
              🐥
            </div>
          </div>

          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-black tracking-[-0.02em] text-[#2a2112]">
              기도쀼 가계부
            </div>
            <div className="truncate text-[11px] font-semibold text-[#b8860b]">
              Money Log
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "inline-flex items-center gap-1.5 rounded-[18px] px-4 py-2.5 text-xs font-bold transition-all",
                  active
                    ? "bg-[#fff1a8] text-[#8a5b00] shadow-[inset_0_0_0_1px_rgba(255,191,31,0.35),0_8px_20px_rgba(139,92,0,0.08)]"
                    : "text-[#7a6335] hover:bg-[#fff7d6] hover:text-[#8a5b00]",
                ].join(" ")}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <div className="flex max-w-[180px] items-center gap-2 rounded-full bg-[#fff7d6] px-3 py-1.5 text-[12px] font-black text-[#8a5b00] ring-1 ring-[#f1d67a]/70">
            <img
              src={profile.icon}
              alt={profile.label}
              className="h-5 w-5 rounded-full object-contain"
            />
            <span>{email ? profile.label : "공동 가계부"}</span>
          </div>

          {email ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[#8a5b00] ring-1 ring-[#f1d67a]/80 transition hover:bg-[#fff7d6]"
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-[#ffd84d] px-3 py-1.5 text-[12px] font-black text-[#5f3f00] transition hover:bg-[#ffcf24]"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}