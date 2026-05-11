"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const SAVED_LOGIN_ID_KEY = "gido_saved_login_id";
const GIDO_LOGIN_AT_KEY = "gido_login_at";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedId = window.localStorage.getItem(SAVED_LOGIN_ID_KEY) ?? "";
    if (savedId) {
      setEmail(savedId);
      setRememberId(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      setError("로그인 정보가 올바르지 않습니다.");
      return;
    }

    if (rememberId) {
      window.localStorage.setItem(SAVED_LOGIN_ID_KEY, email.trim());
    } else {
      window.localStorage.removeItem(SAVED_LOGIN_ID_KEY);
    }
    window.localStorage.setItem(GIDO_LOGIN_AT_KEY, String(Date.now()));

    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-[380px] rounded-[32px] border border-[#f1d67a]/70 bg-white p-7 shadow-[0_24px_80px_rgba(139,92,0,0.10)]"
      >
        <div className="mb-7 text-center">
<div className="mx-auto mb-4 flex items-center justify-center gap-3">
  <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-[#fff7d6] shadow-[0_14px_30px_rgba(255,191,31,0.22)] ring-1 ring-[#f1d67a]/70">
    <img
      src="/icons/girin.png"
      alt="기린"
      className="h-10 w-10 object-contain"
    />
  </div>

  <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-[#fff7d6] shadow-[0_14px_30px_rgba(255,191,31,0.22)] ring-1 ring-[#f1d67a]/70">
    <img
      src="/icons/zzangu.png"
      alt="짱구"
      className="h-10 w-10 object-contain"
    />
  </div>
</div>
          <h1 className="text-xl font-black tracking-[-0.03em] text-[#2a2112]">
            기도쀼 가계부
          </h1>
          <p className="mt-1 text-xs font-bold text-[#b8860b]">
            로그인 후 이용할 수 있어요
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-2xl border border-[#ead78c] bg-[#fffdf5] px-4 text-sm font-semibold outline-none focus:border-[#ffbf1f]"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-2xl border border-[#ead78c] bg-[#fffdf5] px-4 text-sm font-semibold outline-none focus:border-[#ffbf1f]"
          />
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-2xl px-1 text-xs font-extrabold text-[#8a5b00]">
          <input
            type="checkbox"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
            className="h-4 w-4 rounded border-[#ead78c] accent-[#ffbf1f]"
          />
          아이디 저장
        </label>

        {error && (
          <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-12 w-full rounded-2xl bg-[#ffd84d] text-sm font-black text-[#5f3f00] shadow-[0_12px_24px_rgba(255,191,31,0.28)] transition hover:bg-[#ffcf24] disabled:opacity-50"
        >
          {busy ? "로그인 중..." : "로그인"}
        </button>

        <div className="mt-4 rounded-2xl bg-[#fff9df] px-4 py-3 text-center text-[11px] font-bold leading-relaxed text-[#8a5b00]">
          초대 메일로 처음 들어온 경우에는 메일 링크를 다시 눌러 비밀번호를 설정해주세요.
        </div>
      </form>
    </main>
  );
}