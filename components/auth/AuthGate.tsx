"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PUBLIC_PATHS = ["/login", "/auth/set-password"];
const GIDO_LOGIN_AT_KEY = "gido_login_at";
const GIDO_INITIAL_HOME_DONE_KEY = "gido_initial_home_done";
const GIDO_LOGIN_TTL_MS = 60 * 60 * 1000;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();

      const currentPath = pathname ?? "";
      const isPublic = PUBLIC_PATHS.some((path) => currentPath === path || currentPath.startsWith(`${path}/`));

      if (data.session && typeof window !== "undefined") {
        const rawLoginAt = window.localStorage.getItem(GIDO_LOGIN_AT_KEY);
        const loginAt = rawLoginAt ? Number(rawLoginAt) : 0;
        const now = Date.now();

        if (!loginAt || Number.isNaN(loginAt)) {
          window.localStorage.setItem(GIDO_LOGIN_AT_KEY, String(now));
        } else if (now - loginAt > GIDO_LOGIN_TTL_MS) {
          window.localStorage.removeItem(GIDO_LOGIN_AT_KEY);
          window.sessionStorage.removeItem(GIDO_INITIAL_HOME_DONE_KEY);
          await supabase.auth.signOut();
          if (!isPublic) router.replace("/login");
          if (alive) setChecked(true);
          return;
        }
      }

      if (!data.session && !isPublic) {
        router.replace("/login");
        return;
      }

      if (data.session && currentPath === "/login") {
        router.replace("/");
        return;
      }

      if (
        data.session &&
        typeof window !== "undefined" &&
        !isPublic &&
        currentPath &&
        currentPath !== "/" &&
        !window.sessionStorage.getItem(GIDO_INITIAL_HOME_DONE_KEY)
      ) {
        window.sessionStorage.setItem(GIDO_INITIAL_HOME_DONE_KEY, "1");
        router.replace("/");
        return;
      }

      if (data.session && typeof window !== "undefined") {
        window.sessionStorage.setItem(GIDO_INITIAL_HOME_DONE_KEY, "1");
      }

      if (alive) setChecked(true);
    }

    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  const isCurrentPublic = PUBLIC_PATHS.some((path) => (pathname ?? "") === path || (pathname ?? "").startsWith(`${path}/`));

  if (!checked && !isCurrentPublic) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm font-bold text-[#8a5b00]">
        로그인 확인 중...
      </div>
    );
  }

  return <div>{children}</div>;
}