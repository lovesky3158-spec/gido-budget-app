"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PUBLIC_PATHS = ["/login"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();

      const currentPath = pathname ?? "";
      const isPublic = PUBLIC_PATHS.includes(currentPath);

      if (!data.session && !isPublic) {
        router.replace("/login");
        return;
      }

      if (data.session && currentPath === "/login") {
        router.replace("/");
        return;
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

  if (!checked && !PUBLIC_PATHS.includes(pathname ?? "")) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm font-bold text-[#8a5b00]">
        로그인 확인 중...
      </div>
    );
  }

  return <div>{children}</div>;
}