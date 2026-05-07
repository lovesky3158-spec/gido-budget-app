"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/transactions", label: "내역", icon: "🧾" },
  { href: "/upload", label: "추가", icon: "+", primary: true },
  { href: "/dashboard", label: "리포트", icon: "📊" },
  { href: "/assets", label: "자산", icon: "💰" },
];

const mobileRouteMeta: Record<
  string,
  { title: string; icon: string; tone: "yellow" | "green" }
> = {
  "/": { title: "홈", icon: "/icons/zzangu.png", tone: "yellow" },
  "/transactions": { title: "내역", icon: "/icons/zzangu.png", tone: "yellow" },
  "/upload": { title: "추가", icon: "/icons/zzangu.png", tone: "yellow" },
  "/dashboard": { title: "리포트", icon: "/icons/girin.png", tone: "green" },
  "/assets": { title: "자산", icon: "/icons/girin.png", tone: "green" },
};

function getMobileRouteMeta(pathname: string | null) {
  if (!pathname) return mobileRouteMeta["/"];
  const key = Object.keys(mobileRouteMeta)
    .filter((href) => href === "/" ? pathname === "/" : pathname.startsWith(href))
    .sort((a, b) => b.length - a.length)[0];
  return mobileRouteMeta[key ?? "/"];
}

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
  const mobileMeta = getMobileRouteMeta(pathname);
const isGreenMobileTone = mobileMeta.tone === "green";

const mobileHeaderTone = isGreenMobileTone
? "border-[#bdeedc] bg-[linear-gradient(135deg,#eafff6_0%,#ccfaea_100%)]/96"
: "border-[#f1d67a]/70 bg-[linear-gradient(135deg,#fff7c7_0%,#ffe27a_100%)]/96";

const mobileIconTone = isGreenMobileTone
? "bg-white ring-[#bdeedc] shadow-[0_8px_20px_rgba(20,184,166,0.16)]"
: "bg-white ring-[#f1d67a] shadow-[0_8px_20px_rgba(255,191,31,0.20)]";

const mobileProfileTone = isGreenMobileTone
? "bg-[#ecfdf5] text-[#047857] ring-[#bdeedc]"
: "bg-[#fff7d6] text-[#8a5b00] ring-[#f1d67a]/70";

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
      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl ${mobileHeaderTone} sm:border-[#f1d67a]/60 sm:bg-white/92`}>
        <div className="mx-auto flex h-[56px] max-w-6xl items-center justify-between gap-3 px-4 sm:h-[68px]">
          <Link href="/" className="group hidden min-w-0 items-center gap-3 sm:flex">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-[22px] bg-[#ffd84d] opacity-35 blur-[12px]" />
              <div className="relative inline-flex h-9 w-9 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#fff1a8,#ffd84d,#ffbf1f)] shadow-[0_12px_26px_rgba(255,191,31,0.32)] sm:h-11 sm:w-11 sm:rounded-[22px]">
                <img
                  src="/icons/girin.png"
                  alt="기도쀼"
                  className="h-7 w-7 object-contain sm:h-8 sm:w-8"
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

          <div className="flex min-w-0 items-center gap-2 sm:hidden">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] ring-1 ${mobileIconTone}`}>
              <img src={mobileMeta.icon} alt="" className="h-7 w-7 object-contain" />
            </span>
            <div className="truncate text-[18px] font-black tracking-[-0.04em] text-[#2a2112]">
              {mobileMeta.title}
            </div>
          </div>

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
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-black ring-1 sm:gap-2 sm:px-3 sm:text-[12px] ${mobileProfileTone} sm:bg-[#fff7d6] sm:text-[#8a5b00] sm:ring-[#f1d67a]/70`}>
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

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#f1d67a]/70 bg-white/94 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1 rounded-[30px] bg-[#fffdf5] p-1.5 shadow-[0_-14px_44px_rgba(139,92,0,0.12)] ring-1 ring-[#f1d67a]/60">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.primary ? "/upload?manual=1" : item.href}
                className={[
                  item.primary
                    ? "-mt-5 flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-[24px] bg-[#ffd84d] text-[10px] font-black text-[#5f3f00] shadow-[0_12px_28px_rgba(255,191,31,0.36)] ring-4 ring-white"
                    : "flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-black transition",
                  !item.primary && active
                    ? "bg-[#fff1a8] text-[#5f3f00] shadow-[0_8px_18px_rgba(255,191,31,0.18)]"
                    : !item.primary
                      ? "text-[#9a7a32] hover:bg-[#fff7d6]"
                      : "",
                ].join(" ")}
              >
                <span className={item.primary ? "flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-[24px] leading-none" : "text-[17px] leading-none"}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}