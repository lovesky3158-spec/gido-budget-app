"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/dashboard", label: "리포트", icon: "📊" },
  { href: "/transactions", label: "거래", icon: "🧾" },
  { href: "/assets", label: "자산", icon: "💰" },
  { href: "/upload", label: "업로드", icon: "📤" },
];

function getUserProfile(email: string | null) {
  const normalized = (email ?? "").toLowerCase();

  if (normalized.includes("chan9010")) {
    return { label: "기린", icon: "/icons/girin.png" };
  }

  if (normalized.includes("ehdus7607")) {
    return { label: "짱구", icon: "/icons/zzangu.png" };
  }

  return { label: "공동", icon: "/icons/girin.png" };
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
    <>
      <header className="sticky top-0 z-50 border-b border-[#f1d67a]/60 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-[22px] bg-[#ffd84d] opacity-35 blur-[12px]" />
              <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#fff1a8,#ffd84d,#ffbf1f)] shadow-[0_12px_26px_rgba(255,191,31,0.32)]">
                <img
                  src="/icons/girin.png"
                  alt="기도쀼"
                  className="h-8 w-8 object-contain"
                />
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

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-[#fff7d6] px-3 py-1.5 text-[12px] font-black text-[#8a5b00] ring-1 ring-[#f1d67a]/70">
              <img
                src={profile.icon}
                alt={profile.label}
                className="h-5 w-5 rounded-full object-contain"
              />
              <span>{email ? profile.label : "공동"}</span>
            </div>

            {email && (
              <button
                type="button"
                onClick={handleLogout}
                className="hidden rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[#8a5b00] ring-1 ring-[#f1d67a]/80 transition hover:bg-[#fff7d6] sm:inline-flex"
              >
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#f1d67a]/70 bg-white/92 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[28px] bg-[#fffdf5] p-1 shadow-[0_-12px_40px_rgba(139,92,0,0.10)] ring-1 ring-[#f1d67a]/60">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] font-black transition",
                  active
                    ? "bg-[#ffd84d] text-[#5f3f00] shadow-[0_8px_18px_rgba(255,191,31,0.28)]"
                    : "text-[#9a7a32] hover:bg-[#fff7d6]",
                ].join(" ")}
              >
                <span className="text-[18px] leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}