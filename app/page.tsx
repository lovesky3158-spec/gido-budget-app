"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import { formatMoney, formatSignedMoney, getNormalizedAmount, parseShortDate, splitType } from "@/lib/finance-utils";
import { isImageIcon, loadOptionIcons, resolveOptionIcon, type OptionIconMap } from "@/lib/option-icons";

type TransactionRow = {
  id: string | number;
  tx_date: string | null;
  description: string | null;
  type: string | null;
  amount: number | null;
  user_type: string | null;
  account_type: string | null;
  created_at?: string | null;
};

function getMonthFromRow(row: TransactionRow) {
  return parseShortDate(row.tx_date)?.ym ?? "";
}

function getMonthLabel(month: string) {
  if (!month) return "이번 달";
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

function getCategory(row: TransactionRow) {
  return splitType(row.type).category || "기타";
}

function amountTone(value: number) {
  if (value > 0) return "text-teal-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-800";
}

function categoryTone(category: string) {
  if (category.includes("식")) return "bg-rose-50 text-rose-500";
  if (category.includes("교통")) return "bg-purple-50 text-purple-500";
  if (category.includes("편의") || category.includes("생활")) return "bg-blue-50 text-blue-500";
  if (category.includes("수입") || category.includes("급여")) return "bg-emerald-50 text-emerald-600";
  return "bg-slate-100 text-slate-500";
}

function userIcon(user: string) {
  const name = normalizeUserTag(user) || user;
  if (name === "짱구") return "/icons/zzangu.png";
  return "/icons/girin.png";
}

function accountIcon(account: string, optionIcons: OptionIconMap) {
  return resolveOptionIcon("accounts", account, optionIcons);
}

function sum(values: number[]) {
  return values.reduce((acc, cur) => acc + cur, 0);
}

export default function HomePage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [optionIcons, setOptionIcons] = useState<OptionIconMap>({});

  useEffect(() => {
    setOptionIcons(loadOptionIcons());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "asset_couple_option_icons") setOptionIcons(loadOptionIcons());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, tx_date, description, type, amount, user_type, account_type, created_at")
          .order("tx_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1200);

        if (!active) return;
        if (error) {
          setRows([]);
          setErrorMessage(error.message);
        } else {
          setRows((data ?? []) as TransactionRow[]);
          setErrorMessage("");
        }
      } catch (err) {
        if (!active) return;
        setRows([]);
        setErrorMessage(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const monthOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => getMonthFromRow(r)).filter(Boolean))).sort((a, b) => (a < b ? 1 : -1)),
    [rows]
  );

  useEffect(() => {
    if (!selectedMonth && monthOptions[0]) setSelectedMonth(monthOptions[0]);
    else if (selectedMonth && monthOptions.length && !monthOptions.includes(selectedMonth)) setSelectedMonth(monthOptions[0]);
  }, [monthOptions, selectedMonth]);

  const currentMonth = selectedMonth || monthOptions[0] || "";
  const currentIndex = monthOptions.indexOf(currentMonth);
  const canGoNewer = currentIndex > 0;
  const canGoOlder = currentIndex >= 0 && currentIndex < monthOptions.length - 1;

  const monthRows = useMemo(
    () => (currentMonth ? rows.filter((row) => getMonthFromRow(row) === currentMonth) : []),
    [rows, currentMonth]
  );

  const incomeRows = monthRows.filter((r) => getNormalizedAmount(r) > 0);
  const expenseRows = monthRows.filter((r) => getNormalizedAmount(r) < 0);
  const income = sum(incomeRows.map((r) => getNormalizedAmount(r)));
  const expense = sum(expenseRows.map((r) => Math.abs(getNormalizedAmount(r))));
  const net = income - expense;
  const budget = 1780000;
  const budgetRate = Math.min(100, Math.round((expense / budget) * 100));

  const recentRows = useMemo(
    () =>
      [...monthRows]
        .sort((a, b) => {
          const ad = a.tx_date ?? a.created_at ?? "";
          const bd = b.tx_date ?? b.created_at ?? "";
          return ad < bd ? 1 : -1;
        })
        .slice(0, 5),
    [monthRows]
  );

  const userSummary = useMemo(() => {
    const result = { 기린: 0, 짱구: 0 };
    for (const row of expenseRows) {
      const user = normalizeUserTag(row.user_type) || "기린";
      const value = Math.abs(getNormalizedAmount(row));
      if (user === "짱구") result.짱구 += value;
      else result.기린 += value;
    }
    return result;
  }, [expenseRows]);

  function moveMonth(direction: "newer" | "older") {
    if (currentIndex < 0) return;
    const nextIndex = direction === "newer" ? currentIndex - 1 : currentIndex + 1;
    const next = monthOptions[nextIndex];
    if (next) setSelectedMonth(next);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f7fbfb] px-5 py-10 pb-28">
        <div className="mx-auto mt-20 max-w-sm rounded-[32px] border border-yellow-100 bg-white p-7 text-center shadow-[0_24px_70px_rgba(139,92,0,0.10)]">
          <Image src="/icons/girin.png" alt="loading" width={58} height={58} className="mx-auto h-14 w-14 object-contain" />
          <div className="mt-4 text-xl font-black tracking-[-0.04em] text-[#2a2112]">가계부 불러오는 중</div>
          <div className="mt-2 text-sm font-semibold text-[#9a7a32]">잠깐만 기다려주세요</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fbfb_0%,#ffffff_46%,#fffdf5_100%)] px-4 pb-[112px] pt-4 md:px-6 md:pb-12">
      <div className="mx-auto max-w-6xl">
        {errorMessage ? (
          <div className="mb-4 rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {/* 모바일 전용: 히어로 최소화 + 월 이동 */}
        <section className="md:hidden">
          <div className="flex items-center justify-center gap-3 py-1">
            <button
              type="button"
              onClick={() => moveMonth("older")}
              disabled={!canGoOlder}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-black text-slate-800 shadow-sm ring-1 ring-slate-200 disabled:opacity-30"
              aria-label="이전 달"
            >
              ‹
            </button>
            <div className="min-w-[168px] rounded-[18px] bg-white px-5 py-3 text-center text-[17px] font-black tracking-[-0.04em] text-slate-900 shadow-sm ring-1 ring-slate-200">
              {getMonthLabel(currentMonth)}
            </div>
            <button
              type="button"
              onClick={() => moveMonth("newer")}
              disabled={!canGoNewer}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-black text-slate-800 shadow-sm ring-1 ring-slate-200 disabled:opacity-30"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="px-4 py-5">
              <div className="text-[12px] font-bold text-slate-500">지출</div>
              <div className="mt-2 text-[20px] font-black tracking-[-0.05em] text-slate-950">{formatMoney(expense)}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-400" style={{ width: `${budgetRate}%` }} />
              </div>
            </div>
            <div className="border-x border-slate-100 px-4 py-5">
              <div className="text-[12px] font-bold text-slate-500">순흐름</div>
              <div className={`mt-2 text-[20px] font-black tracking-[-0.05em] ${amountTone(net)}`}>{formatSignedMoney(net)}</div>
              <div className="mt-3 text-[11px] font-semibold text-slate-400">수입 - 지출</div>
            </div>
            <div className="px-4 py-5">
              <div className="text-[12px] font-bold text-slate-500">예산</div>
              <div className="mt-2 text-[20px] font-black tracking-[-0.05em] text-slate-950">{formatMoney(budget)}</div>
              <div className="mt-3 text-[11px] font-semibold text-slate-400">{budgetRate}% 사용</div>
            </div>
          </div>

          <section className="mt-5 rounded-[28px] border border-teal-200 bg-white p-5 shadow-[0_18px_50px_rgba(20,184,166,0.10)]">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[32px]">📝</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[20px] font-black tracking-[-0.04em] text-slate-950">수동 등록</h2>
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-600">빠른 입력</span>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">현금 사용분이나 자동 파싱되지 않은 내역을 직접 입력하세요.</p>
              </div>
            </div>
            <Link href="/upload" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-teal-500 text-[16px] font-black text-white shadow-[0_12px_28px_rgba(20,184,166,0.26)]">
              + 수동 거래 등록
            </Link>
          </section>

          <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between px-1 py-1">
              <h2 className="text-[20px] font-black tracking-[-0.04em] text-slate-950">최근 거래 내역</h2>
              <Link href="/transactions" className="text-[13px] font-bold text-slate-400">전체 보기</Link>
            </div>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-100">
              {recentRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm font-semibold text-slate-400">표시할 거래가 없습니다.</div>
              ) : (
                recentRows.map((row) => {
                  const amount = getNormalizedAmount(row);
                  const user = normalizeUserTag(row.user_type) || "기린";
                  const account = normalizeAccountLabel(row.account_type) || "현금";
                  const category = getCategory(row);
                  const icon = accountIcon(account, optionIcons);

                  return (
                    <Link
                      href="/transactions"
                      key={String(row.id)}
                      className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-slate-100 bg-white px-3 py-3.5 last:border-b-0 active:bg-slate-50"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-100">
                        {icon ? (
                          isImageIcon(icon) ? <img src={icon} alt="" className="h-7 w-7 object-contain" /> : <span className="text-[23px]">{icon}</span>
                        ) : (
                          <img src={userIcon(user)} alt="" className="h-8 w-8 object-contain" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-black tracking-[-0.03em] text-slate-950">{row.description || "-"}</div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-slate-400">
                          <img src={userIcon(user)} alt="" className="h-4 w-4 shrink-0 object-contain" />
                          <span className="shrink-0">{user}</span>
                          <span>·</span>
                          <span className="truncate">{account}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[16px] font-black tracking-[-0.03em] ${amountTone(amount)}`}>{formatSignedMoney(amount)}</div>
                        <div className="mt-1 text-[12px] font-bold text-slate-400">{parseShortDate(row.tx_date)?.display ?? row.tx_date ?? "-"}</div>
                        <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${categoryTone(category)}`}>{category}</div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[20px] font-black tracking-[-0.04em] text-slate-950">사용자 지출</h2>
              <span className="text-[12px] font-bold text-slate-400">{getMonthLabel(currentMonth)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["기린", "짱구"] as const).map((name) => (
                <div key={name} className="rounded-[22px] border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <img src={userIcon(name)} alt="" className="h-9 w-9 object-contain" />
                    <div className="text-[14px] font-black text-slate-700">{name}</div>
                  </div>
                  <div className="mt-3 text-[18px] font-black tracking-[-0.04em] text-slate-950">{formatMoney(userSummary[name])}</div>
                </div>
              ))}
            </div>
          </section>
        </section>

        {/* 웹/태블릿: 기존보다 살짝 압축된 공용 홈 */}
        <section className="hidden md:block">
          <div className="flex items-center justify-between rounded-[28px] border border-yellow-100 bg-white px-6 py-5 shadow-[0_18px_45px_rgba(139,92,0,0.06)]">
            <div>
              <div className="text-sm font-black text-[#9a6800]">기도쀼 가계부</div>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#2a2112]">{getMonthLabel(currentMonth)} 요약</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => moveMonth("older")} disabled={!canGoOlder} className="h-10 w-10 rounded-full bg-slate-50 text-xl font-black ring-1 ring-slate-200 disabled:opacity-30">‹</button>
              <button onClick={() => moveMonth("newer")} disabled={!canGoNewer} className="h-10 w-10 rounded-full bg-slate-50 text-xl font-black ring-1 ring-slate-200 disabled:opacity-30">›</button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <div>
              <div className="text-sm font-bold text-slate-500">지출</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em]">{formatMoney(expense)}</div>
            </div>
            <div className="border-x border-slate-100 px-6">
              <div className="text-sm font-bold text-slate-500">순흐름</div>
              <div className={`mt-2 text-3xl font-black tracking-[-0.05em] ${amountTone(net)}`}>{formatSignedMoney(net)}</div>
            </div>
            <div className="pl-6">
              <div className="text-sm font-bold text-slate-500">수입</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-blue-600">{formatMoney(income)}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[28px] border border-teal-200 bg-white p-6 shadow-[0_18px_45px_rgba(20,184,166,0.08)]">
              <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">수동 등록</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">현금 사용분이나 자동 파싱되지 않은 내역을 직접 입력하세요.</p>
              <Link href="/upload" className="mt-5 inline-flex h-12 items-center rounded-[18px] bg-teal-500 px-6 text-base font-black text-white">+ 수동 거래 등록</Link>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">최근 거래</h2>
                <Link href="/transactions" className="text-sm font-bold text-teal-600">전체 보기</Link>
              </div>
              <div className="mt-4 space-y-2">
                {recentRows.map((row) => {
                  const amount = getNormalizedAmount(row);
                  return (
                    <Link href="/transactions" key={String(row.id)} className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-950">{row.description || "-"}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-400">{normalizeUserTag(row.user_type) || "기린"} · {normalizeAccountLabel(row.account_type) || "현금"} · {getCategory(row)}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-black ${amountTone(amount)}`}>{formatSignedMoney(amount)}</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
