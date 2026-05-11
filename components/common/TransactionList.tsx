"use client";

import {
  formatSignedMoney,
  getNormalizedAmount,
  parseDateMeta,
  splitType,
} from "@/lib/finance-utils";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import {
  isImageIcon,
  loadOptionIcons,
  resolveOptionIcon,
  type OptionIconMap,
} from "@/lib/option-icons";
import { useEffect, useMemo, useState } from "react";

export type CommonTransactionRow = {
  id: string | number;
  tx_date: string | null;
  description: string | null;
  type: string | null;
  amount: number | null;
  balance?: number | null;
  user_type: string | null;
  account_type: string | null;
  source_file?: string | null;
  memo?: string | null;
  created_at?: string | null;
};

type TransactionListProps = {
  rows: CommonTransactionRow[];
  emptyText?: string;
  groupByDate?: boolean;
  compact?: boolean;
  showRank?: boolean;
  showMemo?: boolean;
  selectedIds?: Array<string | number>;
  onToggleSelected?: (id: string | number) => void;
  onRowClick?: (row: CommonTransactionRow) => void;
  optionIcons?: OptionIconMap;
};

function formatDate(row: CommonTransactionRow) {
  return parseDateMeta(row.tx_date)?.display ?? row.tx_date ?? "-";
}

function amountTone(amount: number) {
  if (amount < 0) return "text-rose-500";
  if (amount > 0) return "text-sky-500";
  return "text-slate-400";
}

function typeTone(value: string | null) {
  const v = (value ?? "").trim();
  if (v.includes("지출")) return "bg-rose-100 text-rose-500";
  if (v.includes("수입")) return "bg-violet-100 text-violet-500";
  if (v.includes("입금")) return "bg-sky-100 text-sky-600";
  if (v.includes("출금")) return "bg-amber-100 text-amber-600";
  return "bg-slate-100 text-slate-500";
}

function categoryTone(value: string) {
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
  if (v === "월급") return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-500";
}

function compactMoney(value: number) {
  return formatSignedMoney(value);
}

export function TransactionList({
  rows,
  emptyText = "표시할 거래내역이 없습니다.",
  groupByDate = false,
  compact = false,
  showRank = false,
  showMemo = true,
  selectedIds = [],
  onToggleSelected,
  onRowClick,
  optionIcons: optionIconsProp,
}: TransactionListProps) {
  const [localIcons, setLocalIcons] = useState<OptionIconMap>({});

  useEffect(() => {
    if (optionIconsProp) return;
    setLocalIcons(loadOptionIcons());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "asset_couple_option_icons") setLocalIcons(loadOptionIcons());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [optionIconsProp]);

  const optionIcons = optionIconsProp ?? localIcons;
  const selectedSet = useMemo(() => new Set(selectedIds.map((id) => String(id))), [selectedIds]);

  const groups = useMemo(() => {
    if (!groupByDate) return [{ date: "", total: rows.reduce((acc, row) => acc + getNormalizedAmount(row), 0), items: rows }];

    const map = new Map<string, { date: string; total: number; items: CommonTransactionRow[] }>();
    for (const row of rows) {
      const date = formatDate(row);
      const current = map.get(date) ?? { date, total: 0, items: [] };
      current.total += getNormalizedAmount(row);
      current.items.push(row);
      map.set(date, current);
    }
    return Array.from(map.values());
  }, [groupByDate, rows]);

  const renderIcon = (kind: "users" | "accounts", label: string, className: string) => {
    const icon = resolveOptionIcon(kind, label, optionIcons);
    if (!icon) return null;
    if (isImageIcon(icon)) return <img src={icon} alt="" className={className} />;
    return <span className="text-[13px] leading-none">{icon}</span>;
  };

  if (rows.length === 0) {
    return <div className="rounded-[22px] bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">{emptyText}</div>;
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {groups.map((group) => (
        <section key={group.date || "all"}>
          {groupByDate ? (
            <div className="mb-2 grid grid-cols-[1fr_auto] items-center gap-3 px-1">
              <div className="text-[15px] font-extrabold text-slate-700">{group.date}</div>
              <div className="flex items-center justify-end gap-2 text-right">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-400">일 합계</span>
                <span className="text-xs font-black text-slate-400">{compactMoney(group.total)}</span>
              </div>
            </div>
          ) : null}

          <div className={compact ? "space-y-2" : "space-y-2.5"}>
            {group.items.map((item, index) => {
              const typeMeta = splitType(item.type);
              const rawAmount = Number(item.amount ?? 0);
              const amount =
                (typeMeta.flow === "지출" || (item.type ?? "").startsWith("지출/")) && rawAmount > 0
                  ? -rawAmount
                  : rawAmount;
              const userName = normalizeUserTag(item.user_type) || "미지정";
              const accountName = normalizeAccountLabel(item.account_type) || "미지정";
              const isSelected = selectedSet.has(String(item.id));
              const clickable = Boolean(onRowClick);

              return (
                <div
                  key={item.id}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => {
                    if (!clickable) return;
                    if (e.key === "Enter" || e.key === " ") onRowClick?.(item);
                  }}
                  className={`relative w-full overflow-hidden rounded-[22px] border border-[#d8f3f1] bg-white px-3.5 py-3 text-left shadow-sm transition before:absolute before:left-0 before:top-5 before:h-[calc(100%-40px)] before:w-1 before:rounded-r-full sm:rounded-[28px] sm:px-5 sm:py-4 ${
                    onToggleSelected ? "pl-11 sm:pl-14" : "pl-4 sm:pl-5"
                  } ${clickable ? "cursor-pointer active:scale-[0.99] hover:-translate-y-[1px] hover:border-[#21bdb7]/50 hover:bg-[#fbfffe] hover:shadow-md" : ""} ${
                    amount < 0 ? "before:bg-rose-300" : "before:bg-sky-300"
                  }`}
                >
                  {onToggleSelected ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelected(item.id);
                      }}
                      className={`absolute left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border text-[12px] font-black transition sm:left-5 sm:h-7 sm:w-7 ${
                        isSelected
                          ? "border-[#21bdb7] bg-[#21bdb7] text-white shadow-sm"
                          : "border-slate-200 bg-white text-transparent hover:border-[#21bdb7]"
                      }`}
                      aria-label="거래 선택"
                    >
                      ✓
                    </button>
                  ) : null}

                  <div className={`grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 ${compact ? "" : "sm:grid-cols-[58px_1fr_auto] sm:gap-x-4"}`}>
                    {!compact ? (
                      <div className="hidden row-span-2 flex-col items-stretch justify-center gap-1 sm:flex">
                        <span className={`rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${typeTone(typeMeta.flow)}`}>
                          {typeMeta.flow || "미분류"}
                        </span>
                        <span className={`truncate rounded-full px-2 py-1 text-center text-[10px] font-black leading-none ${categoryTone(typeMeta.category || "기타")}`}>
                          {typeMeta.category || "기타"}
                        </span>
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5 sm:hidden">
                        {showRank ? (
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">TOP {index + 1}</span>
                        ) : null}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${typeTone(typeMeta.flow)}`}>{typeMeta.flow || "미분류"}</span>
                        <span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${categoryTone(typeMeta.category || "기타")}`}>{typeMeta.category || "기타"}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        {showRank ? (
                          <span className="hidden shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200 sm:inline-flex">TOP {index + 1}</span>
                        ) : null}
                        <div className="min-w-0 truncate text-[15px] font-black text-slate-800 sm:text-[16px]">{item.description || "-"}</div>
                      </div>
                    </div>

                    <div className="min-w-[82px] text-right sm:min-w-[90px]">
                      <div className={`whitespace-nowrap text-[14px] font-black tracking-[-0.03em] tabular-nums sm:text-[17px] ${amountTone(amount)}`}>
                        {compactMoney(amount)}
                      </div>
                    </div>

                    <div className={`${compact ? "col-start-1 col-end-3" : "col-start-1 col-end-3 sm:col-start-2 sm:col-end-4"} flex min-w-0 flex-wrap items-center gap-1.5`}>
                      <span className="rounded-full bg-[#f6fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-400">{formatDate(item)}</span>

                      <span
                        className={`inline-flex max-w-[110px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${
                          userName === "기린"
                            ? "border-[#99f6e4] bg-[#ecfdf5] text-[#0f766e]"
                            : userName === "짱구"
                              ? "border-[#f1d67a] bg-[#fff7d6] text-[#8a5b00]"
                              : "border-slate-100 bg-[#f7fbfb] text-slate-500"
                        }`}
                      >
                        {renderIcon("users", userName, "h-3.5 w-3.5 shrink-0 object-contain")}
                        <span className="truncate">{userName}</span>
                      </span>

                      <span className="inline-flex max-w-[130px] items-center gap-1 rounded-full border border-slate-100 bg-[#f7fbfb] px-2 py-0.5 text-[10px] font-extrabold text-slate-500">
                        {renderIcon("accounts", accountName, "h-3.5 w-3.5 shrink-0 object-contain")}
                        <span className="truncate">{accountName}</span>
                      </span>
                    </div>

                    {showMemo && item.memo ? (
                      <div className={`${compact ? "col-start-1 col-end-3" : "col-start-1 col-end-3 sm:col-start-2 sm:col-end-4"} mt-1 rounded-[14px] bg-slate-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-slate-500`}>
                        <span className="mr-1 font-black text-slate-400">메모</span>
                        {item.memo}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
