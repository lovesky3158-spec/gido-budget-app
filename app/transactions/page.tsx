"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import {
  formatSignedMoney,
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
import TransactionDetailModal, {
  buildTransactionUpdatePayload,
  makeTransactionEditForm,
  type TransactionEditForm,
} from "@/components/common/TransactionDetailModal";
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
  memo?: string | null;
  created_at?: string | null;
};


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


export default function TransactionsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [monthFilter, setMonthFilter] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [openFilterPanel, setOpenFilterPanel] = useState<"user" | "card" | "category" | null>(null);

  const [editing, setEditing] = useState<TransactionEditForm | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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

  useEffect(() => {
    if (!bulkCategory && categoryOptions.length > 0) {
      setBulkCategory(categoryOptions[0]);
    }
  }, [bulkCategory, categoryOptions]);

  const selectedIdSet = useMemo(() => {
    return new Set(selectedIds.map((id) => String(id)));
  }, [selectedIds]);

  const selectedRows = useMemo(() => {
    return rows.filter((row) => selectedIdSet.has(String(row.id)));
  }, [rows, selectedIdSet]);

  const selectedCount = selectedIds.length;

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
      if (flowFilter !== "all" && typeMeta.flow !== flowFilter) return false;
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
  }, [rows, monthFilter, userFilter, accountFilter, flowFilter, categoryFilter, cardFilter, search, selectedDateFilter]);

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
    flowFilter !== "all",
    categoryFilter !== "all",
    Boolean(search.trim()),
    Boolean(selectedDateFilter),
  ].filter(Boolean).length;

  const filterSummary = [
    userFilter !== "all" ? userFilter : null,
    cardFilter !== "all" ? cardFilter : null,
    flowFilter !== "all" ? flowFilter : null,
    categoryFilter !== "all" ? categoryFilter : null,
    selectedDateFilter ? "날짜" : null,
    search.trim() ? "검색" : null,
  ].filter(Boolean).join(" · ");

  const resetFilters = () => {
    setUserFilter("all");
    setAccountFilter("all");
    setCardFilter("all");
    setFlowFilter("all");
    setCategoryFilter("all");
    setSearch("");
    setSelectedDateFilter(null);
    setOpenFilterPanel(null);
  };

  const toggleSelected = (id: string | number) => {
    const key = String(id);
    setSelectedIds((prev) => {
      if (prev.some((value) => String(value) === key)) {
        return prev.filter((value) => String(value) !== key);
      }
      return [...prev, id];
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(filtered.map((row) => row.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkCategorySave = async () => {
    if (selectedRows.length === 0 || !bulkCategory) return;

    const ok = window.confirm(`선택한 ${selectedRows.length}건의 카테고리를 [${bulkCategory}]로 변경할까요?`);
    if (!ok) return;

    setBulkSaving(true);
    setErrorMessage("");

    const updates = selectedRows.map((row) => {
      const typeMeta = splitType(row.type);
      const amount = getNormalizedAmount(row);
      const flow = typeMeta.flow || (amount > 0 ? "수입" : "지출");

      return supabase
        .from("transactions")
        .update({ type: `${flow}/${bulkCategory}` })
        .eq("id", row.id);
    });

    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;

    setBulkSaving(false);

    if (firstError) {
      setErrorMessage(`일괄 변경 실패: ${firstError.message}`);
      return;
    }

    setBulkCategoryOpen(false);
    setSelectedIds([]);
    await fetchData();
  };


  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const ok = window.confirm(`선택한 ${selectedIds.length}건을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`);
    if (!ok) return;

    setBulkDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("transactions")
      .delete()
      .in("id", selectedIds);

    setBulkDeleting(false);

    if (error) {
      setErrorMessage(`선택 삭제 실패: ${error.message}`);
      return;
    }

    setSelectedIds([]);
    await fetchData();
  };

  const openEdit = (row: TransactionRow) => {
    setEditing(makeTransactionEditForm(row));
  };

  const closeEdit = () => {
    if (saveLoading || deleteLoading) return;
    setEditing(null);
  };

  const handleEditChange = (key: keyof TransactionEditForm, value: string) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!editing) return;

    setSaveLoading(true);
    setErrorMessage("");

    const payload = buildTransactionUpdatePayload(editing);

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
    <div className="min-h-screen bg-white pb-28 sm:pb-0">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#3ec7c1_0%,#2fb3ad_100%)] sm:block">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/20 blur-2xl sm:hidden" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-36 w-36 rounded-full bg-[#fff1a8]/20 blur-2xl sm:hidden" />
        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="absolute right-4 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/35 text-[15px] shadow-sm ring-1 ring-white/45 backdrop-blur transition hover:bg-white/50 sm:right-6 sm:top-5 sm:h-10 sm:w-10 sm:text-[18px]"
          aria-label="달력 보기"
        >
          📅
        </button>
        <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-8">
          <div className="flex min-h-[34px] items-center sm:block sm:min-h-0 sm:py-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-white/35 bg-white/35 px-2.5 py-1 text-[10px] font-bold text-[#063f3a] sm:inline-flex">
              <span>
                {monthFilter ? `${monthLabel.year}년 ${monthLabel.month}` : "월 선택"} 거래내역
              </span>
              <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">
                TRANSACTION
              </span>
            </div>

            <div className="sm:mt-3">
              <h1 className="text-[20px] font-black tracking-[-0.045em] text-white sm:text-[38px]">
                기린 · 짱구 거래내역
              </h1>

              <p className="mt-1.5 hidden text-[9px] font-medium leading-relaxed text-white/80 sm:block sm:text-[14px]">
                업로드된 카드·계좌 내역을 월별로 확인하고 상세 거래를 정리해요.
              </p>

              <div className="mt-3 hidden items-center justify-center gap-1.5 sm:mt-6 sm:flex sm:justify-start sm:gap-3">
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
<div className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
  <div className="relative flex items-center justify-center gap-2">
    <button
      type="button"
      onClick={() => moveMonth("prev")}
      disabled={currentMonthIndex >= monthOptions.length - 1 || currentMonthIndex < 0}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm disabled:opacity-30"
    >
      ◀
    </button>
    <div className="relative">
      <select
        value={monthFilter}
        onChange={(e) => setMonthFilter(e.target.value)}
        className="h-9 appearance-none rounded-full border border-slate-200 bg-white px-5 pr-8 text-[12px] font-black text-[#0f766e] shadow-sm outline-none"
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
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#0f766e]">▼</div>
    </div>
    <button
      type="button"
      onClick={() => moveMonth("next")}
      disabled={currentMonthIndex <= 0}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm disabled:opacity-30"
    >
      ▶
    </button>
    <button
      type="button"
      onClick={() => setShowCalendar(true)}
      className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-[16px] border border-[#f1d67a] bg-[#fff7d6] text-base font-black text-[#8a5b00] shadow-sm"
      aria-label="달력 보기"
    >
      📅
    </button>
  </div>
</div>
<div className="border-b border-slate-100 bg-white">
  <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-4">
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setShowFilterSheet((v) => !v);
          setOpenFilterPanel(null);
        }}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-[16px] border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 shadow-sm sm:rounded-full sm:px-4 sm:text-sm"
      >
        <span>☰</span>
        <span>필터</span>
        {activeFilterCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-[#21bdb7] px-1.5 py-0.5 text-[9px] text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 shadow-sm sm:h-10 sm:rounded-full sm:px-4">
        <span className="text-sm text-slate-400">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="거래 검색"
          className="w-full min-w-0 flex-1 bg-transparent text-[12px] font-bold text-slate-700 outline-none placeholder:text-slate-300 sm:text-sm"
        />
      </div>

      <button
        type="button"
        onClick={resetFilters}
        className="flex h-10 shrink-0 items-center rounded-[16px] border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-500 shadow-sm sm:rounded-full sm:text-sm"
      >
        초기화
      </button>
    </div>

    <div className="mt-1.5 flex items-center justify-between gap-2 sm:mt-2">
      <span className="min-w-0 truncate text-[10px] font-extrabold text-slate-400 sm:text-sm">
        {filterSummary || "전체 조건"}
      </span>

    </div>

    {showFilterSheet ? (
      <div className="fixed inset-0 z-40 flex items-end bg-slate-950/35 px-3 pb-3 pt-20 backdrop-blur-sm sm:items-start sm:justify-center sm:px-6 sm:pb-0 sm:pt-28" onMouseDown={() => setShowFilterSheet(false)}>
        <div className="max-h-[78vh] w-full max-w-4xl overflow-y-auto overflow-x-hidden rounded-[28px] border border-slate-100 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:max-h-[72vh] sm:rounded-[30px] sm:p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-800 sm:text-base">거래내역 필터</div>
            <div className="mt-0.5 text-[11px] font-bold text-slate-400">사용자 → 수입/지출 → 결제수단 → 카테고리 순서로 적용돼요.</div>
          </div>
          <button type="button" onClick={() => setShowFilterSheet(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base font-black text-slate-500">×</button>
        </div>
        <div className="grid gap-4">
          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">사용자</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "all", label: "전체", icon: "👥" },
                { key: "기린", label: "기린", icon: "/icons/girin.png" },
                { key: "짱구", label: "짱구", icon: "/icons/zzangu.png" },
              ].map((user) => (
                <button
                  key={user.key}
                  type="button"
                  onClick={() => setUserFilter(user.key)}
                  className={`flex h-9 w-auto min-w-[82px] items-center justify-center gap-1 rounded-full px-3 text-[11px] font-black transition ${
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
            <div className="mb-1.5 text-[11px] font-black text-slate-400">수입/지출</div>
            <div className="flex flex-wrap gap-1.5">
              {["all", "수입", "지출"].map((flow) => (
                <button
                  key={flow}
                  type="button"
                  onClick={() => setFlowFilter(flow)}
                  className={`h-9 w-auto min-w-[82px] rounded-full px-3 text-[11px] font-black transition ${
                    flowFilter === flow
                      ? "bg-[#21bdb7] text-white shadow-sm"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {flow === "all" ? "전체" : flow}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">결제수단</div>
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => setCardFilter("all")}
                className={`flex h-9 min-w-0 items-center gap-1 rounded-full px-3 text-[11px] font-black transition ${
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
                  className={`flex h-9 max-w-full min-w-0 items-center gap-1 rounded-full px-3 text-[11px] font-black transition ${
                    cardFilter === card ? "bg-[#21bdb7] text-white" : "bg-[#effffe] text-[#0f766e]"
                  }`}
                >
                  {renderIcon("accounts", card, "h-4 w-4 shrink-0 object-contain")}
                  <span className="min-w-0 truncate">{card}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-black text-slate-400">카테고리</div>
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`h-9 rounded-full px-3 text-[11px] font-black transition ${
                  categoryFilter === "all" ? "bg-[#21bdb7] text-white shadow-sm" : "bg-slate-100 text-slate-500"
                }`}
              >
                전체
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`h-9 max-w-full min-w-0 rounded-full px-3 text-[11px] font-black transition ${
                    categoryFilter === category
                      ? "bg-[#21bdb7] text-white shadow-sm"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span className="block min-w-0 truncate">{category}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedDateFilter ? (
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="rounded-full bg-rose-50 px-4 py-2 text-[11px] font-black text-rose-500"
            >
              날짜 필터 해제 · {selectedDateFilter}
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={resetFilters}
            className="h-11 flex-1 rounded-[18px] border border-slate-200 bg-white text-[13px] font-black text-slate-500"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => setShowFilterSheet(false)}
            className="h-11 flex-[1.4] rounded-[18px] bg-[#21bdb7] text-[13px] font-black text-white shadow-[0_10px_24px_rgba(33,189,183,0.22)]"
          >
            적용하고 닫기
          </button>
        </div>
      </div>
      </div>
    ) : null}
  </div>
</div>

<div className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
  <div className="rounded-[22px] border border-slate-100 bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="min-w-0 rounded-[16px] bg-sky-50 px-2 py-2">
        <div className="text-[10px] font-black text-sky-500">수입</div>
        <div className="mt-1 truncate text-[15px] font-black tracking-[-0.05em] text-sky-600">+{formatCompactWon(totalIncome)}원</div>
      </div>
      <div className="min-w-0 rounded-[16px] bg-rose-50 px-2 py-2">
        <div className="text-[10px] font-black text-rose-400">지출</div>
        <div className="mt-1 truncate text-[15px] font-black tracking-[-0.05em] text-rose-500">-{formatCompactWon(totalExpense)}원</div>
      </div>
      <div className="min-w-0 rounded-[16px] bg-emerald-50 px-2 py-2">
        <div className="text-[10px] font-black text-emerald-500">잔액</div>
        <div className={`mt-1 truncate text-[15px] font-black tracking-[-0.05em] ${total >= 0 ? "text-[#0faaa4]" : "text-rose-500"}`}>{total >= 0 ? "+" : "-"}{formatCompactWon(Math.abs(total))}원</div>
      </div>
    </div>
  </div>
</div>
<main className="bg-white px-3 pt-4 sm:bg-[#f6fbfb] sm:px-6 sm:pt-8">
        {errorMessage ? (
          <div className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        <div className="mx-auto max-w-6xl">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[17px] font-extrabold text-[#11b5b0]">
                {selectedCount > 0 ? `${selectedCount}건 선택됨` : `전체 내역 ${filtered.length}건`}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {selectedCount > 0 ? "선택한 내역을 일괄 변경하거나 삭제할 수 있어요" : "체크 후 카테고리 일괄 변경, 카드를 탭하면 상세 수정"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={filtered.length === 0}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-500 shadow-sm disabled:opacity-40"
              >
                현재목록 전체선택
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedCount === 0}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-500 shadow-sm disabled:opacity-40"
              >
                선택해제
              </button>
              <button
                type="button"
                onClick={() => setBulkCategoryOpen(true)}
                disabled={selectedCount === 0}
                className="h-9 rounded-full bg-[#21bdb7] px-4 text-[11px] font-black text-white shadow-[0_8px_18px_rgba(33,189,183,0.20)] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                카테고리 변경 {selectedCount > 0 ? `${selectedCount}건` : ""}
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedCount === 0 || bulkDeleting}
                className="h-9 rounded-full bg-rose-50 px-4 text-[11px] font-black text-rose-500 ring-1 ring-rose-100 disabled:bg-slate-100 disabled:text-slate-300 disabled:ring-slate-100"
              >
                {bulkDeleting ? "삭제 중..." : "선택삭제"}
              </button>
            </div>

            <div className="hidden items-center gap-1.5 overflow-x-auto rounded-full bg-white/80 px-2 py-1.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur sm:flex">


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
                  <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3 px-1">
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
<div
  key={item.id}
  role="button"
  tabIndex={0}
  onClick={() => openEdit(item)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") openEdit(item);
  }}
  className={`relative w-full cursor-pointer overflow-hidden rounded-[24px] border border-[#d8f3f1] bg-white px-3.5 py-3 pl-11 text-left shadow-sm transition active:scale-[0.99] hover:-translate-y-[1px] hover:border-[#21bdb7]/50 hover:bg-[#fbfffe] hover:shadow-md before:absolute before:left-0 before:top-5 before:h-[calc(100%-40px)] before:w-1 before:rounded-r-full sm:rounded-[28px] sm:px-5 sm:py-4 sm:pl-14 ${
    amount < 0 ? "before:bg-rose-300" : "before:bg-sky-300"
  }`}
>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      toggleSelected(item.id);
    }}
    className={`absolute left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border text-[12px] font-black transition sm:left-5 sm:h-7 sm:w-7 ${
      selectedIdSet.has(String(item.id))
        ? "border-[#21bdb7] bg-[#21bdb7] text-white shadow-sm"
        : "border-slate-200 bg-white text-transparent hover:border-[#21bdb7]"
    }`}
    aria-label="거래 선택"
  >
    ✓
  </button>

  <div className="grid grid-cols-[1fr_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[58px_1fr_auto] sm:gap-x-4">
    <div className="hidden row-span-2 flex-col items-stretch justify-center gap-1 sm:flex">
      <span className={`rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${getTypeTone(typeMeta.flow)}`}>
        {typeMeta.flow || "미분류"}
      </span>
      <span className={`truncate rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${getCategoryTone(typeMeta.category || "기타")}`}>
        {typeMeta.category || "기타"}
      </span>
    </div>

    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 sm:hidden">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${getTypeTone(typeMeta.flow)}`}>{typeMeta.flow || "미분류"}</span>
        <span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${getCategoryTone(typeMeta.category || "기타")}`}>{typeMeta.category || "기타"}</span>
      </div>
      <div className="truncate text-[15px] font-black text-slate-800 sm:text-[16px]">
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

    <div className="col-start-1 col-end-3 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-start-2 sm:col-end-4">
      <span className="rounded-full bg-[#f6fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-400">
        {parseShortDate(item.tx_date)?.display ?? item.tx_date ?? "-"}
      </span>

      {(() => {
        const userName = normalizeUserTag(item.user_type) || "미지정";

        const userTone = userName === "기린"
          ? "border-[#99f6e4] bg-[#ecfdf5] text-[#0f766e]"
          : userName === "짱구"
            ? "border-[#f1d67a] bg-[#fff7d6] text-[#8a5b00]"
            : "border-slate-100 bg-[#f7fbfb] text-slate-500";

        return (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${userTone}`}>
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
</div>

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

      {bulkCategoryOpen ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm"
          onMouseDown={() => {
            if (!bulkSaving) setBulkCategoryOpen(false);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-5 py-5">
              <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
                BULK CATEGORY
              </div>
              <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-800">
                카테고리 일괄 변경
              </h2>
              <p className="mt-1 text-xs font-bold text-slate-400">
                선택한 {selectedCount}건의 수입/지출은 유지하고 카테고리만 바꿔요.
              </p>
            </div>

            <div className="px-5 py-5">
              <label className="mb-2 block text-sm font-black text-slate-600">변경할 카테고리</label>
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
              <button
                type="button"
                onClick={() => setBulkCategoryOpen(false)}
                disabled={bulkSaving}
                className="h-11 flex-1 rounded-[18px] border border-slate-200 bg-white text-sm font-black text-slate-500 disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBulkCategorySave}
                disabled={bulkSaving || selectedCount === 0 || !bulkCategory}
                className="h-11 flex-1 rounded-[18px] bg-[#21bdb7] text-sm font-black text-white shadow-[0_10px_22px_rgba(33,189,183,0.22)] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {bulkSaving ? "변경 중..." : "변경 적용"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <TransactionDetailModal
          editing={editing}
          typeOptions={typeOptions}
          accountOptions={accountOptions}
          optionIcons={optionIcons}
          saveLoading={saveLoading}
          deleteLoading={deleteLoading}
          onChange={handleEditChange}
          onClose={closeEdit}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}
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