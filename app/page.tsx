"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import {
  formatMoney,
  formatSignedMoney,
  getCategoryEmoji,
  getMonthShort,
  getNormalizedAmount,
  parseShortDate,
  splitType,
} from "@/lib/finance-utils";
import {
  isImageIcon,
  loadOptionIcons,
  resolveOptionIcon,
  type OptionIconMap,
} from "@/lib/option-icons";

type TransactionRow = {
  id: string | number;
  tx_date: string | null;
  description: string | null;
  type: string | null;
  amount: number | null;
  user_type: string | null;
  account_type: string | null; // ✅ 추가
  created_at?: string | null;
};

type CategorySlice = {
  label: string;
  value: number;
  percent: number;
  emoji: string;
  color: string;
  soft: string;
};

type MonthSummary = {
  ym: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

const CATEGORY_COLORS = [
  { color: "#14b8a6", soft: "rgba(20,184,166,0.12)" },
  { color: "#22c55e", soft: "rgba(34,197,94,0.12)" },
  { color: "#f59e0b", soft: "rgba(245,158,11,0.14)" },
  { color: "#60a5fa", soft: "rgba(96,165,250,0.14)" },
  { color: "#f472b6", soft: "rgba(244,114,182,0.14)" },
  { color: "#a78bfa", soft: "rgba(167,139,250,0.14)" },
] as const;




function getCategory(row: TransactionRow) {
  return splitType(row.type).category || "기타";
}
function getCard(row: TransactionRow) {
  return normalizeAccountLabel(row.account_type) || "미지정";
}

function getMonthFromRow(row: TransactionRow) {
  return parseShortDate(row.tx_date)?.ym ?? "";
}

function sum(values: number[]) {
  return values.reduce((acc, cur) => acc + cur, 0);
}


function formatMonthTitle(month: string) {
  if (!month) return "이번 달";
  const [, m] = month.split("-");
  return `${Number(m)}월`;
}

function amountTone(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-700";
}

function getUserSpendSummary(rows: TransactionRow[]) {
  const result = { girin: 0, zzangu: 0, shared: 0 };

  for (const row of rows) {
    const amount = getNormalizedAmount(row);
    if (amount >= 0) continue;

    const user = normalizeUserTag(row.user_type) || "";
    const spend = Math.abs(amount);

    if (user === "기린") result.girin += spend;
    else if (user === "짱구" || user.toLowerCase() === "zzangu") result.zzangu += spend;
    else result.shared += spend;
  }

  return result;
}

function userBadge(user: string) {
  const normalized = user.trim();

  if (normalized === "짱구" || normalized.toLowerCase() === "zzangu") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jjanggu-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--jjanggu-text)]">
        <Image src="/icons/zzangu.png" alt="짱구" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-contain" />
        짱구
      </span>
    );
  }

  if (normalized === "기린") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--girin-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--girin-text)]">
        <img
          src="/icons/girin.png"
          alt="기린"
          className="h-3.5 w-3.5 object-contain"
        />
        기린
      </span>
    );
  }

  if (normalized === "공동") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[#5c4a28]">
        <span>🤝</span>
        공동
      </span>
    );
  }

  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-[#5c4a28]">{normalized || "미지정"}</span>;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return ["M", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function buildAreaPath(points: { x: number; y: number }[], baseY: number) {
  if (!points.length) return "";
  const line = buildSmoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

export default function HomePage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [optionIcons, setOptionIcons] = useState<OptionIconMap>({});
  const [wifeMessage, setWifeMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWifeMessage(window.localStorage.getItem("gido_home_message") ?? "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gido_home_message", wifeMessage);
  }, [wifeMessage]);

  useEffect(() => {
    setOptionIcons(loadOptionIcons());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "asset_couple_option_icons") {
        setOptionIcons(loadOptionIcons());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // hover 해제 시 전체값으로 복귀
  const handleLeaveDonut = () => setActiveCategory(null);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const response = await supabase
          .from("transactions")
          .select("id, tx_date, description, type, amount, user_type, account_type, created_at")
          .order("created_at", { ascending: false })
          .limit(1200);

        if (!active) return;

        if (response.error) {
          setRows([]);
          setErrorMessage(response.error.message);
        } else {
          setRows((response.data ?? []) as TransactionRow[]);
          setErrorMessage("");
        }
      } catch (err) {
        if (!active) return;
        setRows([]);
        setErrorMessage(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    // ✅ 여기서 호출해야함
    fetchData();

    return () => {
      active = false;
    };
  }, []);
  const monthOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => getMonthFromRow(r)).filter(Boolean))).sort((a, b) => (a < b ? 1 : -1)),
    [rows]
  );

  const currentMonth = monthOptions[0] ?? "";

  const selectedMonthRows = useMemo(
    () => (currentMonth ? rows.filter((row) => getMonthFromRow(row) === currentMonth) : []),
    [rows, currentMonth]
  );

  const selectedIncomeRows = selectedMonthRows.filter((r) => getNormalizedAmount(r) > 0);
  const selectedExpenseRows = selectedMonthRows.filter((r) => getNormalizedAmount(r) < 0);

  const totalIncome = sum(selectedIncomeRows.map((r) => getNormalizedAmount(r)));
  const totalExpense = sum(selectedExpenseRows.map((r) => Math.abs(getNormalizedAmount(r))));
  const netAmount = totalIncome - totalExpense;
  const userSpendSummary = getUserSpendSummary(selectedMonthRows);

  const getUserTopCards = (userName: string) => {
    const map = new Map<string, number>();

    for (const row of selectedExpenseRows) {
      const user = normalizeUserTag(row.user_type) || "";
      if (user !== userName) continue;

      const card = getCard(row);
      const amount = Math.abs(getNormalizedAmount(row));
      map.set(card, (map.get(card) ?? 0) + amount);
    }

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);
  };

  const girinTopCards = getUserTopCards("기린");
  const zzanguTopCards = getUserTopCards("짱구");
  
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of selectedExpenseRows) {
      const category = getCategory(row);
      map.set(category, (map.get(category) ?? 0) + Math.abs(getNormalizedAmount(row)));
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [selectedExpenseRows]);

  const categorySlices: CategorySlice[] = useMemo(
    () =>
      expenseByCategory.slice(0, 5).map((item, idx) => ({
        ...item,
        percent: totalExpense > 0 ? Math.round((item.value / totalExpense) * 100) : 0,
        emoji: getCategoryEmoji(item.label),
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length].color,
        soft: CATEGORY_COLORS[idx % CATEGORY_COLORS.length].soft,
      })),
    [expenseByCategory, totalExpense]
  );

  useEffect(() => {
    setActiveCategory(categorySlices[0]?.label ?? null);
  }, [currentMonth, rows.length]);

  const activeSlice = categorySlices.find((slice) => slice.label === activeCategory) ?? categorySlices[0] ?? null;

  const top5Amounts = useMemo(
    () =>
      [...selectedMonthRows]
        .map((row) => ({ ...row, normalizedAmount: getNormalizedAmount(row) }))
        .sort((a, b) => Math.abs(b.normalizedAmount) - Math.abs(a.normalizedAmount))
        .slice(0, 5),
    [selectedMonthRows]
  );

  const recentRows = useMemo(
    () =>
      [...selectedMonthRows]
        .sort((a, b) => {
          const at = a.created_at ?? a.tx_date ?? "";
          const bt = b.created_at ?? b.tx_date ?? "";
          return at < bt ? 1 : -1;
        })
        .slice(0, 3),
    [selectedMonthRows]
  );

  const monthlySummaries: MonthSummary[] = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const ym = getMonthFromRow(row);
      if (!ym) continue;

      const amount = getNormalizedAmount(row);
      const entry = map.get(ym) ?? { income: 0, expense: 0 };
      if (amount > 0) entry.income += amount;
      else if (amount < 0) entry.expense += Math.abs(amount);
      map.set(ym, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-6)
      .map(([ym, values]) => ({
        ym,
        label: getMonthShort(ym),
        income: values.income,
        expense: values.expense,
        net: values.income - values.expense,
      }));
  }, [rows]);

  const chartWidth = 600;
  const chartHeight = 260;
  const padX = 30;
  const topY = 18;
  const bottomY = 38;
  const innerHeight = chartHeight - topY - bottomY;
  const baseY = topY + innerHeight;
  const trendMax = Math.max(...monthlySummaries.flatMap((m) => [m.income, m.expense, Math.abs(m.net)]), 1);

  const incomePoints = monthlySummaries.map((m, idx) => {
    const step = monthlySummaries.length > 1 ? (chartWidth - padX * 2) / (monthlySummaries.length - 1) : 0;
    return { x: padX + step * idx, y: baseY - (m.income / trendMax) * innerHeight };
  });

  const expensePoints = monthlySummaries.map((m, idx) => {
    const step = monthlySummaries.length > 1 ? (chartWidth - padX * 2) / (monthlySummaries.length - 1) : 0;
    return { x: padX + step * idx, y: baseY - (m.expense / trendMax) * innerHeight };
  });

  const netPoints = monthlySummaries.map((m, idx) => {
    const step = monthlySummaries.length > 1 ? (chartWidth - padX * 2) / (monthlySummaries.length - 1) : 0;
    return { x: padX + step * idx, y: baseY - ((m.net + trendMax) / (trendMax * 2)) * innerHeight };
  });

  const summaryCards = [
    { label: "순현금흐름", value: formatSignedMoney(netAmount), tone: amountTone(netAmount) },
    { label: "총수입", value: formatMoney(totalIncome), tone: "text-blue-600" },
    { label: "총지출", value: formatMoney(totalExpense), tone: "text-rose-600" },
  ];

  return (
    <main className="min-h-screen bg-white pb-12">
      {isLoading ? (
        <section className="mx-auto flex min-h-[calc(100vh-74px)] max-w-6xl items-center justify-center px-6">
          <div className="w-full max-w-[420px] rounded-[34px] border border-[#f1d67a] bg-white p-8 text-center shadow-[0_24px_60px_rgba(139,92,0,0.12)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#fff1a8,#ffd84d,#ffbf1f)] text-[34px] shadow-[0_14px_28px_rgba(255,191,31,0.28)]">
              🐥
            </div>

            <h1 className="mt-5 text-[24px] font-black tracking-[-0.04em] text-[#2a2112]">
              우리 돈 불러오는 중
            </h1>

            <p className="mt-2 text-sm font-semibold text-[#9a6800]">
              잠자는 DB를 깨우고 있어요
            </p>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#fff3bd]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#ffbf1f]" />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="hidden border-b border-[#f3df93] bg-[linear-gradient(135deg,#fff7c7_0%,#ffe27a_100%)] sm:block sm:bg-[linear-gradient(135deg,#fff1a8_0%,#ffd84d_52%,#ffbf1f_100%)]">
            <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-8">
              <div className="flex min-h-[34px] items-center sm:block sm:min-h-0 sm:py-2">
                <div className="hidden items-center gap-2 rounded-full border border-white/30 bg-white/35 px-3 py-1.5 text-[11px] font-bold text-[#2a2112] sm:inline-flex">
                  <span>{formatMonthTitle(currentMonth)} 요약</span>
                  <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">HOME</span>
                </div>

                <div className="sm:mt-3">
                  <h1 className="text-[20px] font-black tracking-[-0.045em] text-[#2a2112] sm:text-[38px]">
                    기린 도연 가계부
                  </h1>
                  <p className="mt-2 hidden text-[13px] font-medium leading-relaxed text-[#7a6335] sm:mt-3 sm:block sm:text-[14px]">
                    돈 열심히 모아서 이사가고 차사고 놀러가고 먹으러다니자!!
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
            <div className="rounded-[22px] border border-[#f1d67a] bg-[#fffdf2] px-4 py-3 shadow-[0_12px_28px_rgba(139,92,0,0.07)]">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-black text-[#b45309]">
                <img src="/icons/zzangu.png" alt="" className="h-5 w-5 object-contain" />
                <span>오늘의 한마디</span>
              </div>
              <input
                type="text"
                value={wifeMessage}
                onChange={(e) => setWifeMessage(e.target.value)}
                placeholder="와이프에게 남길 한마디를 적어봐요"
                className="h-9 w-full rounded-[16px] border border-[#f3df93] bg-white px-3 text-[12px] font-bold text-[#2a2112] outline-none placeholder:text-[#c0a96a]"
              />
            </div>
          </section>

<section className="mx-auto mt-3 max-w-6xl px-4 sm:mt-6 sm:px-6">
  <div className="hidden gap-2 sm:hidden">
    {summaryCards.map((card) => (
      <div key={card.label} className="flex min-h-[74px] items-center justify-between rounded-[22px] border border-slate-200 bg-white px-5 py-3 shadow-[0_12px_28px_rgba(139,92,0,0.08)]">
        <div className="text-[12px] font-black text-[#9a6800]">{card.label}</div>
        <div className={`text-[21px] font-black tracking-[-0.05em] ${card.tone}`}>{card.value}</div>
      </div>
    ))}
  </div>

  <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(139,92,0,0.10)] sm:grid-cols-3 sm:gap-5 sm:rounded-[32px] sm:p-6 lg:grid-cols-[3.5fr_3.25fr_3.25fr]">

    {/* 좌측: 현금흐름 + 수입/지출 */}
    <div className="flex min-h-[108px] flex-col justify-between rounded-[22px] bg-[#fff9df] px-5 py-4 sm:min-h-[140px] sm:rounded-[26px] sm:px-6 sm:py-5">

      {/* 현금흐름 */}
      <div>
        <div className="text-[10px] font-bold text-[#9a6800] sm:text-[15px]">
          {formatMonthTitle(currentMonth)} 얼마 모으려나
        </div>

        <div className={`mt-1 text-[25px] font-black tracking-[-0.05em] ${amountTone(netAmount)} sm:mt-2 sm:text-[32px]`}>
          {formatSignedMoney(netAmount)}
        </div>
      </div>

      {/* 수입 / 지출 (같은 행) */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        <div>
          <div className="text-[11px] font-black text-[#7a6335] sm:text-[13px]">수입</div>
          <div className="text-[15px] font-black text-[#2a2112] sm:text-[20px]">
            {formatMoney(totalIncome)}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-black text-[#7a6335] sm:text-[13px]">지출</div>
          <div className="text-[15px] font-black text-[#2a2112] sm:text-[20px]">
            {formatMoney(totalExpense)}
          </div>
        </div>
      </div>
    </div>

    {/* 기린 (3) */}
    <div className="flex min-h-[104px] items-center gap-4 rounded-[22px] bg-emerald-50 px-5 py-4 text-left sm:min-h-[140px] sm:gap-4 sm:rounded-[26px] sm:px-6 sm:py-5">
      <img src="/icons/girin.png" className="h-14 w-14 object-contain sm:h-[56px] sm:w-[56px]" />

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-emerald-700 sm:text-[15px]">기린</div>

        <div className="mt-0.5 text-[22px] font-black text-emerald-700 sm:mt-1 sm:text-[22px]">
          {formatMoney(userSpendSummary.girin)}
        </div>

        <div className="mt-2 grid gap-1.5 sm:mt-3 sm:gap-2">
          {(girinTopCards.length ? girinTopCards : [{ label: "-", value: 0 }, { label: "-", value: 0 }]).map((item, idx) => (
            <div
              key={`girin-${item.label}-${idx}`}
              className="flex items-center justify-between rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 sm:px-3 sm:py-1.5 sm:text-[13px]"
            >
              {(() => {
              const accountName = item.label ?? "-";
              const icon = resolveOptionIcon("accounts", accountName, optionIcons);

              return (
                <div className="flex min-w-0 items-center gap-1.5">
                  {icon ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#d9f2e6]">
                      {isImageIcon(icon) ? (
                        <img src={icon} alt="" className="h-3.5 w-3.5 object-contain" />
                      ) : (
                        <span className="text-[12px]">{icon}</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#2a2112] ring-1 ring-[#d9f2e6]">
                      {accountName[0]}
                    </span>
                  )}

                  <span className="truncate">{accountName}</span>
                </div>
              );
            })()}
              <span className="shrink-0 text-[10px] font-bold sm:text-[12px]">
                {formatMoney(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* 짱구 (3) */}
    <div className="flex min-h-[104px] items-center gap-4 rounded-[22px] border border-yellow-200 bg-[linear-gradient(135deg,#ffe08a,#ffd84d)] px-5 py-4 text-left shadow-[0_10px_22px_rgba(255,191,31,0.20)] sm:min-h-[140px] sm:gap-4 sm:rounded-[26px] sm:px-6 sm:py-5">
      <img src="/icons/zzangu.png" className="h-16 w-16 object-contain sm:h-[70px] sm:w-[70px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-[#b45309] sm:text-[15px]">짱구</div>
          <div className="mt-0.5 text-[22px] font-black text-[#b45309] sm:mt-1 sm:text-[22px]">
            {formatMoney(userSpendSummary.zzangu)}
          </div>

          <div className="mt-2 grid gap-1.5 sm:mt-3">
          {(zzanguTopCards.length ? zzanguTopCards : [{ label: "-", value: 0 }, { label: "-", value: 0 }]).map((item, idx) => (
            <div
              key={`zzangu-${item.label}-${idx}`}
              className="flex items-center justify-between rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#b45309] sm:px-3 sm:text-[13px]"
            >
              {(() => {
                const accountName = item.label ?? "-";
                const icon = resolveOptionIcon("accounts", accountName, optionIcons);

                return (
                  <div className="flex min-w-0 items-center gap-1.5">
                    {icon ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#f0df9b]">
                        {isImageIcon(icon) ? (
                          <img src={icon} alt="" className="h-3.5 w-3.5 object-contain" />
                        ) : (
                          <span className="text-[12px]">{icon}</span>
                        )}
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#2a2112] ring-1 ring-[#d9f2e6]">
                        {accountName[0]}
                      </span>
                    )}

                    <span className="truncate">{accountName}</span>
                  </div>
                );
              })()}

              <span className="shrink-0">{formatMoney(item.value)}</span>
            </div>
          ))}
          </div>
        </div>
    </div>

  </div>
</section>



      <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
        {errorMessage ? (
          <div className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {!currentMonth ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-[#7a6335] shadow-sm">
            표시할 월 데이터가 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#2a2112]">
                    최근 거래
                  </h2>
                  <p className="mt-1 text-[13px] text-[#7a6335]">
                    가장 최근 입력된 거래
                  </p>
                </div>

                <Link href="/transactions" className="text-[13px] font-medium text-[var(--teal-700)]">
                  전체 보기
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {recentRows.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-9 text-center text-sm text-[#7a6335]">
                    최근 거래가 없습니다.
                  </div>
                ) : (
                  recentRows.map((row) => {
                    const amount = getNormalizedAmount(row);
                    const user = normalizeUserTag(row.user_type) || "미지정";
                    const category = getCategory(row);

                    return (
                      <div
                        key={`recent-${String(row.id)}`}
                        className="rounded-[20px] bg-slate-50 px-4 py-3.5 transition hover:bg-slate-100/80"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium text-[#2a2112]">
                              {row.description || "-"}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#7a6335]">
                              <span>{parseShortDate(row.tx_date)?.display ?? row.tx_date ?? "-"}</span>
                              <span>•</span>
                              <span>{category}</span>
                              <span>•</span>
                              {userBadge(user)}
                            </div>
                          </div>

                          <div className={`shrink-0 text-[15px] font-semibold ${amountTone(amount)}`}>
                            {formatSignedMoney(amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>


          </div>
        )}
      </section>
      </>
    )}
    </main>
  );
}