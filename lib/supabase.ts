import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}

if (!supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // 로그인 유지시간을 앱에서 1시간으로 제어하기 위해 localStorage에 세션을 보관합니다.
    // 실제 만료 판단은 AuthGate의 GIDO_LOGIN_TTL_MS에서 처리합니다.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});