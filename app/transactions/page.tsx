"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import {
  formatSignedMoney,
  getNormalizedAmount,
  isoToShortDate,
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
  balance: number | null;
  user_type: string | null;
  account_type: string | null;
  source_file?: string | null;
  created_at?: string | null;
};

type EditForm = {
  id: string | number;
  tx_date: string;
  description: string;
  type: string;
  amount: string;
  balance: string;
  user_type: string;
  account_type: string;
};
function formatNumberWithComma(value: string | number) {
  const num = String(value).replace(/,/g, "");
  if (!num) return "";
  return Number(num).toLocaleString();
}

function formatCompactWon(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(abs % 100000000 === 0 ? 0 : 1)}억`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString()}만`;
  return `${sign}${abs.toLocaleString()}`;
}


function formatTxDateTime(row: TransactionRow) {
  const date = parseShortDate(row.tx_date)?.display ?? row.tx_date ?? "-";

  if (!row.created_at) return date;

  const d = new Date(row.created_at);
  if (Number.isNaN(d.getTime())) return date;

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${date} ${hh}:${mm}`;
}



function formatSignedAmount(value: number) {
  return formatSignedMoney(value);
}

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  return {
    year: y,
    month: `${Number(m)}월`,
  };
}

function parseNullableNumber(value: string) {
  const cleaned = value.replace(/[,\s원₩]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}



function getDisplayAccount(value: string | null) {
  return normalizeAccountLabel(value) || "미지정";
}


function getAmountTone(amount: number) {
  if (amount < 0) return "text-rose-500";
  if (amount > 0) return "text-sky-500";
  return "text-slate-400";
}

function getTypeTone(value: string | null) {
  const v = (value ?? "").trim();
  if (v.includes("지출")) return "bg-rose-100 text-rose-500";
  if (v.includes("수입")) return "bg-violet-100 text-violet-500";
  if (v.includes("입금")) return "bg-sky-100 text-sky-600";
  if (v.includes("출금")) return "bg-amber-100 text-amber-600";
  return "bg-slate-100 text-slate-500";
}

function getCategoryTone(value: string) {
  const v = value.trim();
  if (v === "식대") return "bg-orange-100 text-orange-600";
  if (v === "카페") return "bg-amber-100 text-amber-700";
  if (v === "장보기") return "bg-emerald-100 text-emerald-600";
  if (v === "생활") return "bg-cyan-100 text-cyan-700";
  if (v === "교통") return "bg-sky-100 text-sky-700";
  if (v === "쇼핑") return "bg-fuchsia-100 text-fuchsia-600";
  if (v === "여가") return "bg-violet-100 text-violet-600";
  if (v === "병원") return "bg-rose-100 text-rose-600";
  if (v === "보험") return "bg-indigo-100 text-indigo-600";
  if (v === "자동이체") return "bg-lime-100 text-lime-700";
  if (v === "금융") return "bg-slate-200 text-slate-700";
  if (v === "주거") return "bg-teal-100 text-teal-700";
  return "bg-slate-100 text-slate-500";
}

function getAccountTone(value: string | null) {
  const v = (value ?? "").trim();
  if (v.includes("카드")) return "bg-violet-100 text-violet-500";
  if (v.includes("현금")) return "bg-yellow-100 text-yellow-700";
  if (v.includes("계좌")) return "bg-emerald-100 text-emerald-600";
  return "bg-slate-100 text-slate-500";
}

function makeEditForm(row: TransactionRow): EditForm {
  return {
    id: row.id,
    tx_date: parseShortDate(row.tx_date)?.iso ?? "",
    description: row.description ?? "",
    type: row.type ?? "",
    amount: row.amount !== null && row.amount !== undefined ? String(row.amount) : "",
    balance: row.balance !== null && row.balance !== undefined ? String(row.balance) : "",
    user_type: normalizeUserTag(row.user_type ?? ""),
    account_type: normalizeAccountLabel(row.account_type ?? ""),
  };
}
function getEditSignedAmount(editing: EditForm) {
  const typeMeta = splitType(editing.type);
  const raw = Number(editing.amount || 0);

  if ((typeMeta.flow === "지출" || editing.type.startsWith("지출/")) && raw > 0) {
    return -raw;
  }

  if ((typeMeta.flow === "수입" || editing.type.startsWith("수입/")) && raw < 0) {
    return Math.abs(raw);
  }

  return raw;
}

function getTypeFlowOptions(typeOptions: string[]) {
  return Array.from(
    new Set(
      typeOptions
        .map((type) => splitType(type).flow)
        .filter(Boolean)
    )
  );
}

function getTypeCategoryOptions(typeOptions: string[], flow: string) {
  return Array.from(
    new Set(
      typeOptions
        .filter((type) => splitType(type).flow === flow)
        .map((type) => splitType(type).category)
        .filter(Boolean)
    )
  );
}
export default function TransactionsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [monthFilter, setMonthFilter] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [openFilterPanel, setOpenFilterPanel] = useState<"user" | "card" | "category" | null>(null);

  const [editing, setEditing] = useState<EditForm | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
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
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("tx_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
    } else {
      setRows((data ?? []) as TransactionRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const monthOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => parseShortDate(r.tx_date)?.ym)
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  useEffect(() => {
    if (!monthFilter && monthOptions.length > 0) {
      setMonthFilter(monthOptions[0]);
    }
  }, [monthFilter, monthOptions]);

  useEffect(() => {
    if (!monthFilter) return;
    if (monthOptions.length === 0) return;
    if (!monthOptions.includes(monthFilter)) {
      setMonthFilter(monthOptions[0]);
    }
  }, [monthFilter, monthOptions]);

  const userOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => normalizeUserTag(r.user_type))
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);
  const renderIcon = (
    group: "users" | "accounts" | "categories",
    value: string,
    className = "h-4 w-4 object-contain"
  ) => {
    const icon = resolveOptionIcon(group, value, optionIcons);

    if (!icon) return <span className="text-xs">•</span>;

    if (isImageIcon(icon)) {
      return <img src={icon} alt="" className={className} />;
    }

    return <span className="text-[13px] leading-none">{icon}</span>;
  };
  const accountOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => getDisplayAccount(r.account_type))
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const cardOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => getDisplayAccount(r.account_type))
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((r) => splitType(r.type).category)
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const typeOptions = useMemo(() => {
    const defaults = ["지출/기타", "수입/기타", "입금", "출금"];
    const dynamic = rows.map((r) => r.type).filter((v): v is string => Boolean(v));
    return Array.from(new Set([...defaults, ...dynamic]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((r) => {
      const parsed = parseShortDate(r.tx_date);
      const ym = parsed?.ym ?? "";
      const typeMeta = splitType(r.type);
      const cardLabel = getDisplayAccount(r.account_type);

      if (monthFilter && ym !== monthFilter) return false;
      if (selectedDateFilter && parsed?.iso !== selectedDateFilter) return false;
      if (userFilter !== "all" && normalizeUserTag(r.user_type) !== userFilter) return false;
      if (accountFilter !== "all" && getDisplayAccount(r.account_type) !== accountFilter) return false;
      if (categoryFilter !== "all" && typeMeta.category !== categoryFilter) return false;
      if (cardFilter !== "all" && cardLabel !== cardFilter) return false;

      if (q) {
        const target = [
          r.description ?? "",
          r.type ?? "",
          typeMeta.flow,
          typeMeta.category,
          normalizeUserTag(r.user_type),
          getDisplayAccount(r.account_type),
          cardLabel,
          r.tx_date ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!target.includes(q)) return false;
      }

      return true;
    });
  }, [rows, monthFilter, userFilter, accountFilter, categoryFilter, cardFilter, search, selectedDateFilter]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, TransactionRow[]>();

    for (const row of filtered) {
      const parsed = parseShortDate(row.tx_date);
      const key = parsed?.display ?? row.tx_date ?? "날짜 없음";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    const toSortableValue = (dateText: string) => {
      const dotMatch = dateText.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
      if (dotMatch) {
        return Number(`${dotMatch[1]}${dotMatch[2]}${dotMatch[3]}`);
      }

      const shortMatch = dateText.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
      if (shortMatch) {
        return Number(`20${shortMatch[1]}${shortMatch[2]}${shortMatch[3]}`);
      }

      const isoMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        return Number(`${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`);
      }

      return 0;
    };

    return Array.from(map.entries())
      .map(([date, items]) => {
        const total = items.reduce((sum, item) => sum + getNormalizedAmount(item), 0);

        const sortedItems = [...items].sort((a, b) => {
          const aDate = parseShortDate(a.tx_date)?.iso ?? "";
          const bDate = parseShortDate(b.tx_date)?.iso ?? "";
          if (aDate !== bDate) return aDate < bDate ? 1 : -1;

          const aCreated = a.created_at ?? "";
          const bCreated = b.created_at ?? "";
          return aCreated < bCreated ? 1 : -1;
        });

        return { date, items: sortedItems, total };
      })
      .sort((a, b) => toSortableValue(b.date) - toSortableValue(a.date));
  }, [filtered]);

  const totalExpense = useMemo(() => {
    return filtered
      .map((r) => getNormalizedAmount(r))
      .filter((amount) => amount < 0)
      .reduce((sum, amount) => sum + Math.abs(amount), 0);
  }, [filtered]);

  const totalIncome = useMemo(() => {
    return filtered
      .map((r) => getNormalizedAmount(r))
      .filter((amount) => amount > 0)
      .reduce((sum, amount) => sum + amount, 0);
  }, [filtered]);
  const total = totalIncome - totalExpense;
  const calendarDays = useMemo(() => {
    if (!monthFilter) return [];

    const [year, month] = monthFilter.split("-").map(Number);
    if (!year || !month) return [];

    const firstDay = new Date(year, month - 1, 1);
    const lastDate = new Date(year, month, 0).getDate();
    const startWeekday = firstDay.getDay();

    const dailyMap = new Map<
      string,
      { income: number; expense: number; total: number }
    >();

    for (const row of rows) {
      const parsed = parseShortDate(row.tx_date);
      if (!parsed || parsed.ym !== monthFilter) continue;

      const key = parsed.iso;
      const amount = getNormalizedAmount(row);

      if (!dailyMap.has(key)) {
        dailyMap.set(key, { income: 0, expense: 0, total: 0 });
      }

      const current = dailyMap.get(key)!;
      if (amount > 0) current.income += amount;
      if (amount < 0) current.expense += Math.abs(amount);
      current.total += amount;
    }

    const cells: Array<{
      date: string;
      day: number;
      income: number;
      expense: number;
      total: number;
      isEmpty?: boolean;
    }> = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({
        date: "",
        day: 0,
        income: 0,
        expense: 0,
        total: 0,
        isEmpty: true,
      });
    }

    for (let day = 1; day <= lastDate; day++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const daily = dailyMap.get(iso) ?? { income: 0, expense: 0, total: 0 };

      cells.push({
        date: iso,
        day,
        income: daily.income,
        expense: daily.expense,
        total: daily.total,
      });
    }

    return cells;
  }, [rows, monthFilter]);



  const calendarSummary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const row of rows) {
      const parsed = parseShortDate(row.tx_date);
      if (!parsed || parsed.ym !== monthFilter) continue;

      const amount = getNormalizedAmount(row);

      if (amount > 0) income += amount;
      if (amount < 0) expense += Math.abs(amount);
    }

    return { income, expense };
  }, [rows, monthFilter]);
  const currentMonthIndex = monthOptions.findIndex((m) => m === monthFilter);

  const moveMonth = (direction: "prev" | "next") => {
    if (currentMonthIndex < 0) return;

    if (direction === "prev" && currentMonthIndex < monthOptions.length - 1) {
      setMonthFilter(monthOptions[currentMonthIndex + 1]);
    }

    if (direction === "next" && currentMonthIndex > 0) {
      setMonthFilter(monthOptions[currentMonthIndex - 1]);
    }
  };

  const monthLabel = monthFilter
    ? formatMonthLabel(monthFilter)
    : { year: "", month: "전체" };

  const activeFilterCount = [
    userFilter !== "all",
    cardFilter !== "all",
    categoryFilter !== "all",
    Boolean(search.trim()),
    Boolean(selectedDateFilter),
  ].filter(Boolean).length;

  const filterSummary = [
    userFilter !== "all" ? userFilter : null,
    cardFilter !== "all" ? cardFilter : null,
    categoryFilter !== "all" ? categoryFilter : null,
    selectedDateFilter ? "날짜" : null,
    search.trim() ? "검색" : null,
  ].filter(Boolean).join(" · ");

  const resetFilters = () => {
    setUserFilter("all");
    setAccountFilter("all");
    setCardFilter("all");
    setCategoryFilter("all");
    setSearch("");
    setSelectedDateFilter(null);
    setOpenFilterPanel(null);
  };

  const openEdit = (row: TransactionRow) => {
    setEditing(makeEditForm(row));
  };

  const closeEdit = () => {
    if (saveLoading || deleteLoading) return;
    setEditing(null);
  };

  const handleEditChange = (key: keyof EditForm, value: string) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!editing) return;

    setSaveLoading(true);
    setErrorMessage("");

    const payload = {
      tx_date: editing.tx_date ? isoToShortDate(editing.tx_date) : null,
      description: editing.description.trim() || null,
      type: editing.type.trim() || null,
      amount: parseNullableNumber(editing.amount),
      balance: parseNullableNumber(editing.balance),
      user_type: normalizeUserTag(editing.user_type.trim() || null) || null,
      account_type: normalizeAccountLabel(editing.account_type.trim() || null) || null,
    };

    const { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", editing.id);

    setSaveLoading(false);

    if (error) {
      setErrorMessage(`저장 실패: ${error.message}`);
      return;
    }

    setEditing(null);
    await fetchData();
  };

  const handleDelete = async () => {
    if (!editing) return;
    const ok = window.confirm("이 내역을 삭제할까요?");
    if (!ok) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", editing.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`삭제 실패: ${error.message}`);
      return;
    }

    setEditing(null);
    await fetchData();
  };

  return (
    <div className="min-h-screen bg-white">
      <section className="relative bg-[linear-gradient(135deg,#3ec7c1_0%,#2fb3ad_100%)]">
        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="absolute right-4 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/35 text-[15px] shadow-sm ring-1 ring-white/45 backdrop-blur transition hover:bg-white/50 sm:right-6 sm:top-5 sm:h-10 sm:w-10 sm:text-[18px]"
          aria-label="달력 보기"
        >
          📅
        </button>
        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-8">
          <div className="py-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/35 px-2.5 py-1 text-[10px] font-bold text-[#063f3a]">
              <span>
                {monthFilter ? `${monthLabel.year}년 ${monthLabel.month}` : "월 선택"} 거래내역
              </span>
              <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">
                TRANSACTION
              </span>
            </div>

            <div className="mt-3">
              <h1 className="text-[24px] font-black tracking-[-0.055em] text-white sm:text-[38px]">
                기린 · 짱구 거래내역
              </h1>

              <p className="mt-1.5 text-[9px] font-medium leading-relaxed sm:text-[14px] text-white/80">
                업로드된 카드·계좌 내역을 월별로 확인하고 상세 거래를 정리해요.
              </p>

              <div className="mt-2 flex items-center gap-1.5 sm:mt-6 sm:gap-3">
                <button
                  type="button"
                  onClick={() => moveMonth("prev")}
                  disabled={currentMonthIndex >= monthOptions.length - 1 || currentMonthIndex < 0}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/30 text-sm font-black text-white transition hover:bg-white/50 disabled:opacity-30 sm:h-11 sm:w-11 sm:text-lg"
                >
                  ◀
                </button>

                <div className="relative">
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="h-7 appearance-none rounded-full border border-white/60 bg-white px-2.5 pr-7 text-[10px] font-black text-[#0f766e] shadow-sm outline-none cursor-pointer sm:h-11 sm:px-6 sm:pr-10 sm:text-sm"
                  >
                    {monthOptions.map((month) => {
                      const label = formatMonthLabel(month);
                      return (
                      <option key={month} value={month}>
                        {label.year}년 {label.month}
                      </option>
                      );
                    })}
                  </select>

                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#0f766e]">
                    ▼
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => moveMonth("next")}
                  disabled={currentMonthIndex <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/30 text-sm font-black text-white transition hover:bg-white/50 disabled:opacity-30 sm:h-11 sm:w-11 sm:text-lg"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>
        </div>
</section>
<div className="border-b border-slate-100 bg-white">
  <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-4">
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setShowFilterSheet((v) => !v);
          setOpenFilterPanel(null);
        }}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#21bdb7] px-3 text-[11px] font-black text-white shadow-[0_8px_18px_rgba(33,189,183,0.22)] sm:h-10 sm:px-4 sm:text-sm"
      >
        <span>☰</span>
        <span>필터</span>
        {activeFilterCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] text-[#0f766e]">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <span className="truncate text-[11px] font-extrabold text-slate-500 sm:text-sm">
          {filterSummary || "전체 조건"}
        </span>
      </div>

      <button
        type="button"
        onClick={resetFilters}
        className="flex h-9 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-500 shadow-sm sm:h-10 sm:text-sm"
      >
        초기화
      </button>
    </div>

    <div className="mt-2 flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 shadow-sm sm:h-10 sm:px-4">
      <span className="text-sm text-slate-400">🔍</span>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="거래명 검색"
        className="w-full min-w-0 flex-1 bg-transparent text-[12px] font-bold text-slate-600 outline-none placeholder:text-slate-300 sm:text-sm"
      />
    </div>

    {showFilterSheet ? (
      <div className="mt-2 rounded-[24px] border border-slate-100 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,0.08)] sm:p-4">
        <div className="grid gap-3">
          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">사용자</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { key: "all", label: "전체", icon: "👥" },
                { key: "기린", label: "기린", icon: "/icons/girin.png" },
                { key: "짱구", label: "짱구", icon: "/icons/zzangu.png" },
              ].map((user) => (
                <button
                  key={user.key}
                  type="button"
                  onClick={() => setUserFilter(user.key)}
                  className={`flex h-9 items-center justify-center gap-1 rounded-full text-[11px] font-black transition ${
                    userFilter === user.key
                      ? "bg-[#21bdb7] text-white shadow-sm"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {user.icon.startsWith("/") ? (
                    <img src={user.icon} className="h-4 w-4 object-contain" />
                  ) : (
                    <span>{user.icon}</span>
                  )}
                  <span>{user.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">결제수단</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCardFilter("all")}
                className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-black transition ${
                  cardFilter === "all" ? "bg-[#21bdb7] text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                💳 전체
              </button>
              {cardOptions.map((card) => (
                <button
                  key={card}
                  type="button"
                  onClick={() => setCardFilter(card)}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-black transition ${
                    cardFilter === card ? "bg-[#21bdb7] text-white" : "bg-[#effffe] text-[#0f766e]"
                  }`}
                >
                  {renderIcon("accounts", card, "h-4 w-4 object-contain")}
                  {card}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">카테고리</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`h-9 shrink-0 rounded-full px-3 text-[11px] font-black transition ${
                  categoryFilter === "all" ? "bg-[#21bdb7] text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                전체
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`h-9 shrink-0 rounded-full px-3 text-[11px] font-black transition ${
                    categoryFilter === category ? "bg-[#21bdb7] text-white" : "bg-[#fff7d6] text-[#8a5b00]"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {selectedDateFilter ? (
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="h-9 rounded-full bg-rose-50 px-3 text-[11px] font-black text-rose-500"
            >
              날짜 필터 해제 · {selectedDateFilter}
            </button>
          ) : null}
        </div>
      </div>
    ) : null}
  </div>
</div>

<main className="bg-[#f6fbfb] px-4 pt-5 sm:px-6 sm:pt-8">
        {errorMessage ? (
          <div className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[17px] font-extrabold text-[#11b5b0]">
                전체 내역 {filtered.length}건
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                거래 카드를 더블클릭하면 수정할 수 있어요
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto rounded-full bg-white/80 px-2 py-1.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">


              {selectedDateFilter ? (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter(null)}
                  className="rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-500 transition hover:bg-rose-100"
                >
                  {selectedDateFilter} 해제
                </button>
              ) : null}
<div className="rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-black text-sky-600">
  수입 {totalIncome.toLocaleString()}원
</div>

<div className="rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-500">
  지출 {totalExpense.toLocaleString()}원
</div>

<div className={`rounded-full px-4 py-2 text-xs font-black text-white shadow-[0_6px_14px_rgba(33,189,183,0.18)] ${
  total >= 0 ? "bg-[#21bdb7]/90" : "bg-rose-500"
}`}>
  {Math.abs(total).toLocaleString()}원
</div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-[28px] border border-slate-100 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              불러오는 중...
            </div>
          ) : groupedRows.length === 0 ? (
            <div className="rounded-[28px] border border-slate-100 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              표시할 거래내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-6 pb-8">
              {groupedRows.map((group) => (
                <section key={group.date}>
                  <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-4 px-1">
                    <div className="text-[15px] font-extrabold text-slate-700">{group.date}</div>
                      <div className="flex items-center justify-end gap-2 text-right">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-400">
                          일 합계
                        </span>
<span className="text-xs font-black text-slate-400">
  {formatSignedAmount(group.total)}
</span>
                      </div>
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map((item) => {
                      const typeMeta = splitType(item.type);
                      const rawAmount = Number(item.amount ?? 0);
                      const amount =
                        (typeMeta.flow === "지출" || (item.type ?? "").startsWith("지출/")) && rawAmount > 0
                          ? -rawAmount
                          : rawAmount;
                      const displayAccount = getDisplayAccount(item.account_type);

                      return (
<button
  key={item.id}
  type="button"
  onClick={() => openEdit(item)}
  className={`relative w-full overflow-hidden rounded-[20px] border border-[#d8f3f1] bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-[1px] hover:border-[#21bdb7]/50 hover:bg-[#fbfffe] hover:shadow-md before:absolute before:left-0 before:top-4 before:h-[calc(100%-32px)] before:w-1 before:rounded-r-full sm:rounded-[28px] sm:px-5 sm:py-4 ${
    amount < 0 ? "before:bg-rose-300" : "before:bg-sky-300"
  }`}
>
  <div className="grid grid-cols-[44px_1fr_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[58px_1fr_auto] sm:gap-x-4">
    <div className="row-span-2 flex flex-col items-stretch justify-center gap-1">
      <span className={`rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${getTypeTone(typeMeta.flow)}`}>
        {typeMeta.flow || "미분류"}
      </span>
      <span className={`truncate rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${getCategoryTone(typeMeta.category || "기타")}`}>
        {typeMeta.category || "기타"}
      </span>
    </div>

    <div className="min-w-0">
      <div className="truncate text-[13px] font-black text-slate-800 sm:text-[16px]">
        {item.description || "-"}
      </div>
    </div>

    <div className="min-w-[82px] text-right sm:min-w-[90px]">
      <div
        className={`whitespace-nowrap text-[14px] font-black tracking-[-0.03em] tabular-nums sm:text-[17px] ${
          amount < 0 ? "text-rose-500" : "text-sky-500"
        }`}
      >
        {formatSignedAmount(amount)}
      </div>
    </div>

    <div className="col-start-2 col-end-4 flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-[#f6fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-400">
        {parseShortDate(item.tx_date)?.display ?? item.tx_date ?? "-"}
      </span>

      {(() => {
        const userName = normalizeUserTag(item.user_type) || "미지정";

        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-[#f7fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-500">
            {renderIcon("users", userName, "h-3.5 w-3.5 object-contain")}
            {userName}
          </span>
        );
      })()}

      <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-[#f7fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-500">
        {renderIcon("accounts", displayAccount, "h-3.5 w-3.5 object-contain")}
        {displayAccount}
      </span>
    </div>
  </div>
</button>

                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCalendar ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm"
          onMouseDown={() => setShowCalendar(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-[94vw] overflow-hidden rounded-[26px] bg-[#f8fffe] sm:max-w-5xl sm:rounded-[34px] shadow-[0_32px_90px_rgba(15,23,42,0.28)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
              <div className="bg-[linear-gradient(135deg,#3ec7c1_0%,#2fb3ad_100%)] px-4 py-4 text-white sm:px-7 sm:py-6">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCalendar(false)}
                    className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-base font-black text-white transition hover:bg-white/30"
                  >
                    ×
                  </button>

                  <div>
                    <div className="inline-flex rounded-full bg-white/25 px-2.5 py-1 text-[10px] font-black">
                      MONTHLY CALENDAR
                    </div>
                  </div>

                  <div className="mt-2 flex justify-center">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          moveMonth("prev");
                          setSelectedDateFilter(null);
                        }}
                        disabled={currentMonthIndex >= monthOptions.length - 1 || currentMonthIndex < 0}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-2xl sm:h-12 sm:w-12 sm:text-4xl font-black text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-25"
                      >
                        ‹
                      </button>

                      <div className="text-center">
                        <div className="text-[30px] font-black sm:text-[44px] tracking-[-0.06em] text-white">
                          {monthLabel.month}
                        </div>
                        <div className="mt-1 text-[11px] sm:mt-2 sm:text-[13px] font-bold tracking-[0.2em] text-white/70">
                          {monthLabel.year}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          moveMonth("next");
                          setSelectedDateFilter(null);
                        }}
                        disabled={currentMonthIndex <= 0}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-2xl sm:h-12 sm:w-12 sm:text-4xl font-black text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-25"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-3">
                <div className="flex items-center justify-center gap-1 rounded-[14px] border border-white/70 bg-white px-2 py-2 sm:gap-4 sm:rounded-[18px] sm:px-4 sm:py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  <span className="text-[11px] font-black text-slate-400">수입</span>
                  <span className="truncate text-[11px] font-black text-sky-500 sm:text-[18px]">
                    +{formatCompactWon(calendarSummary.income)}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1 rounded-[14px] border border-white/70 bg-white px-2 py-2 sm:gap-4 sm:rounded-[18px] sm:px-4 sm:py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  <span className="text-[11px] font-black text-slate-400">지출</span>
                  <span className="truncate text-[11px] font-black text-rose-500 sm:text-[18px]">
                    -{formatCompactWon(calendarSummary.expense)}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1 rounded-[14px] border border-white/70 bg-white px-2 py-2 sm:gap-4 sm:rounded-[18px] sm:px-4 sm:py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  <span className="text-[11px] font-black text-slate-400">순흐름</span>
                  <span className="truncate text-[11px] font-black text-slate-800 sm:text-[18px]">
                    {formatCompactWon(calendarSummary.income - calendarSummary.expense)}
                  </span>
                </div>
              </div>
            </div>

            <div className="max-h-[64vh] overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
              <div className="mb-2 grid grid-cols-7 gap-1 px-1 text-center text-[10px] sm:gap-2 sm:text-[12px] font-black text-slate-400">
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.map((cell, idx) => {
                  if (cell.isEmpty) {
                    return <div key={`empty-${idx}`} className="min-h-[46px] sm:min-h-[76px]" />;
                  }

                  const hasData = cell.income > 0 || cell.expense > 0;
                  const isSelected = selectedDateFilter === cell.date;

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => {
                        setSelectedDateFilter(cell.date);
                        setShowCalendar(false);
                      }}
                      className={`group min-h-[46px] rounded-[14px] border p-1.5 text-left transition sm:min-h-[76px] sm:rounded-[22px] sm:p-3 ${
                        isSelected
                          ? "border-[#19aaa4] bg-white shadow-[0_12px_28px_rgba(47,179,173,0.22)]"
                          : hasData
                            ? "border-[#d5f2f0] bg-white shadow-sm hover:-translate-y-[1px] hover:border-[#3ec7c1] hover:shadow-md"
                            : "border-slate-100 bg-white/55 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] sm:h-7 sm:w-7 sm:text-sm font-black ${
                            isSelected ? "bg-[#21bdb7] text-white" : "text-slate-700"
                          }`}
                        >
                          {cell.day}
                        </span>

                        {hasData ? <span className="h-1.5 w-1.5 rounded-full bg-[#21bdb7] sm:h-2 sm:w-2" /> : null}
                      </div>

                      <div className="mt-1 space-y-0.5 sm:mt-3 sm:space-y-1">
                        {cell.income > 0 ? (
                          <div className="truncate text-[8px] font-black text-sky-500 sm:text-[11px]">
                            +{formatCompactWon(cell.income)}
                          </div>
                        ) : null}

                        {cell.expense > 0 ? (
                          <div className="truncate text-[8px] font-black text-rose-500 sm:text-[11px]">
                            -{formatCompactWon(cell.expense)}
                          </div>
                        ) : null}


                      </div>
                    </button>
                  );
                })}       
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (() => {
        const editTypeMeta = splitType(editing.type);
        const editAmount = getEditSignedAmount(editing);
        const flowOptions = getTypeFlowOptions(typeOptions);
        const categoryOptionsForFlow = getTypeCategoryOptions(typeOptions, editTypeMeta.flow);

        const setEditFlow = (flow: string) => {
          const nextCategory = getTypeCategoryOptions(typeOptions, flow)[0] ?? "기타";
          handleEditChange("type", `${flow}/${nextCategory}`);
        };

        const setEditCategory = (category: string) => {
          const flow = editTypeMeta.flow || "지출";
          handleEditChange("type", `${flow}/${category}`);
        };

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-[94vw] overflow-y-auto rounded-[26px] bg-white sm:max-w-2xl sm:rounded-[34px] shadow-[0_32px_90px_rgba(15,23,42,0.28)]">
            <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-5 py-4 sm:px-7 sm:py-6">
              <button
                type="button"
                onClick={closeEdit}
                className="absolute right-4 top-4 flex h-8 w-8 sm:right-5 sm:top-5 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white text-lg font-black text-slate-400 shadow-sm transition hover:bg-slate-50 hover:text-slate-600"
              >
                ×
              </button>

              <div className="pr-12">
                <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
                  TRANSACTION EDIT
                </div>
                <h2 className="mt-2 text-xl font-black sm:mt-3 sm:text-2xl tracking-[-0.04em] text-slate-800">
                  거래내역 수정
                </h2>
                <p className="mt-1 text-xs font-medium sm:text-sm text-slate-400">
                  카드·분류·금액을 확인하고 필요한 값만 수정해요.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 sm:px-7 sm:py-6">
              <div className="mb-4 rounded-[22px] border border-[#d8f3f1] bg-[#f8fffe] p-3 sm:mb-5 sm:rounded-[26px] sm:p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-base font-black text-slate-800 sm:text-lg">
                      {editing.description || "거래명 없음"}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#0f766e]">
                        {editing.type || "분류 없음"}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-400">
                        {editing.tx_date || "날짜 없음"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className={`whitespace-nowrap text-lg font-black tabular-nums sm:text-xl ${
                        editAmount < 0 ? "text-rose-400" : "text-sky-500"
                      }`}
                    >
                      {formatSignedAmount(editAmount)}
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-slate-300">
                      현재 금액
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4">
                <Field label="날짜">
                  <input
                    type="date"
                    value={editing.tx_date}
                    onChange={(e) => handleEditChange("tx_date", e.target.value)}
                    className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
                  />
                </Field>

                <Field label="지출/수입">
                  <div className="grid grid-cols-2 gap-2">
                    {["지출", "수입"].map((flow) => (
                      <button
                        key={flow}
                        type="button"
                        onClick={() => setEditFlow(flow)}
                        className={`h-12 rounded-[18px] text-sm font-black transition ${
                          editTypeMeta.flow === flow
                            ? "bg-[#21bdb7] text-white shadow-sm"
                            : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {flow}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="상세분류">
                  <select
                    value={editTypeMeta.category}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
                  >
                    <option value="">선택</option>
                    {categoryOptionsForFlow.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="사용자">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "기린", icon: "/icons/girin.png" },
                      { key: "짱구", icon: "/icons/zzangu.png" },
                    ].map((user) => (
                      <button
                        key={user.key}
                        type="button"
                        onClick={() => handleEditChange("user_type", user.key)}
                        className={`flex h-12 items-center justify-center gap-2 rounded-[18px] text-sm font-black transition ${
                          editing.user_type === user.key
                            ? "bg-[#21bdb7] text-white shadow-sm"
                            : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <img src={user.icon} className="h-3.5 w-3.5 shrink-0 object-contain sm:h-5 sm:w-5" />
                        {user.key}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="내용" className="sm:col-span-2">
                  <input
                    type="text"
                    value={editing.description}
                    onChange={(e) => handleEditChange("description", e.target.value)}
                    className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
                  />
                </Field>

                <Field label="금액">
                  <input
                    type="text"
                    value={formatNumberWithComma(editing.amount)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, "");
                      if (!/^\d*$/.test(raw)) return;
                      handleEditChange("amount", raw);
                    }}
                    className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-black tabular-nums text-rose-400"
                    placeholder="-19000 / 350000"
                  />
                </Field>

                <Field label="결제수단">
                  <div className="relative">
                    <select
                      value={editing.account_type}
                      onChange={(e) => handleEditChange("account_type", e.target.value)}
                      style={{ paddingLeft: "48px", paddingRight: "40px" }}
                      className="app-input h-12 w-full appearance-none rounded-[18px] border-slate-200 bg-slate-50 font-bold text-slate-700"
                    >
                      <option value="">선택</option>
                      {accountOptions.map((account) => (
                        <option key={account} value={account}>
                          {account}
                        </option>
                      ))}
                    </select>

                    <div className="pointer-events-none absolute left-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center">
                      {renderIcon("accounts", editing.account_type)}
                    </div>

                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      ▼
                    </div>
                  </div>
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading || saveLoading}
                className="w-full rounded-[18px] bg-rose-50 px-5 py-3 text-sm sm:w-auto font-black text-rose-500 transition hover:bg-rose-100 disabled:opacity-60"
              >
                {deleteLoading ? "삭제 중..." : "삭제"}
              </button>

              <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveLoading || deleteLoading}
                  className="w-full rounded-[18px] bg-[#21bdb7] px-6 py-3 text-sm sm:w-auto font-black text-white shadow-[0_12px_26px_rgba(33,189,183,0.24)] transition hover:bg-[#18aaa4] disabled:opacity-60"
                >
                  {saveLoading ? "저장 중..." : "저장"}
                </button>

                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={deleteLoading || saveLoading}
                  className="w-full rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-sm sm:w-auto font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
              </div>
        );
      })() : null}
          </div>
        );
      }

  function Field({
    label,
    children,
    className = "",
  }: {
    label: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <div className={className}>
        <label className="mb-1.5 block text-xs font-bold text-slate-600 sm:mb-2 sm:text-sm">{label}</label>
        {children}
      </div>
    );
  }