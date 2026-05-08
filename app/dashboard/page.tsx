"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  normalizeAccountLabel,
  normalizeUserTag,
} from "@/lib/finance-labels";
import {
  formatAbsMoney,
  formatChartMoney,
  getCategoryEmoji,
  getMonthLabel,
  getMonthShort,
  getNormalizedAmount,
  parseDateMeta,
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
  balance: number | null;
  user_type: string | null;
  account_type: string | null;
  source_file?: string | null;
  created_at?: string | null;
};

type CategoryItem = {
  category: string;
  amount: number;
  percent: number;
  emoji: string;
  color: string;
  soft: string;
};

type MonthExpense = {
  ym: string;
  label: string;
  expense: number;
  count: number;
};

const CATEGORY_COLORS = [
  { color: "#14b8a6", soft: "rgba(20,184,166,0.12)" },
  { color: "#22c55e", soft: "rgba(34,197,94,0.12)" },
  { color: "#f59e0b", soft: "rgba(245,158,11,0.14)" },
  { color: "#60a5fa", soft: "rgba(96,165,250,0.14)" },
  { color: "#f472b6", soft: "rgba(244,114,182,0.14)" },
  { color: "#a78bfa", soft: "rgba(167,139,250,0.14)" },
] as const;

function getMonthFromRow(row: TransactionRow) {
  return parseDateMeta(row.tx_date)?.ym ?? "";
}

function matchesUserFilter(row: TransactionRow, filter: string) {
  if (filter === "all") return true;

  const normalized = normalizeUserTag(row.user_type) || "미지정";
  return normalized === filter;
}

function matchesCardFilter(row: TransactionRow, filter: string) {
  if (filter === "all") return true;

  const account = normalizeAccountLabel(row.account_type) || "미지정";
  const compact = account.replace(/\s/g, "");
  const lower = compact.toLowerCase();

  if (filter === "신한") return compact.includes("신한");
  if (filter === "국민") return compact.includes("국민") || compact.includes("KB");
  if (filter === "농협") return compact.includes("농협") || compact.includes("NH");
  if (filter === "현금") return compact.includes("현금") || lower.includes("cash");

  if (filter === "기타") {
    return !["신한", "국민", "kb", "농협", "nh", "현금", "cash"].some((key) => lower.includes(key.toLowerCase()));
  }

  return account === filter;
}



function amountTone(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-[#2a2112]";
}

function userBadge(user: string) {
  const normalized = normalizeUserTag(user) || user || "미지정";

  if (normalized === "짱구" || normalized.toLowerCase() === "zzangu") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jjanggu-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--jjanggu-text)]">
        <Image src="/icons/zzangu.png" alt="짱구" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-contain" />
        짱구
      </span>
    );
  }

  if (normalized === "기린") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--girin-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--girin-text)]">
        <img src="/icons/girin.png" alt="기린" className="h-3.5 w-3.5 object-contain" />
        기린
      </span>
    );
  }

  if (normalized === "공동") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#5c4a28] ring-1 ring-[#f2df9a]">
        <span>🤝</span>
        공동
      </span>
    );
  }

  return <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#5c4a28] ring-1 ring-[#f2df9a]">{normalized}</span>;
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

function SectionCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
      <div className="mb-5">
        <div className="text-[20px] font-black tracking-[-0.04em] text-[#2a2112]">{title}</div>
        {sub ? <div className="mt-1 text-[13px] font-semibold text-[#9b7d3e]">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone = "text-[#2a2112]",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-black text-[#9b7d3e]">{label}</div>
        {sub ? (
          <div className="truncate text-[11px] font-bold text-[#b08a2f]">{sub}</div>
        ) : null}
      </div>

      <div className={`mt-2 text-[22px] font-black tracking-[-0.05em] ${tone}`}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [budgetMap, setBudgetMap] = useState<Record<string, number>>({});
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const expensePathRef = useRef<SVGPathElement | null>(null);
  const [expenseHoverIdx, setExpenseHoverIdx] = useState<number | null>(null);
  const [optionIcons, setOptionIcons] = useState<OptionIconMap>({});

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
    
  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, tx_date, description, type, amount, balance, user_type, account_type, source_file, created_at")
          .order("tx_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (!active) return;

        if (error) {
          setRows([]);
          setErrorMessage(error.message);
        } else {
          setRows((data ?? []) as TransactionRow[]);
        }
      } catch (err) {
        if (!active) return;
        setRows([]);
        setErrorMessage(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("girin-dashboard-budget-map");

      if (saved) {
        setBudgetMap(JSON.parse(saved) as Record<string, number>);
      }
    } catch {
      setBudgetMap({});
    } finally {
      setBudgetLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!budgetLoaded) return;

    try {
      window.localStorage.setItem("girin-dashboard-budget-map", JSON.stringify(budgetMap));
    } catch {
      // localStorage 저장 실패는 화면 동작을 막지 않습니다.
    }
  }, [budgetMap, budgetLoaded]);

  const monthOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => getMonthFromRow(row)).filter(Boolean))).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  useEffect(() => {
    if (!monthFilter && monthOptions.length > 0) setMonthFilter(monthOptions[0]);
  }, [monthFilter, monthOptions]);

  useEffect(() => {
    if (!monthFilter) return;
    if (monthOptions.length === 0) return;
    if (!monthOptions.includes(monthFilter)) setMonthFilter(monthOptions[0]);
  }, [monthFilter, monthOptions]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const monthMatched = !monthFilter || getMonthFromRow(row) === monthFilter;
      return monthMatched && matchesUserFilter(row, userFilter) && matchesCardFilter(row, cardFilter);
    });
  }, [rows, monthFilter, userFilter, cardFilter]);

  const expenseRows = useMemo(() => filtered.filter((row) => getNormalizedAmount(row) < 0), [filtered]);
  const incomeRows = useMemo(() => filtered.filter((row) => getNormalizedAmount(row) > 0), [filtered]);

  const totalExpense = useMemo(() => expenseRows.reduce((acc, row) => acc + Math.abs(getNormalizedAmount(row)), 0), [expenseRows]);
  const totalIncome = useMemo(() => incomeRows.reduce((acc, row) => acc + getNormalizedAmount(row), 0), [incomeRows]);
  const netAmount = totalIncome - totalExpense;

  const cardExpense = useMemo(() => {
    return expenseRows.reduce((acc, row) => {
      const account = normalizeAccountLabel(row.account_type) || "미지정";
      if (!account.includes("카드")) return acc;
      return acc + Math.abs(getNormalizedAmount(row));
    }, 0);
  }, [expenseRows]);

  const categorySummary: CategoryItem[] = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of expenseRows) {
      const category = splitType(row.type).category || "기타";
      map.set(category, (map.get(category) ?? 0) + Math.abs(getNormalizedAmount(row)));
    }

    return Array.from(map.entries())
      .map(([category, amount], index) => ({
        category,
        amount,
        percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        emoji: getCategoryEmoji(category),
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length].color,
        soft: CATEGORY_COLORS[index % CATEGORY_COLORS.length].soft,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((item, index) => ({
        ...item,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length].color,
        soft: CATEGORY_COLORS[index % CATEGORY_COLORS.length].soft,
      }));
  }, [expenseRows, totalExpense]);

  const categoryKey = useMemo(() => {
    return categorySummary.map((item) => item.category).join("|");
  }, [categorySummary]);

  useEffect(() => {
    if (!activeCategory) return;

    const exists = categorySummary.some((item) => item.category === activeCategory);
    if (!exists) {
      setActiveCategory(null);
    }
  }, [activeCategory, categoryKey, categorySummary]);

  const activeSlice = categorySummary.find((item) => item.category === activeCategory) ?? categorySummary[0] ?? null;

  const userSummary = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of expenseRows) {
      const user = normalizeUserTag(row.user_type) || "미지정";
      map.set(user, (map.get(user) ?? 0) + Math.abs(getNormalizedAmount(row)));
    }

    return Array.from(map.entries())
      .map(([user, amount]) => ({
        user,
        amount,
        percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenseRows, totalExpense]);

  const accountSummary = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of expenseRows) {
      const account = normalizeAccountLabel(row.account_type) || "미지정";
      map.set(account, (map.get(account) ?? 0) + Math.abs(getNormalizedAmount(row)));
    }

    return Array.from(map.entries())
      .map(([account, amount]) => ({
        account,
        amount,
        percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [expenseRows, totalExpense]);

  const bigExpenseRows = useMemo(() => {
    return expenseRows
      .filter((row) => {
        if (!activeCategory) return true;
        return (splitType(row.type).category || "기타") === activeCategory;
      })
      .sort((a, b) => Math.abs(getNormalizedAmount(b)) - Math.abs(getNormalizedAmount(a)))
      .slice(0, 7);
  }, [expenseRows, activeCategory]);

  const recurringCandidates = useMemo(() => {
    const map = new Map<
      string,
      {
        description: string;
        category: string;
        months: Set<string>;
        count: number;
        totalAbs: number;
      }
    >();

    for (const row of rows) {
      if (!matchesUserFilter(row, userFilter) || !matchesCardFilter(row, cardFilter)) continue;
      if (getNormalizedAmount(row) >= 0) continue;

      const desc = (row.description ?? "").trim();
      if (!desc) continue;

      const meta = parseDateMeta(row.tx_date);
      if (!meta) continue;

      const category = splitType(row.type).category || "기타";
      const key = `${category}||${desc.toLowerCase()}`;

      if (!map.has(key)) {
        map.set(key, { description: desc, category, months: new Set<string>(), count: 0, totalAbs: 0 });
      }

      const current = map.get(key)!;
      current.months.add(meta.ym);
      current.count += 1;
      current.totalAbs += Math.abs(getNormalizedAmount(row));
    }

    return Array.from(map.values())
      .filter((item) => item.months.size >= 2 && item.count >= 2)
      .map((item) => ({
        description: item.description,
        category: item.category,
        months: item.months.size,
        avgAmount: Math.round(item.totalAbs / item.count),
      }))
      .sort((a, b) => b.months - a.months || b.avgAmount - a.avgAmount)
      .slice(0, 5);
  }, [rows, userFilter, cardFilter]);

  const recentExpenseRows = useMemo(() => {
    return [...expenseRows]
      .sort((a, b) => {
        const aDate = parseDateMeta(a.tx_date)?.iso ?? "";
        const bDate = parseDateMeta(b.tx_date)?.iso ?? "";
        if (aDate !== bDate) return aDate < bDate ? 1 : -1;
        const aCreated = a.created_at ?? "";
        const bCreated = b.created_at ?? "";
        return aCreated < bCreated ? 1 : -1;
      })
      .slice(0, 5);
  }, [expenseRows]);

  const monthlyExpenses: MonthExpense[] = useMemo(() => {
    const map = new Map<string, { expense: number; count: number }>();

    for (const row of rows) {
      if (!matchesUserFilter(row, userFilter) || !matchesCardFilter(row, cardFilter)) continue;

      const ym = getMonthFromRow(row);
      if (!ym) continue;

      const amount = getNormalizedAmount(row);
      if (amount >= 0) continue;

      const current = map.get(ym) ?? { expense: 0, count: 0 };
      current.expense += Math.abs(amount);
      current.count += 1;
      map.set(ym, current);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-6)
      .map(([ym, value]) => ({ ym, label: getMonthShort(ym), expense: value.expense, count: value.count }));
  }, [rows, userFilter, cardFilter]);

  const chartWidth = 620;
  const chartHeight = 320;
  const padX = 72;
  const topY = 18;
  const bottomY = 32;
  const innerHeight = chartHeight - topY - bottomY;
  const baseY = topY + innerHeight;

  const expenseValues = monthlyExpenses.map((item) => item.expense);
  const rawMin = Math.min(...expenseValues, 0);
  const rawMax = Math.max(...expenseValues, 1);
  const rangePadding = Math.max((rawMax - rawMin) * 0.18, rawMax * 0.08, 1);
  const chartMin = Math.max(0, rawMin - rangePadding);
  const chartMax = rawMax + rangePadding;
  const chartRange = Math.max(chartMax - chartMin, 1);

  const expensePoints = monthlyExpenses.map((item, index) => {
    const step =
      monthlyExpenses.length > 1
        ? (chartWidth - padX * 2) / (monthlyExpenses.length - 1)
        : 0;

    return {
      x: padX + step * index,
      y: baseY - ((item.expense - chartMin) / chartRange) * innerHeight,
    };
  });

  useEffect(() => {
    if (!expensePathRef.current) return;

    const length = expensePathRef.current.getTotalLength();

    expensePathRef.current.style.strokeDasharray = `${length}`;
    expensePathRef.current.style.strokeDashoffset = `${length}`;

    requestAnimationFrame(() => {
      expensePathRef.current!.style.transition = "stroke-dashoffset 0.45s ease-out";
      expensePathRef.current!.style.strokeDashoffset = "0";
    });
  }, [monthlyExpenses]);

  const userBase = Math.max(...userSummary.map((item) => item.amount), 1);
  const accountBase = Math.max(...accountSummary.map((item) => item.amount), 1);
  const largestExpense = bigExpenseRows[0] ? Math.abs(getNormalizedAmount(bigExpenseRows[0])) : 0;
  const avgExpense = expenseRows.length > 0 ? Math.round(totalExpense / expenseRows.length) : 0;
  const topCategory = categorySummary[0];
  const selectedBudget = monthFilter ? Number(budgetMap[monthFilter] ?? 0) : 0;
  const budgetRate = selectedBudget > 0 ? Math.round((totalExpense / selectedBudget) * 100) : 0;
  const budgetGap = selectedBudget - totalExpense;
const filterSummary = [
  getMonthLabel(monthFilter),
  userFilter !== "all" ? userFilter : null,
  cardFilter !== "all" ? cardFilter : null,
]
  .filter(Boolean)
  .join(" · ");

const activeFilterCount = [userFilter !== "all", cardFilter !== "all"].filter(Boolean).length;
const resetFilters = () => {
  setUserFilter("all");
  setCardFilter("all");
};
  const reportTitle = topCategory ? topCategory.category + " 중심 소비" : "분석할 지출 없음";
  const reportMessage = topCategory
    ? selectedBudget > 0
      ? budgetGap >= 0
        ? "예산 대비 " + formatAbsMoney(budgetGap) + " 여유가 있어요. " + topCategory.category + " 지출이 " + topCategory.percent + "%로 가장 큽니다."
        : "예산을 " + formatAbsMoney(Math.abs(budgetGap)) + " 초과했어요. " + topCategory.category + " 지출부터 점검하면 좋아요."
      : topCategory.category + " 지출이 전체의 " + topCategory.percent + "%로 가장 커요. 예산을 설정하면 초과 여부까지 바로 볼 수 있어요."
    : "선택한 조건에 지출 데이터가 없습니다.";

  const handleBudgetClick = () => {
    if (!monthFilter) return;

    const raw = window.prompt(
      getMonthLabel(monthFilter) + " 예산을 입력해 주세요.",
      selectedBudget > 0 ? String(selectedBudget) : ""
    );

    if (raw === null) return;

    const normalized = raw.replace(/[^0-9]/g, "");
    const nextBudget = Number(normalized);

    setBudgetMap((prev) => {
      const next = { ...prev };
      if (!nextBudget || nextBudget <= 0) delete next[monthFilter];
      else next[monthFilter] = nextBudget;
      return next;
    });
  };

  const donutSize = 188;
  const donutCenter = donutSize / 2;
  const donutRadius = 72;
  const donutStroke = 17;
  let currentAngle = 0;

  const filterButtonClass = (active: boolean, tone: "user" | "card") =>
    [
      "inline-flex h-8 min-w-[64px] items-center justify-center gap-1 rounded-[15px] border px-2 text-[11px] font-black transition-all duration-200 sm:h-10 sm:min-w-[82px] sm:gap-1.5 sm:rounded-[18px] sm:px-3 sm:text-[13px]",
      active
        ? tone === "user"
          ? "border-[#ffbf1f] bg-[#ffbf1f] text-[#2a2112] shadow-[0_10px_20px_rgba(255,191,31,0.20)]"
          : "border-[#14b8a6] bg-[#14b8a6] text-white shadow-[0_10px_20px_rgba(20,184,166,0.20)]"
        : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)]",
    ].join(" ");

  const filterIconClass =
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[9px] bg-white ring-1 ring-slate-200 sm:h-6 sm:w-6 sm:rounded-[10px]";
  return (
    <main className="min-h-screen bg-white pb-12">
      {loading ? (
        <section className="mx-auto flex min-h-[calc(100vh-74px)] max-w-6xl items-center justify-center px-6">
          <div className="w-full max-w-[420px] rounded-[34px] border border-[#f1d67a] bg-white p-8 text-center shadow-[0_24px_60px_rgba(139,92,0,0.12)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#fff1a8,#ffd84d,#ffbf1f)] text-[34px] shadow-[0_14px_28px_rgba(255,191,31,0.28)]">
              📊
            </div>
            <h1 className="mt-5 text-[24px] font-black tracking-[-0.04em] text-[#2a2112]">지출 분석 불러오는 중</h1>
            <p className="mt-2 text-sm font-semibold text-[#9a6800]">이번 달 소비 데이터를 정리하고 있어요</p>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#fff3bd]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#ffbf1f]" />
            </div>
          </div>
        </section>
      ) : (
        <>
        <section className="hidden bg-[linear-gradient(135deg,#fff1a8_0%,#ffd84d_52%,#ffbf1f_100%)] sm:block">
          <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-8">
            <div className="flex min-h-[34px] items-center sm:block sm:min-h-0 sm:py-2">
              <div>
                <div className="hidden items-center gap-2 rounded-full border border-white/30 bg-white/35 px-3 py-1.5 text-[11px] font-bold text-[#2a2112] sm:inline-flex">
                  <span>{getMonthLabel(monthFilter)} 지출 분석</span>
                  <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">
                    DASHBOARD
                  </span>
                </div>

                <div>
                  <h1 className="text-[20px] font-black tracking-[-0.045em] text-[#2a2112] sm:text-[38px]">
                    소비 흐름 대시보드
                  </h1>

                  <p className="mt-2 hidden text-[10px] font-medium leading-relaxed text-[#7a6335] sm:block sm:text-[14px]">
                    카테고리, 사용자, 결제수단별로 이번 달 지출을 한눈에 분석해요.
                  </p>

                  {/* 👇 홈 버튼 위치와 동일한 자리 */}
                  <div className="mt-3 hidden items-center justify-center gap-1.5 sm:mt-6 sm:flex sm:justify-start sm:gap-3">
                    
                    {/* 이전 */}
                    <button
                      type="button"
                      onClick={() => {
                        const idx = monthOptions.indexOf(monthFilter);
                        if (idx >= 0 && idx < monthOptions.length - 1) {
                          setMonthFilter(monthOptions[idx + 1]);
                        }
                      }}
                      disabled={!monthFilter || monthOptions.indexOf(monthFilter) >= monthOptions.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/30 text-sm font-black text-[#2a2112] transition hover:bg-white/50 disabled:opacity-30 sm:h-11 sm:w-11 sm:text-lg"
                    >
                      ◀
                    </button>

                    {/* 월 선택 */}
                    <div className="relative">
                      <select
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        className="h-7 appearance-none rounded-full border border-white/60 bg-white px-2.5 pr-7 text-[10px] font-black text-[#2a2112] shadow-sm outline-none cursor-pointer sm:h-11 sm:px-6 sm:pr-10 sm:text-sm"
                      >
                        {monthOptions.map((month) => (
                          <option key={month} value={month}>
                            {getMonthLabel(month)}
                          </option>
                        ))}
                      </select>

                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#7a6335]">
                        ▼
                      </div>
                    </div>

                    {/* 다음 */}
                    <button
                      type="button"
                      onClick={() => {
                        const idx = monthOptions.indexOf(monthFilter);
                        if (idx > 0) {
                          setMonthFilter(monthOptions[idx - 1]);
                        }
                      }}
                      disabled={!monthFilter || monthOptions.indexOf(monthFilter) <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/30 text-sm font-black text-[#2a2112] transition hover:bg-white/50 disabled:opacity-30 sm:h-11 sm:w-11 sm:text-lg"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                const idx = monthOptions.indexOf(monthFilter);
                if (idx >= 0 && idx < monthOptions.length - 1) setMonthFilter(monthOptions[idx + 1]);
              }}
              disabled={!monthFilter || monthOptions.indexOf(monthFilter) >= monthOptions.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm disabled:opacity-30"
            >◀</button>
            <div className="relative">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="h-9 appearance-none rounded-full border border-slate-200 bg-white px-5 pr-8 text-[12px] font-black text-[#7a6335] shadow-sm outline-none"
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>{getMonthLabel(month)}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#7a6335]">▼</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const idx = monthOptions.indexOf(monthFilter);
                if (idx > 0) setMonthFilter(monthOptions[idx - 1]);
              }}
              disabled={!monthFilter || monthOptions.indexOf(monthFilter) <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm disabled:opacity-30"
            >▶</button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
          <div className="flex items-center gap-2 rounded-[22px] border border-slate-200 bg-white px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <button
              type="button"
              onClick={() => setShowFilterSheet((v) => !v)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#ffd84d] px-3 text-[11px] font-black text-[#5f3f00] shadow-[0_8px_18px_rgba(255,191,31,0.22)]"
            >
              <span>☰</span>
              <span>필터</span>
              {activeFilterCount > 0 ? <span className="ml-0.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] text-[#8a5b00]">{activeFilterCount}</span> : null}
            </button>
            <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-slate-500">{filterSummary || "전체 조건"}</span>
            <button type="button" onClick={resetFilters} className="flex h-9 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-500 shadow-sm">초기화</button>
          </div>

          {showFilterSheet ? (
            <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/25 px-3 pb-4 pt-20 backdrop-blur-[2px] sm:hidden" onClick={() => setShowFilterSheet(false)}>
              <div className="max-h-[76vh] w-full overflow-y-auto rounded-[28px] border border-slate-100 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.22)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-black text-slate-800">필터</div>
                <button type="button" onClick={() => setShowFilterSheet(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-base font-black text-slate-500">×</button>
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="mb-1.5 text-[11px] font-black text-slate-400">사용자</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: "all", label: "전체", icon: "👥" },
                      { key: "기린", label: "기린", icon: "/icons/girin.png" },
                      { key: "짱구", label: "짱구", icon: "/icons/zzangu.png" },
                    ].map((user) => (
                      <button key={user.key} type="button" onClick={() => setUserFilter(user.key)} className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition ${userFilter === user.key ? "bg-[#ffd84d] text-[#5f3f00] shadow-sm ring-2 ring-[#ffbf1f]/35" : user.key === "all" ? "bg-[#fff4c7] text-[#8a5b00] ring-1 ring-[#f1d67a]" : "bg-slate-100 text-slate-500"}`}>
                        {user.icon.startsWith("/") ? <img src={user.icon} alt="" className="h-4 w-4 object-contain" /> : <span>{user.icon}</span>}
                        <span>{user.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-black text-slate-400">결제수단</div>
                  <div className="flex max-h-[170px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {[
                      { key: "all", label: "전체" },
                      { key: "신한", label: "신한" },
                      { key: "국민", label: "국민" },
                      { key: "농협", label: "농협" },
                      { key: "현금", label: "현금" },
                      { key: "기타", label: "기타" },
                    ].map((card) => {
                      const icon = card.key === "all" ? "💳" : resolveOptionIcon("accounts", card.label, optionIcons);
                      return (
                        <button key={card.key} type="button" onClick={() => setCardFilter(card.key)} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition ${cardFilter === card.key ? "bg-[#ffd84d] text-[#5f3f00] shadow-sm ring-2 ring-[#ffbf1f]/35" : card.key === "all" ? "bg-[#fff4c7] text-[#8a5b00] ring-1 ring-[#f1d67a]" : "bg-slate-100 text-slate-500"}`}>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/75">
                            {icon && isImageIcon(icon) ? <img src={icon} alt="" className="h-3.5 w-3.5 object-contain" /> : <span className="text-[12px]">{icon || card.label[0]}</span>}
                          </span>
                          <span>{card.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            </div>
          ) : null}
        </div>

        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-5">
          <div className="hidden min-w-0 flex-nowrap items-center gap-2 overflow-x-auto rounded-[22px] border border-slate-200 bg-white px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:flex sm:w-auto sm:flex-wrap sm:gap-5 sm:overflow-visible sm:rounded-[30px] sm:px-5 sm:py-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-[#9b7d3e]">사용자</span>

              <div className="inline-flex items-center gap-1 rounded-full bg-[#fff4c7] p-1 ring-1 ring-[#f0df9b]">
              {[
                { key: "all", label: "전체", icon: null },
                { key: "기린", label: "기린", icon: "/icons/girin.png" },
                { key: "짱구", label: "짱구", icon: "/icons/zzangu.png" },
              ].map((user) => (
                  <button
                    key={user.key}
                    type="button"
                    onClick={() => setUserFilter(user.key)}
                    className={filterButtonClass(userFilter === user.key, "user")}
                  >
                    {user.icon ? (
                      <span className={filterIconClass}>
                        <img src={user.icon} alt="" className="h-5 w-5 object-contain" />
                      </span>
                    ) : null}
                    <span>{user.label}</span>
                  </button>
                ))}
              </div>
            </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-black text-[#9b7d3e]">결제수단</span>

            <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#fff4c7] p-1 ring-1 ring-[#f0df9b]">
              {[
                { key: "all", label: "전체" },
                { key: "신한", label: "신한" },
                { key: "국민", label: "국민" },
                { key: "농협", label: "농협" },
                { key: "현금", label: "현금" },
                { key: "기타", label: "기타" },
              ].map((card) => {
                const icon =
                  card.key === "all"
                    ? ""
                    : resolveOptionIcon("accounts", card.label, optionIcons);

                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setCardFilter(card.key)}
                    className={filterButtonClass(cardFilter === card.key, "card")}
                  >
                    <span className={filterIconClass}>
                      {card.key === "all" ? (
                        <span>💳</span>
                      ) : icon && isImageIcon(icon) ? (
                        <img src={icon} alt="" className="h-4 w-4 object-contain" />
                      ) : icon ? (
                        <span className="text-[12px]">{icon}</span>
                      ) : (
                        <span className="text-[12px]">{card.label[0]}</span>
                      )}
                    </span>

                    <span>{card.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-4">
          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#fff4c7] px-3 py-1 text-[11px] font-black text-[#9b7d3e] ring-1 ring-[#f0df9b]">
                    소비 리포트
                  </span>
                  <span className="text-[12px] font-bold text-[#9b7d3e]">{filterSummary}</span>
                </div>

                <div className="mt-2 text-[22px] font-black tracking-[-0.04em] text-[#2a2112]">
                  {reportTitle}
                </div>
                <p className="mt-1 text-[13px] font-semibold text-[#7a6335]">{reportMessage}</p>
              </div>

              <div className="grid min-w-0 shrink-0 grid-cols-3 gap-2 sm:min-w-[460px]">
                <div className="min-w-0 rounded-[18px] bg-[#fff9df] px-3 py-3 ring-1 ring-[#f0df9b] sm:rounded-[22px] sm:px-4">
                  <div className="text-[11px] font-black text-[#9b7d3e]">지출</div>
                  <div className="mt-1 truncate text-[15px] font-black text-[#2a2112] sm:text-[17px]">{formatAbsMoney(totalExpense)}</div>
                </div>
                <div className="min-w-0 rounded-[18px] bg-[#fff9df] px-3 py-3 ring-1 ring-[#f0df9b] sm:rounded-[22px] sm:px-4">
                  <div className="text-[11px] font-black text-[#9b7d3e]">예산</div>
                  <div className="mt-1 truncate text-[15px] font-black text-[#2a2112] sm:text-[17px]">
                    {selectedBudget > 0 ? formatAbsMoney(selectedBudget) : "미설정"}
                  </div>
                </div>
                <div className="min-w-0 rounded-[18px] bg-[#fff9df] px-3 py-3 ring-1 ring-[#f0df9b] sm:rounded-[22px] sm:px-4">
                  <div className="text-[11px] font-black text-[#9b7d3e]">예산대비</div>
                  <div className={[
                    "mt-1 truncate text-[15px] font-black sm:text-[17px]",
                    selectedBudget > 0 && budgetGap < 0 ? "text-rose-600" : "text-emerald-600",
                  ].join(" ")}>
                    {selectedBudget > 0 ? budgetRate + "%" : "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#fff4c7] ring-1 ring-[#f0df9b]">
                <div
                  className={[
                    "h-full rounded-full transition-all",
                    selectedBudget > 0 && budgetGap < 0 ? "bg-rose-500" : "bg-[#14b8a6]",
                  ].join(" ")}
                  style={{ width: (selectedBudget > 0 ? Math.min(budgetRate, 100) : 0) + "%" }}
                />
              </div>

              <button
                type="button"
                onClick={handleBudgetClick}
                className="h-10 shrink-0 rounded-full border border-[#14b8a6] bg-[#14b8a6] px-4 text-[13px] font-black text-white shadow-[0_10px_20px_rgba(20,184,166,0.18)] transition hover:-translate-y-0.5"
              >
                예산 설정
              </button>
            </div>
          </div>
        </div>



          <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
            {errorMessage ? (
              <div className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-600">
                {errorMessage}
              </div>
            ) : null}

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <SectionCard title="최근 6개월 지출 트렌드" sub="월별 지출 흐름을 확인해요">
            <div className="rounded-[22px] bg-slate-50 px-2 py-1 ring-1 ring-slate-200 sm:rounded-[26px] sm:px-4 sm:py-3">
              {monthlyExpenses.length === 0 ? (
                <div className="py-16 text-center text-sm font-bold text-[#9b7d3e]">
                  표시할 지출 데이터가 없습니다.
                </div>
              ) : (
<svg
  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
  className="h-[190px] w-full overflow-visible sm:h-[300px]"
>
  {[0, 0.25, 0.5, 0.75, 1].map((rate) => {
    const y = baseY - rate * innerHeight;
    const value = chartMin + chartRange * rate;

    return (
      <g key={rate}>
        <line
          x1={padX}
          x2={chartWidth - padX}
          y1={y}
          y2={y}
          stroke="#e5e7eb"
          strokeWidth="1"
          strokeDasharray="4 6"
        />

        {rate > 0 ? (
          <text
            x={padX - 10}
            y={y + 4}
            textAnchor="end"
            className="fill-slate-400 text-[10px] font-bold"
          >
            {formatChartMoney(value)}
          </text>
        ) : null}
      </g>
    );
  })}

  <path
    ref={expensePathRef}
    d={buildSmoothPath(expensePoints)}
    fill="none"
    stroke="#14b8a6"
    strokeWidth="5"
    strokeLinecap="round"
  />

  {expensePoints.map((point, index) => {
    const item = monthlyExpenses[index];

    return (
      <g
        key={item.ym}
        onMouseEnter={() => setExpenseHoverIdx(index)}
        onMouseLeave={() => setExpenseHoverIdx(null)}
        className="cursor-pointer"
      >
        <circle cx={point.x} cy={point.y} r="6" fill="#14b8a6" />
        <circle cx={point.x} cy={point.y} r="22" fill="transparent" pointerEvents="all" />
      </g>
    );
  })}

  {expenseHoverIdx !== null &&
    (() => {
      const point = expensePoints[expenseHoverIdx];
      const item = monthlyExpenses[expenseHoverIdx];

      const tooltipW = 172;
      const tooltipH = 52;
      const tooltipX = Math.min(
        Math.max(point.x - tooltipW / 2, 8),
        chartWidth - tooltipW - 8
      );
      const tooltipY = Math.max(point.y - tooltipH - 18, 8);

      return (
        <g>
          <rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipW}
            height={tooltipH}
            rx="14"
            fill="#111827"
          />

          <text
            x={tooltipX + tooltipW / 2}
            y={tooltipY + 24}
            textAnchor="middle"
            className="fill-white text-[16px] font-black"
          >
            {formatAbsMoney(item.expense)}
          </text>

          <text
            x={tooltipX + tooltipW / 2}
            y={tooltipY + 42}
            textAnchor="middle"
            className="fill-gray-300 text-[13px] font-bold"
          >
            {item.label} · {item.count}건
          </text>
        </g>
      );
    })()}

  {expensePoints.map((point, index) => {
    const item = monthlyExpenses[index];

    return (
      <text
        key={`month-${item.ym}`}
        x={point.x}
        y={chartHeight - 10}
        textAnchor={
          index === 0 ? "start" : index === expensePoints.length - 1 ? "end" : "middle"
        }
        className="fill-slate-500 text-[12px] font-black"
      >
        {item.label}
      </text>
    );
  })}
</svg>
              )}
            </div>
          </SectionCard>

          <SectionCard title="결제수단별 지출현황" sub="선택 월 기준 결제수단 비중">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 rounded-full border border-[#f0df9b] bg-[#fff4c7] px-4 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[12px] font-black text-[#2a2112] ring-1 ring-[#f0df9b]">
                    ∑
                  </span>
                  <span className="truncate text-[13px] font-black text-[#2a2112]">
                    전체
                  </span>
                </div>

                <span className="shrink-0 text-[15px] font-black text-[#2a2112]">
                  {formatAbsMoney(totalExpense)}
                </span>
              </div>

              {accountSummary.length === 0 ? (
                <div className="rounded-full bg-[#fff9df] px-4 py-2 text-[12px] font-bold text-[#7a6335]">
                  결제수단 데이터가 없습니다.
                </div>
              ) : (
accountSummary.map((item) => {
  const accountName = item.account;
  const accountIcon = resolveOptionIcon("accounts", accountName, optionIcons);

  return (
    <div
      key={item.account}
      className="flex items-center justify-between gap-3 rounded-full bg-[#fff9df] px-4 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#f0df9b]">
          {accountIcon ? (
            isImageIcon(accountIcon) ? (
              <img src={accountIcon} alt="" className="h-[18px] w-[18px] object-contain" />
            ) : (
              <span className="text-[12px]">{accountIcon}</span>
            )
          ) : (
            <span className="text-[12px] font-black text-[#2a2112]">
              {accountName[0]}
            </span>
          )}
        </span>

        <span className="truncate text-[13px] font-black text-[#2a2112]">
          {accountName}
        </span>
      </div>

      <span className="shrink-0 text-[14px] font-black text-[#2a2112]">
        {formatAbsMoney(item.amount)}
      </span>
    </div>
  );
})
              )}
            </div>
          </SectionCard>
        </div>

            <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <SectionCard
                title="카테고리 소비 분석"
                sub="이번 달 지출이 어디에 몰렸는지 한눈에 확인해요"
              >
                <div className="space-y-3">
                  {categorySummary.length === 0 ? (
                    <div className="rounded-[22px] bg-[#fff9df] px-4 py-4 text-sm font-bold text-[#9b7d3e]">
                      카테고리 데이터가 없습니다.
                    </div>

                    
                  ) : (
                    <>
                      <button
                          type="button"
                          onClick={() => setActiveCategory(null)}
                          className="mb-2 w-full rounded-[18px] bg-[#fff4c7] px-4 py-3 ring-1 ring-[#f0df9b]"
                        >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[16px] font-black text-[#2a2112]">전체</span>
                          </div>

                          <span className="text-[14px] font-black text-[#2a2112]">
                            {formatAbsMoney(totalExpense)}
                          </span>
                        </div>
                      </button>

                      {categorySummary.map((item, index) => {
                        const selected = activeCategory === item.category;

                        return (
                          <button
                            key={item.category}
                            type="button"
                            onClick={() => setActiveCategory(item.category)}
                            className={[
                              "w-full rounded-[18px] px-4 py-3 text-left transition",
                              selected
                              ? "bg-[#fff4c7] ring-1 ring-[#f0df9b]"
                              : "bg-[#fff9df] hover:bg-[#fff4c7]"
                            ].join(" ")}
                          >
                    <div className="grid grid-cols-[86px_1fr_94px] items-center gap-2 sm:grid-cols-[140px_1fr_120px] sm:gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[18px]">{item.emoji}</span>
                        <span className="truncate text-[13px] font-black text-[#2a2112] sm:text-[14px]">{item.category}</span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-[#dff6f2]">
                        <div
                          className="h-full min-w-[6px] rounded-full bg-[#14b8a6]"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>

                      <span className="text-right text-[13px] font-black text-[#2a2112] sm:text-[14px]">
                        {formatAbsMoney(item.amount)}
                      </span>
                    </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title={activeCategory ? `${activeCategory} TOP 7` : "소비별 TOP 7"}
                sub={activeCategory ? "선택한 카테고리 내 상위 지출" : "선택 조건 기준으로 금액이 큰 지출"}
              >
                <div className="space-y-3">
                  {bigExpenseRows.length === 0 ? (
                    <div className="rounded-[22px] bg-[#fff9df] px-4 py-4 text-sm font-bold text-[#9b7d3e]">
                      지출 데이터가 없습니다.
                    </div>
                  ) : (
                        bigExpenseRows.slice(0, 7).map((row, index) => {
                          const meta = splitType(row.type);
                          const amount = Math.abs(getNormalizedAmount(row));
                          const width = largestExpense > 0 ? (amount / largestExpense) * 100 : 0;
                          const percentOfGroup = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
                          const category = meta.category || "기타";

                          const userName = normalizeUserTag(row.user_type) || "미지정";
                          const userIcon = resolveOptionIcon("users", userName, optionIcons);

                          const accountName = normalizeAccountLabel(row.account_type) || "미지정";
                          const accountIcon = resolveOptionIcon("accounts", accountName, optionIcons);

                          return (
                            <div
                              key={row.id}
                              className={[
                                "w-full rounded-[18px] px-3 py-2 text-left transition sm:rounded-[20px] sm:px-4 sm:py-2.5",
                                index === 0
                                  ? "bg-[linear-gradient(135deg,#fff4c7,#fff9df)] ring-1 ring-[#f0df9b]"
                                  : "bg-[#fff9df]",
                              ].join(" ")}
                            >
                              <div className="space-y-1.5">
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#b08a2f] ring-1 ring-[#f0df9b]">
                                      TOP {index + 1}
                                    </span>
                                    <span className="truncate text-[13px] font-black leading-tight text-[#2a2112] sm:text-[15px]">
                                      {row.description || "-"}
                                    </span>
                                  </div>

                                  <span className="shrink-0 whitespace-nowrap text-[15px] font-black text-rose-600 sm:text-[18px]">
                                    -{formatAbsMoney(amount)}
                                  </span>
                                </div>

                                <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] font-bold text-[#9b7d3e] sm:text-[11px]">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="shrink-0">{parseDateMeta(row.tx_date)?.display ?? row.tx_date ?? "-"}</span>

                                    {userIcon ? (
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#f0df9b]">
                                        {isImageIcon(userIcon) ? (
                                          <img src={userIcon} alt={userName} className="h-3.5 w-3.5 object-contain" />
                                        ) : (
                                          <span className="text-[12px]">{userIcon}</span>
                                        )}
                                      </span>
                                    ) : null}
                                    <span className="shrink-0">{userName}</span>

                                    <span className="flex min-w-0 items-center gap-1">
                                      {accountIcon ? (
                                        isImageIcon(accountIcon) ? (
                                          <img src={accountIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                                        ) : (
                                          <span className="shrink-0 text-[13px]">{accountIcon}</span>
                                        )
                                      ) : (
                                        <span className="shrink-0">{accountName[0]}</span>
                                      )}
                                      <span className="max-w-[58px] truncate font-bold text-[#9b7d3e]">
                                        {accountName}
                                      </span>
                                    </span>
                                  </div>

                                  <span className="shrink-0">그룹 {percentOfGroup}%</span>
                                </div>
                              </div>                            </div>
                          );
                        })                  
                  )}
                </div>
              </SectionCard>
              <div className="xl:col-span-2">
<SectionCard
  title="정기지출 / 고정비"
  sub="반복되는 지출을 빠르게 확인"
>
  <div className="grid gap-5 lg:grid-cols-2">
    {/* 1컬럼: 정기지출 */}
    <div>
      <div className="mb-3 text-[14px] font-black text-[#2a2112]">
        정기지출
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 rounded-full border border-[#f0df9b] bg-[#fff4c7] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-black text-[#2a2112] ring-1 ring-[#f0df9b]">
              ∑
            </span>
            <span className="text-[13px] font-black text-[#2a2112]">
              전체
            </span>
          </div>

          <span className="text-[14px] font-black text-[#2a2112]">
            {formatAbsMoney(
              recurringCandidates.reduce((acc, cur) => acc + cur.avgAmount, 0)
            )}
          </span>
        </div>

        {recurringCandidates.length === 0 ? (
          <div className="rounded-full bg-[#fff9df] px-4 py-2 text-[12px] font-bold text-[#7a6335]">
            정기지출 후보 없음
          </div>
        ) : (
          recurringCandidates.map((item, idx) => (
            <div
              key={`fixed-${idx}`}
              className="flex items-center justify-between gap-3 rounded-full bg-[#fff9df] px-4 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-black text-[#2a2112] ring-1 ring-[#f0df9b]">
                  {item.months}
                </span>

                <span className="truncate text-[13px] font-black text-[#2a2112]">
                  {item.description}
                </span>
              </div>

              <span className="text-[14px] font-black text-[#2a2112]">
                {formatAbsMoney(item.avgAmount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>

    {/* 2컬럼: 할부 */}
    <div>
      <div className="mb-3 text-[14px] font-black text-[#2a2112]">
        할부
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 rounded-full border border-[#f0df9b] bg-[#fff4c7] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-black text-[#2a2112] ring-1 ring-[#f0df9b]">
              ∑
            </span>
            <span className="text-[13px] font-black text-[#2a2112]">
              전체
            </span>
          </div>

          <span className="text-[14px] font-black text-[#2a2112]">
            0원
          </span>
        </div>

        <div className="rounded-full bg-[#fff9df] px-4 py-2 text-[12px] font-bold text-[#7a6335]">
          할부 후보 없음
        </div>
      </div>
    </div>
  </div>
</SectionCard>
</div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
