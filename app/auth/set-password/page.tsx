"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const GIDO_LOGIN_AT_KEY = "gido_login_at";
const SITE_URL = "https://mgido.vercel.app";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("초대 링크를 확인하고 있어요.");
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return ready && password.length >= 6 && password === passwordConfirm && !busy;
  }, [busy, password, passwordConfirm, ready]);

  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkSession(tryCount = 0) {
      const { data } = await supabase.auth.getSession();

      if (!alive) return;

      if (data.session) {
        setReady(true);
        setChecking(false);
        setMessage("새 비밀번호를 설정하면 바로 앱을 사용할 수 있어요.");
        return;
      }

      // Supabase가 invite/reset 링크의 URL 토큰을 localStorage 세션으로 변환하는 시간이 조금 걸릴 수 있어요.
      if (tryCount < 8) {
        retryTimer = setTimeout(() => checkSession(tryCount + 1), 350);
        return;
      }

      setReady(false);
      setChecking(false);
      setMessage("");
      setError(
        "초대 세션을 찾지 못했어요. 메일 링크를 다시 누르거나, Supabase Redirect URL이 /auth/set-password로 되어있는지 확인해주세요."
      );
    }

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;

      if (session) {
        setReady(true);
        setChecking(false);
        setMessage("새 비밀번호를 설정하면 바로 앱을 사용할 수 있어요.");
        setError("");
      }
    });

    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!ready) {
      setError("초대 링크 세션 확인 후 다시 시도해주세요.");
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자리 이상으로 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(false);

    if (error) {
      setError(error.message || "비밀번호 설정에 실패했습니다.");
      return;
    }

    window.localStorage.setItem(GIDO_LOGIN_AT_KEY, String(Date.now()));
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-[32px] border border-[#f1d67a]/70 bg-white p-7 shadow-[0_24px_80px_rgba(139,92,0,0.10)]"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-[#fff7d6] shadow-[0_14px_30px_rgba(255,191,31,0.22)] ring-1 ring-[#f1d67a]/70">
              <img src="/icons/girin.png" alt="기린" className="h-10 w-10 object-contain" />
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-[#fff7d6] shadow-[0_14px_30px_rgba(255,191,31,0.22)] ring-1 ring-[#f1d67a]/70">
              <img src="/icons/zzangu.png" alt="짱구" className="h-10 w-10 object-contain" />
            </div>
          </div>

          <h1 className="text-xl font-black tracking-[-0.03em] text-[#2a2112]">
            비밀번호 설정
          </h1>
          <p className="mt-2 text-xs font-bold leading-relaxed text-[#b8860b]">
            초대받은 계정의 첫 비밀번호를 설정합니다.
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-2xl bg-[#fff9df] px-4 py-3 text-xs font-extrabold leading-relaxed text-[#8a5b00]">
            {message}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="password"
            placeholder="새 비밀번호 / 최소 6자리"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready || busy}
            className="h-12 w-full rounded-2xl border border-[#ead78c] bg-[#fffdf5] px-4 text-sm font-semibold outline-none focus:border-[#ffbf1f] disabled:opacity-60"
          />

          <input
            type="password"
            placeholder="새 비밀번호 확인"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={!ready || busy}
            className="h-12 w-full rounded-2xl border border-[#ead78c] bg-[#fffdf5] px-4 text-sm font-semibold outline-none focus:border-[#ffbf1f] disabled:opacity-60"
          />
        </div>

        {password && passwordConfirm && password !== passwordConfirm && (
          <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
            비밀번호 확인이 아직 일치하지 않아요.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold leading-relaxed text-rose-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 h-12 w-full rounded-2xl bg-[#ffd84d] text-sm font-black text-[#5f3f00] shadow-[0_12px_24px_rgba(255,191,31,0.28)] transition hover:bg-[#ffcf24] disabled:opacity-50"
        >
          {checking ? "초대 확인 중..." : busy ? "저장 중..." : "비밀번호 설정하고 시작"}
        </button>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-slate-500">
          Supabase Redirect URL은 <span className="font-black text-slate-700">{SITE_URL}/auth/set-password</span> 로 등록해주세요.
        </div>
      </form>
    </main>
  );
}
