"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeUserTag } from "@/lib/finance-labels";
import {
  formatChartMoney,
  formatMoney,
  getMonthLabel,
  getMonthShort,
  getNormalizedAmount,
  parseDateMeta,
  splitType,
} from "@/lib/finance-utils";
type TransactionRow = {
  id: string | number;
  tx_date: string | null;
  description?: string | null;
  type: string | null;
  amount: number | null;
  user_type: string | null;
  memo?: string | null;
  created_at?: string | null;
};

type BaseAssets = { 기린: number; 짱구: number };
type ManualAdjustment = { id: string; title: string; amount: string };
type ManualAdjustmentMap = Record<
  string,
  { 기린: ManualAdjustment[]; 짱구: ManualAdjustment[] }
>;


type IncomeDetailMap = Record<
  string,
  { 기린: IncomeDetail; 짱구: IncomeDetail }
>;
type IncomeExtraItem = {
  id: string;
  title: string;
  amount: string;
  note: string;
  source?: "auto" | "manual";
};

type IncomeDetail = {
  base: string;
  baseNote: string;
  weekend: string;
  weekendNote: string;
  special: string;
  specialNote: string;
  tax: string;
  taxNote: string;
  extras: IncomeExtraItem[];
};

const EMPTY_INCOME_DETAIL: IncomeDetail = {
  base: "",
  baseNote: "",
  weekend: "",
  weekendNote: "",
  special: "",
  specialNote: "",
  tax: "",
  taxNote: "",
  extras: [],
};

const INCOME_DETAIL_KEY = "asset_couple_income_detail_v1";
const BASE_ASSET_KEY = "asset_couple_base_assets_v1";
const MANUAL_CARD_KEY = "asset_couple_manual_cards_v1";

function makeId() {
  return `asset-${Math.random().toString(36).slice(2, 10)}`;
}



function parseSignedNumber(value: string | null | undefined) {
  const raw = String(value ?? "").replace(/[\s,원₩]/g, "").trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
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

function loadBaseAssets(): BaseAssets {
  if (typeof window === "undefined") return { 기린: 0, 짱구: 0 };
  try {
    const raw = localStorage.getItem(BASE_ASSET_KEY);
    if (!raw) return { 기린: 0, 짱구: 0 };
    const parsed = JSON.parse(raw);
    return {
      기린: Number(parsed?.기린 ?? 0),
      짱구: Number(parsed?.짱구 ?? 0),
    };
  } catch {
    return { 기린: 0, 짱구: 0 };
  }
}

function saveBaseAssets(next: BaseAssets) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BASE_ASSET_KEY, JSON.stringify(next));
}

function loadManualCards(): ManualAdjustmentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MANUAL_CARD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveManualCards(next: ManualAdjustmentMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MANUAL_CARD_KEY, JSON.stringify(next));
}
function loadIncomeDetails(): IncomeDetailMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(INCOME_DETAIL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveIncomeDetails(next: IncomeDetailMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INCOME_DETAIL_KEY, JSON.stringify(next));
}

function formatInputMoney(value: string) {
  const raw = String(value ?? "").replace(/[^\d-]/g, "");
  if (!raw || raw === "-") return raw;

  const isNegative = raw.startsWith("-");
  const numOnly = raw.replace(/-/g, "");
  const formatted = Number(numOnly || 0).toLocaleString("ko-KR");

  return isNegative ? `-${formatted}` : formatted;
}

function formatInputChange(value: string) {
  return String(value ?? "").replace(/[^\d-]/g, "");
}

function hasIncomeDetail(detail?: IncomeDetail) {
  if (!detail) return false;

  return Boolean(
    detail.base ||
      detail.weekend ||
      detail.special ||
      detail.tax ||
      detail.baseNote ||
      detail.weekendNote ||
      detail.specialNote ||
      detail.taxNote ||
      (detail.extras ?? []).some((item) => item.title || item.amount || item.note)
  );
}

function calcIncomeDetailTotal(detail?: IncomeDetail) {
  if (!detail || !hasIncomeDetail(detail)) return 0;

  const base = parseSignedNumber(detail.base);
  const weekend = parseSignedNumber(detail.weekend);
  const special = parseSignedNumber(detail.special);
  const tax = parseSignedNumber(detail.tax);
  const extras = (detail.extras ?? []).reduce(
    (sum, item) => sum + parseSignedNumber(item.amount),
    0
  );

  return base + weekend + special - tax + extras;
}

function mergeIncomeDetail(autoDetail?: IncomeDetail, manualDetail?: IncomeDetail) {
  const auto = autoDetail ?? EMPTY_INCOME_DETAIL;
  const manual = manualDetail ?? EMPTY_INCOME_DETAIL;

  return {
    base: String(parseSignedNumber(auto.base) + parseSignedNumber(manual.base) || ""),
    baseNote: [auto.baseNote, manual.baseNote].filter(Boolean).join(" / "),
    weekend: manual.weekend,
    weekendNote: manual.weekendNote,
    special: manual.special,
    specialNote: manual.specialNote,
    tax: manual.tax,
    taxNote: manual.taxNote,
    extras: [...(auto.extras ?? []), ...(manual.extras ?? [])],
  } satisfies IncomeDetail;
}

function isSalaryCategory(category: string) {
  const key = String(category ?? "").replace(/\s+/g, "").toLowerCase();
  return ["월급", "급여", "salary", "payroll"].some((keyword) => key.includes(keyword));
}

function makeIncomeTxTitle(row: TransactionRow, category: string) {
  const desc = String(row.description ?? "").trim();
  if (category && category !== "기타") return category;
  return desc || "기타수입";
}

function makeIncomeTxNote(row: TransactionRow) {
  const parts = [row.tx_date, row.description, row.memo].map((v) => String(v ?? "").trim()).filter(Boolean);
  return parts.join(" · ");
}
function TopSummaryCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
}) {
  const toneClass =
    tone === "income"
      ? "text-sky-500"
      : tone === "expense"
      ? "text-rose-500"
      : tone === "accent"
      ? "text-[#0f766e]"
      : "text-slate-900";

  return (
    <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="text-xs font-semibold text-slate-400">{title}</div>
      <div className={`mt-2 text-[26px] font-black tracking-tight ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function AssetMetricTile({
  title,
  value,
  tone = "default",
  hint,
  editable,
  editing,
  inputValue,
  onInputChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  className = "",
}: {
  title: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
  hint?: string;
  editable?: boolean;
  editing?: boolean;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  className?: string;
}) {
  const toneClass =
    tone === "income"
      ? "text-sky-500"
      : tone === "expense"
      ? "text-rose-500"
      : tone === "accent"
      ? "text-[#0f766e]"
      : "text-slate-900";

  return (
    <div
      onDoubleClick={editable && !editing ? onStartEdit : undefined}
      className={`rounded-[22px] bg-slate-50 px-4 py-4 ${editable ? "transition hover:bg-slate-100" : ""} ${className}`}
      title={editable ? "더블클릭 또는 수정 버튼으로 시작자산 수정" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold text-slate-400">{title}</div>

        {editable && !editing ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
          >
            수정
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3">
          <input
            autoFocus
            type="text"
            value={inputValue ?? ""}
            onChange={(e) => onInputChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit?.();
              if (e.key === "Escape") onCancelEdit?.();
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#25c8c8]"
            placeholder="예: 3000000"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              className="rounded-full bg-[#ecfffb] px-3 py-1.5 text-xs font-bold text-[#0f766e] transition hover:bg-[#dafcf5]"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <div className={`mt-2 text-2xl font-black leading-tight ${toneClass}`}>
          {value}
        </div>
      )}

      {hint ? <div className="mt-2 text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function ManualCardItem({
  item,
  onChange,
  onRemove,
}: {
  item: ManualAdjustment;
  onChange: (field: "title" | "amount", value: string) => void;
  onRemove: () => void;
}) {
  const amount = parseSignedNumber(item.amount);
  const tone =
    amount > 0 ? "text-sky-500" : amount < 0 ? "text-rose-500" : "text-slate-400";

  return (
    <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs font-bold text-slate-400">수동 카드</div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm font-black text-rose-500 transition hover:bg-rose-100"
        >
          ×
        </button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
        <input
          type="text"
          value={item.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="타이틀 예: ETF 추가매수, 적금, 현금보정"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#25c8c8]"
        />
        <input
          type="text"
          value={item.amount}
          onChange={(e) => onChange("amount", e.target.value)}
          placeholder="예: +300000 / -150000"
          className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#25c8c8] ${tone}`}
        />
      </div>

      <div className="mt-2 text-xs text-slate-400">
        + 금액은 수입, - 금액은 지출로 자동 반영돼.
      </div>
    </div>
  );
}

function MiniMetricRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
}) {
  const toneClass =
    tone === "income"
      ? "text-emerald-600"
      : tone === "expense"
      ? "text-rose-500"
      : tone === "accent"
      ? "text-teal-700"
      : "text-slate-900";

  return (
    <div className="flex min-h-[58px] items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
      <span className="text-[12px] font-black text-slate-500">{label}</span>
      <span className={`text-[15px] font-black tracking-[-0.03em] ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function AssetMiniDetailLine({
  label,
  value,
  tone = "default",
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toneClass =
    tone === "income"
      ? "text-emerald-600"
      : tone === "expense"
      ? "text-rose-500"
      : tone === "accent"
      ? "text-teal-700"
      : "text-slate-950";

  return (
    <div className="flex items-center justify-between gap-3 rounded-full bg-white/80 px-4 py-3 ring-1 ring-slate-100">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
        <span className="truncate text-[14px] font-bold text-slate-600">
        {label}</span>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-400 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-600"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <span className={`shrink-0 text-[16px] font-extrabold tracking-[-0.02em] ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function IncomeDetailPopover({
  name,
  incomeDetail,
  onClose,
  onIncomeDetailChange,
}: {
  name: "기린" | "짱구";
  incomeDetail: IncomeDetail;
  onClose: () => void;
  onIncomeDetailChange: (field: keyof IncomeDetail, value: string | IncomeExtraItem[]) => void;
}) {
  return (
    <div className="absolute left-1/2 top-[145px] z-[999] w-[calc(100vw-24px)] max-w-[680px] -translate-x-1/2 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_28px_70px_rgba(15,23,42,0.18)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[18px] font-black tracking-[-0.04em] text-slate-900">
            {name} 수입 상세 정산
          </div>
          <div className="mt-1 text-[12px] font-semibold text-slate-500">
            기본금 + 수당 - 세금 + 기타 기준
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-[15px] font-black text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          ["base", "baseNote", "기본금"],
          ["weekend", "weekendNote", "주말수당"],
          ["special", "specialNote", "특별수당"],
          ["tax", "taxNote", "세금"],
        ].map(([amountField, noteField, label]) => (
          <div
            key={amountField}
            className="grid min-w-[520px] grid-cols-[70px_150px_minmax(0,1fr)] items-center gap-2 rounded-[16px] bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 sm:min-w-0 sm:grid-cols-[90px_140px_minmax(0,1fr)]"
          >
            <div className="text-[13px] font-black text-slate-700">{label}</div>

            <input
              type="text"
              value={formatInputMoney(incomeDetail[amountField as keyof IncomeDetail] as string)}
              onChange={(e) =>
                onIncomeDetailChange(
                  amountField as keyof IncomeDetail,
                  formatInputChange(e.target.value)
                )
              }
              className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-left text-[13px] font-black text-slate-900 outline-none focus:border-[#14b8a6]"
              placeholder="금액"
            />

            <input
              type="text"
              value={incomeDetail[noteField as keyof IncomeDetail] as string}
              onChange={(e) =>
                onIncomeDetailChange(noteField as keyof IncomeDetail, e.target.value)
              }
              className="h-9 w-full rounded-full border border-slate-200 bg-white px-3 text-left text-[13px] font-semibold text-slate-700 outline-none focus:border-[#14b8a6]"
              placeholder="비고"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[16px] bg-white px-4 py-3 ring-1 ring-slate-200">
        <span className="text-[13px] font-black text-slate-600">1차 정산 계</span>
        <span className="text-[18px] font-black text-slate-900">
          {formatMoney(
            parseSignedNumber(incomeDetail.base) +
              parseSignedNumber(incomeDetail.weekend) +
              parseSignedNumber(incomeDetail.special) -
              parseSignedNumber(incomeDetail.tax)
          )}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[14px] font-black text-slate-900">기타 수입</div>
        <button
          type="button"
          onClick={() =>
            onIncomeDetailChange("extras", [
              ...(incomeDetail.extras ?? []).filter((item) => item.source !== "auto" && !String(item.id).startsWith("tx-")),
              { id: makeId(), title: "", amount: "", note: "", source: "manual" },
            ])
          }
          className="rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-black text-white transition hover:bg-slate-700"
        >
          ＋ 추가
        </button>
      </div>

      <div className="mt-2 space-y-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(incomeDetail.extras ?? []).length === 0 ? (
          <div className="rounded-[14px] bg-slate-50 px-4 py-3 text-[12px] font-semibold text-slate-400 ring-1 ring-slate-100">
            추가 수입 항목이 없어요.
          </div>
        ) : (
          (incomeDetail.extras ?? []).map((extra, idx) => {
            const isAuto = extra.source === "auto" || String(extra.id).startsWith("tx-");
            const inputClass = isAuto
              ? "bg-white/70 text-slate-500"
              : "bg-white text-slate-700";

            return (
              <div
                key={extra.id}
                className="grid min-w-[560px] grid-cols-[110px_130px_minmax(0,1fr)_52px] items-center gap-2 rounded-[16px] bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 sm:min-w-0 sm:grid-cols-[110px_120px_minmax(0,1fr)_52px]"
              >
                <input
                  type="text"
                  value={extra.title}
                  readOnly={isAuto}
                  onChange={(e) => {
                    if (isAuto) return;
                    const next = [...(incomeDetail.extras ?? [])];
                    next[idx] = { ...extra, title: e.target.value };
                    onIncomeDetailChange("extras", next.filter((item) => item.source !== "auto" && !String(item.id).startsWith("tx-")));
                  }}
                  className={`h-9 min-w-0 rounded-full border border-slate-200 px-3 text-left text-[13px] font-black outline-none focus:border-[#14b8a6] ${inputClass}`}
                  placeholder="구분"
                />

                <input
                  type="text"
                  value={formatInputMoney(extra.amount)}
                  readOnly={isAuto}
                  onChange={(e) => {
                    if (isAuto) return;
                    const next = [...(incomeDetail.extras ?? [])];
                    next[idx] = { ...extra, amount: formatInputChange(e.target.value) };
                    onIncomeDetailChange("extras", next.filter((item) => item.source !== "auto" && !String(item.id).startsWith("tx-")));
                  }}
                  className={`h-9 min-w-0 rounded-full border border-slate-200 px-3 text-left text-[13px] font-black outline-none focus:border-[#14b8a6] ${isAuto ? "bg-white/70 text-slate-500" : "bg-white text-slate-900"}`}
                  placeholder="금액"
                />

                <input
                  type="text"
                  value={extra.note}
                  readOnly={isAuto}
                  onChange={(e) => {
                    if (isAuto) return;
                    const next = [...(incomeDetail.extras ?? [])];
                    next[idx] = { ...extra, note: e.target.value };
                    onIncomeDetailChange("extras", next.filter((item) => item.source !== "auto" && !String(item.id).startsWith("tx-")));
                  }}
                  className={`h-9 min-w-0 rounded-full border border-slate-200 px-3 text-left text-[13px] font-semibold outline-none focus:border-[#14b8a6] ${inputClass}`}
                  placeholder="비고"
                />

                {isAuto ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-center text-[10px] font-black text-emerald-600 ring-1 ring-emerald-100">
                    자동
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const next = (incomeDetail.extras ?? [])
                        .filter((_, i) => i !== idx)
                        .filter((item) => item.source !== "auto" && !String(item.id).startsWith("tx-"));
                      onIncomeDetailChange("extras", next);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-[13px] font-black text-rose-500 transition hover:bg-rose-100"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[18px] bg-[#f0fdf4] px-5 py-4 ring-1 ring-emerald-100">
        <div>
          <div className="text-[13px] font-black text-emerald-700">최종 계</div>
          <div className="mt-0.5 text-[11px] font-semibold text-emerald-600">총 수입</div>
        </div>
        <div className="text-[24px] font-black tracking-[-0.05em] text-emerald-600">
          {formatMoney(calcIncomeDetailTotal(incomeDetail))}
        </div>
      </div>
    </div>
  );
}

function ManualCompactList({
  items,
  onChangeManual,
  onRemoveManual,
}: {
  items: ManualAdjustment[];
  onChangeManual: (id: string, field: "title" | "amount", value: string) => void;
  onRemoveManual: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[12px] font-semibold text-slate-400 ring-1 ring-slate-100">
        기타보유금 항목 없음
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const amount = parseSignedNumber(item.amount);
        const amountTone = amount >= 0 ? "text-emerald-600" : "text-rose-500";

        return (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_140px_30px] items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"
          >
            <input
              type="text"
              value={item.title}
              onChange={(e) => onChangeManual(item.id, "title", e.target.value)}
              placeholder="항목명"
              className="h-9 min-w-0 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-[#14b8a6]"
            />
            <input
              type="text"
              value={item.amount}
              onChange={(e) => onChangeManual(item.id, "amount", e.target.value)}
              placeholder="+300000"
              className={`h-9 rounded-full border border-slate-200 bg-white px-3 text-left text-[12px] font-black outline-none focus:border-[#14b8a6] ${amountTone}`}
            />
            <button
              type="button"
              onClick={() => onRemoveManual(item.id)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-[13px] font-black text-rose-500 transition hover:bg-rose-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PersonAssetCard({
  name,
  isBaseMonth,
  baseAsset,
  onBaseAssetChange,
  carryIn,
  income,
  expense,
  manualItems,
  manualNet,
  ending,
  incomeDetail,
  trendItems,
  onIncomeDetailChange,
  onAddManual,
  onChangeManual,
  onRemoveManual,
}: {
  name: "기린" | "짱구";
  isBaseMonth: boolean;
  baseAsset: number;
  onBaseAssetChange: (value: string) => void;
  carryIn: number;
  income: number;
  expense: number;
  manualItems: ManualAdjustment[];
  manualNet: number;
  ending: number;
  incomeDetail: IncomeDetail;
  trendItems: { month: string; label: string; ending: number }[];
  onIncomeDetailChange: (field: keyof IncomeDetail, value: string | IncomeExtraItem[]) => void;
  onAddManual: () => void;
  onChangeManual: (id: string, field: "title" | "amount", value: string) => void;
  onRemoveManual: (id: string) => void;
}) {
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [showIncomeDetail, setShowIncomeDetail] = useState(false);
  const [baseInput, setBaseInput] = useState(String(baseAsset || ""));

  useEffect(() => {
    if (!isEditingBase) setBaseInput(String(baseAsset || ""));
  }, [baseAsset, isEditingBase]);

  useEffect(() => {
    if (!isBaseMonth && isEditingBase) setIsEditingBase(false);
  }, [isBaseMonth, isEditingBase]);

  const saveBase = () => {
    onBaseAssetChange(baseInput);
    setIsEditingBase(false);
  };

  const iconSrc = name === "기린" ? "/icons/girin.png" : "/icons/zzangu.png";
  const badgeTone = "bg-white/80 backdrop-blur-sm";
  const cardTone =
  name === "기린"
    ? "bg-[#edfdf9] border-[#bff2e8]"
    : "bg-[#ffe08a] border-[#ffd25a]";
  const manualTone = manualNet >= 0 ? "income" : "expense";

  return (
    <div
    className={[
      `relative rounded-[30px] border p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_70px_rgba(15,23,42,0.12)] ${cardTone}`,
      showIncomeDetail ? "z-50" : "z-0",
    ].join(" ")}
  >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] ring-1 ${badgeTone}`}>
            <img src={iconSrc} alt={name} className="h-[58px] w-[58px] object-contain" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[27px] font-black tracking-[-0.055em] text-slate-900">
                {name}
              </h2>
              {isBaseMonth ? (
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">
                  시작월
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[14px] font-semibold text-slate-400">
              개인 현금자산 관리
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[13px] font-black text-slate-400">현재 자산</div>
          <div className="mt-1 text-[26px] font-black tracking-[-0.065em] text-slate-950">
            {formatMoney(ending)}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[22px] bg-[#f8fafc] p-3 ring-1 ring-slate-100">
        <div className="grid gap-2">
          <AssetMiniDetailLine
            label={isBaseMonth ? "시작자산" : "전월 이월"}
            value={formatMoney(carryIn)}
          />
          <AssetMiniDetailLine
            label="이번달 수입"
            value={formatMoney(income)}
            tone="income"
            actionLabel={showIncomeDetail ? "닫기" : "상세"}
            onAction={() => setShowIncomeDetail((prev) => !prev)}
          />
          <AssetMiniDetailLine
            label="총 지출"
            value={formatMoney(expense)}
            tone="expense"
          />
          <AssetMiniDetailLine
            label="기타보유금"
            value={formatMoney(manualNet)}
            tone={manualTone}
          />
        </div>
      </div>

      {showIncomeDetail ? (
        <IncomeDetailPopover
          name={name}
          incomeDetail={incomeDetail}
          onClose={() => setShowIncomeDetail(false)}
          onIncomeDetailChange={onIncomeDetailChange}
        />
      ) : null}

      {isBaseMonth ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-slate-500">시작자산 수정</span>
            {!isEditingBase ? (
              <button
                type="button"
                onClick={() => setIsEditingBase(true)}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
              >
                수정
              </button>
            ) : null}
          </div>

          {isEditingBase ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={baseInput}
                onChange={(e) => setBaseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveBase();
                  if (e.key === "Escape") {
                    setBaseInput(String(baseAsset || ""));
                    setIsEditingBase(false);
                  }
                }}
                className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-left text-sm font-black text-slate-900 outline-none focus:border-[#14b8a6]"
                placeholder="예: 3000000"
              />
              <button
                type="button"
                onClick={() => {
                  setBaseInput(String(baseAsset || ""));
                  setIsEditingBase(false);
                }}
                className="h-9 rounded-full bg-white px-3 text-[12px] font-black text-slate-500 ring-1 ring-slate-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveBase}
                className="h-9 rounded-full bg-slate-900 px-3 text-[12px] font-black text-white"
              >
                저장
              </button>
            </div>
          ) : (
            <div className="text-[12px] font-semibold text-slate-400">
              시작월에서만 전월 이월 기준값을 수정할 수 있어요.
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div>
          <div className="text-[13px] font-black text-slate-900">기타보유금</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
            적금 · 현금보정 · 별도 보유금
          </div>
        </div>
        <button
          type="button"
          onClick={onAddManual}
          className="inline-flex h-9 items-center justify-center rounded-full bg-slate-900 px-3.5 text-[12px] font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
        >
          ＋ 추가
        </button>
      </div>

      <div className="mt-3">
        <ManualCompactList
          items={manualItems}
          onChangeManual={onChangeManual}
          onRemoveManual={onRemoveManual}
        />
      </div>
    </div>
  );
}

export default function AssetsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [baseAssets, setBaseAssets] = useState<BaseAssets>({ 기린: 0, 짱구: 0 });
  const [manualCards, setManualCards] = useState<ManualAdjustmentMap>({});
  const [incomeDetails, setIncomeDetails] = useState<IncomeDetailMap>({});
  
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(true);
  

  useEffect(() => {
    setBaseAssets(loadBaseAssets());
    setManualCards(loadManualCards());
    setIncomeDetails(loadIncomeDetails());
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data } = await supabase
        .from("transactions")
        .select("id, tx_date, description, type, amount, user_type, memo, created_at")
        .order("tx_date", { ascending: false })
        .order("created_at", { ascending: false });

      setRows((data ?? []) as TransactionRow[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  // UI 선택 목록은 최신월 -> 오래된월 순서
  const monthOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => parseDateMeta(row.tx_date)?.ym)
          .filter((v): v is string => Boolean(v))
      )
    ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [rows]);

  // 자산 이월 계산은 오래된월 -> 최신월 순서로 별도 사용
  const timelineMonthOptions = useMemo(() => [...monthOptions].reverse(), [monthOptions]);

  const latestMonth = monthOptions[0] ?? "";
  const oldestMonth = monthOptions[monthOptions.length - 1] ?? "";

  useEffect(() => {
    if (!monthFilter && latestMonth) {
      setMonthFilter(latestMonth);
    }
  }, [monthFilter, latestMonth]);

  useEffect(() => {
    if (!monthFilter) return;
    if (monthOptions.length === 0) return;
    if (!monthOptions.includes(monthFilter)) {
      setMonthFilter(latestMonth);
    }
  }, [monthFilter, monthOptions, latestMonth]);

  const txSummaryByMonth = useMemo(() => {
    const result = new Map<
      string,
      { 기린: { income: number; expense: number }; 짱구: { income: number; expense: number } }
    >();

    for (const month of timelineMonthOptions) {
      result.set(month, {
        기린: { income: 0, expense: 0 },
        짱구: { income: 0, expense: 0 },
      });
    }

    for (const row of rows) {
      const meta = parseDateMeta(row.tx_date);
      if (!meta) continue;

      const user = normalizeUserTag(row.user_type);
      if (user !== "기린" && user !== "짱구") continue;

      if (!result.has(meta.ym)) {
        result.set(meta.ym, {
          기린: { income: 0, expense: 0 },
          짱구: { income: 0, expense: 0 },
        });
      }

      const amount = getNormalizedAmount(row);
      const bucket = result.get(meta.ym)![user as "기린" | "짱구"];

      if (amount >= 0) bucket.income += amount;
      else bucket.expense += Math.abs(amount);
    }

    return result;
  }, [rows, timelineMonthOptions]);

  const autoIncomeDetails = useMemo(() => {
    const result: IncomeDetailMap = {};

    for (const row of rows) {
      const meta = parseDateMeta(row.tx_date);
      if (!meta) continue;

      const user = normalizeUserTag(row.user_type);
      if (user !== "기린" && user !== "짱구") continue;

      const amount = getNormalizedAmount(row);
      if (amount <= 0) continue;

      const typeMeta = splitType(row.type);
      const category = typeMeta.category || "기타수입";

      const monthData = result[meta.ym] ?? {
        기린: { ...EMPTY_INCOME_DETAIL, extras: [] },
        짱구: { ...EMPTY_INCOME_DETAIL, extras: [] },
      };

      const detail = monthData[user] ?? { ...EMPTY_INCOME_DETAIL, extras: [] };

      if (isSalaryCategory(category)) {
        const nextBase = parseSignedNumber(detail.base) + Math.abs(amount);
        const count = String(detail.baseNote || "").match(/자동 월급 (\d+)건/)?.[1];
        const nextCount = count ? Number(count) + 1 : 1;
        monthData[user] = {
          ...detail,
          base: String(nextBase),
          baseNote: `자동 월급 ${nextCount}건`,
        };
      } else {
        monthData[user] = {
          ...detail,
          extras: [
            ...(detail.extras ?? []),
            {
              id: `tx-${row.id}`,
              title: makeIncomeTxTitle(row, category),
              amount: String(Math.abs(amount)),
              note: makeIncomeTxNote(row),
              source: "auto",
            },
          ],
        };
      }

      result[meta.ym] = monthData;
    }

    return result;
  }, [rows]);

  const manualSummaryByMonth = useMemo(() => {
    const result = new Map<string, { 기린: number; 짱구: number }>();

    for (const month of Object.keys(manualCards)) {
      const monthData = manualCards[month] ?? { 기린: [], 짱구: [] };
      result.set(month, {
        기린: (monthData.기린 ?? []).reduce(
          (sum, item) => sum + parseSignedNumber(item.amount),
          0
        ),
        짱구: (monthData.짱구 ?? []).reduce(
          (sum, item) => sum + parseSignedNumber(item.amount),
          0
        ),
      });
    }

    return result;
  }, [manualCards]);

  const timeline = useMemo(() => {
    const entries: Array<{
      month: string;
      기린: { carryIn: number; income: number; expense: number; manualNet: number; ending: number };
      짱구: { carryIn: number; income: number; expense: number; manualNet: number; ending: number };
    }> = [];

    let prevGirin = Number(baseAssets.기린 || 0);
    let prevJjanggu = Number(baseAssets.짱구 || 0);

    for (const month of timelineMonthOptions) {
      const tx = txSummaryByMonth.get(month) ?? {
        기린: { income: 0, expense: 0 },
        짱구: { income: 0, expense: 0 },
      };

      const manual = manualSummaryByMonth.get(month) ?? { 기린: 0, 짱구: 0 };

      const girinCarry = prevGirin;
      const jjangguCarry = prevJjanggu;

      const girinDetail = mergeIncomeDetail(autoIncomeDetails[month]?.기린, incomeDetails[month]?.기린);
      const jjangguDetail = mergeIncomeDetail(autoIncomeDetails[month]?.짱구, incomeDetails[month]?.짱구);

      const girinIncome = hasIncomeDetail(girinDetail)
        ? calcIncomeDetailTotal(girinDetail)
        : tx.기린.income;

      const jjangguIncome = hasIncomeDetail(jjangguDetail)
        ? calcIncomeDetailTotal(jjangguDetail)
        : tx.짱구.income;

      const girinEnding = girinCarry + girinIncome - tx.기린.expense + manual.기린;
      const jjangguEnding = jjangguCarry + jjangguIncome - tx.짱구.expense + manual.짱구;

      entries.push({
        month,
        기린: {
          carryIn: girinCarry,
          income: girinIncome,
          expense: tx.기린.expense,
          manualNet: manual.기린,
          ending: girinEnding,
        },
        짱구: {
          carryIn: jjangguCarry,
          income: jjangguIncome,
          expense: tx.짱구.expense,
          manualNet: manual.짱구,
          ending: jjangguEnding,
        },
      });

      prevGirin = girinEnding;
      prevJjanggu = jjangguEnding;
    }

    return entries;
  }, [timelineMonthOptions, txSummaryByMonth, manualSummaryByMonth, baseAssets, incomeDetails, autoIncomeDetails]);

  const currentEntry = useMemo(() => {
    return timeline.find((item) => item.month === monthFilter) ?? null;
  }, [timeline, monthFilter]);

  const updateBaseAsset = (name: "기린" | "짱구", value: string) => {
    const num = parseSignedNumber(value);

    setBaseAssets((prev) => {
      const next = { ...prev, [name]: num };
      saveBaseAssets(next);
      return next;
    });
  };

  const getManualItems = (month: string, name: "기린" | "짱구") => {
    return manualCards[month]?.[name] ?? [];
  };
  const getIncomeDetail = (month: string, name: "기린" | "짱구") => {
    return mergeIncomeDetail(autoIncomeDetails[month]?.[name], incomeDetails[month]?.[name]);
  };

  const updateIncomeDetail = (
    month: string,
    name: "기린" | "짱구",
    field: keyof IncomeDetail,
    value: string | IncomeExtraItem[]
  ) => {
    setIncomeDetails((prev) => {
      const monthData = prev[month] ?? {
        기린: EMPTY_INCOME_DETAIL,
        짱구: EMPTY_INCOME_DETAIL,
      };

      const next: IncomeDetailMap = {
        ...prev,
        [month]: {
          기린: monthData.기린 ?? EMPTY_INCOME_DETAIL,
          짱구: monthData.짱구 ?? EMPTY_INCOME_DETAIL,
          [name]: {
            ...(monthData[name] ?? EMPTY_INCOME_DETAIL),
            [field]: value,
          },
        },
      };

      saveIncomeDetails(next);
      return next;
    });
  };
  const addManualCard = (month: string, name: "기린" | "짱구") => {
    setManualCards((prev) => {
      const monthData = prev[month] ?? { 기린: [], 짱구: [] };

      const next: ManualAdjustmentMap = {
        ...prev,
        [month]: {
          기린: monthData.기린 ?? [],
          짱구: monthData.짱구 ?? [],
          [name]: [...(monthData[name] ?? []), { id: makeId(), title: "", amount: "" }],
        },
      };

      saveManualCards(next);
      return next;
    });
  };

  const updateManualCard = (
    month: string,
    name: "기린" | "짱구",
    id: string,
    field: "title" | "amount",
    value: string
  ) => {
    setManualCards((prev) => {
      const monthData = prev[month] ?? { 기린: [], 짱구: [] };
      const nextList = (monthData[name] ?? []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      );

      const next: ManualAdjustmentMap = {
        ...prev,
        [month]: {
          기린: monthData.기린 ?? [],
          짱구: monthData.짱구 ?? [],
          [name]: nextList,
        },
      };

      saveManualCards(next);
      return next;
    });
  };

  const removeManualCard = (month: string, name: "기린" | "짱구", id: string) => {
    setManualCards((prev) => {
      const monthData = prev[month] ?? { 기린: [], 짱구: [] };

      const next: ManualAdjustmentMap = {
        ...prev,
        [month]: {
          기린: monthData.기린 ?? [],
          짱구: monthData.짱구 ?? [],
          [name]: (monthData[name] ?? []).filter((item) => item.id !== id),
        },
      };

      saveManualCards(next);
      return next;
    });
  };

  const totalSummary = currentEntry
    ? {
        carryIn: currentEntry.기린.carryIn + currentEntry.짱구.carryIn,
        income: currentEntry.기린.income + currentEntry.짱구.income,
        expense: currentEntry.기린.expense + currentEntry.짱구.expense,
        manualNet: currentEntry.기린.manualNet + currentEntry.짱구.manualNet,
        ending: currentEntry.기린.ending + currentEntry.짱구.ending,
      }
    : { carryIn: 0, income: 0, expense: 0, manualNet: 0, ending: 0 };

  const assetTrend = useMemo(() => {
    return timeline.slice(-6).map((entry) => {
      const ending = entry.기린.ending + entry.짱구.ending;
      const income = entry.기린.income + entry.짱구.income;
      const expense = entry.기린.expense + entry.짱구.expense;
      const manualNet = entry.기린.manualNet + entry.짱구.manualNet;

      return {
        month: entry.month,
        label: getMonthShort(entry.month),
        ending,
        income,
        expense,
        manualNet,
      };
    });
  }, [timeline]);

const girinTrend = useMemo(() => {
  return timeline.slice(-6).map((entry) => ({
    month: entry.month,
    label: getMonthShort(entry.month),
    ending: entry.기린.ending,
  }));
}, [timeline]);

const jjangguTrend = useMemo(() => {
  return timeline.slice(-6).map((entry) => ({
    month: entry.month,
    label: getMonthShort(entry.month),
    ending: entry.짱구.ending,
  }));
}, [timeline]);
  const prevAsset = assetTrend.length >= 2
  ? assetTrend[assetTrend.length - 2].ending
  : 0;

  const currentAsset = assetTrend.length >= 1
    ? assetTrend[assetTrend.length - 1].ending
    : 0;



  const diffAsset = currentAsset - prevAsset;
  const assetComment = assetTrend.length < 2
  ? "전월 대비 데이터 없음"
  : diffAsset > 0
    ? `전월 대비 ${formatMoney(diffAsset)} 증가했어요`
    : diffAsset < 0
      ? `전월 대비 ${formatMoney(Math.abs(diffAsset))} 감소했어요`
      : "전월 대비 변동 없음";
  const assetChartWidth = 620;
  const assetChartHeight = 320;
  const assetPadX = 72;
  const assetTopY = 18;
  const assetBottomY = 32;
  const assetInnerHeight = assetChartHeight - assetTopY - assetBottomY;
  const assetBaseY = assetTopY + assetInnerHeight;

  const assetValues = assetTrend.map((item) => item.ending);
  const rawMin = assetValues.length ? Math.min(...assetValues) : 0;
  const rawMax = assetValues.length ? Math.max(...assetValues) : 1;
  const rawRange = Math.max(rawMax - rawMin, 1);
  const rawAbsMax = Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
  const assetRangePadding = Math.max(rawRange * 0.18, rawAbsMax * 0.08, 1);
  const assetChartMin = rawMin < 0 ? rawMin - assetRangePadding : Math.max(0, rawMin - assetRangePadding);
  const assetChartMax = rawMax + assetRangePadding;
  const assetChartRange = Math.max(assetChartMax - assetChartMin, 1); 

  const pathRef = useRef<SVGPathElement | null>(null);  
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const assetPoints = assetTrend.map((item, index) => {
    const step = assetTrend.length > 1 ? (assetChartWidth - assetPadX * 2) / (assetTrend.length - 1) : 0;

    return {
      x: assetPadX + step * index,
      y: assetBaseY - ((item.ending - assetChartMin) / assetChartRange) * assetInnerHeight,
    };
  });
  useEffect(() => {
    if (!pathRef.current) return;

    const length = pathRef.current.getTotalLength();

    pathRef.current.style.strokeDasharray = `${length}`;
    pathRef.current.style.strokeDashoffset = `${length}`;

    requestAnimationFrame(() => {
      pathRef.current!.style.transition = "stroke-dashoffset 0.45s ease-out";
      pathRef.current!.style.strokeDashoffset = "0";
    });
  }, [assetTrend]);
  return (
    <main className="min-h-screen bg-white pb-12">
    <section className="hidden bg-[linear-gradient(135deg,#3ec7c1_0%,#2fb3ad_100%)] sm:block">
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-8">
        <div className="flex min-h-[34px] items-center sm:block sm:min-h-0 sm:py-2">
          <div className="hidden items-center gap-1.5 rounded-full border border-white/35 bg-white/35 px-2.5 py-1 text-[10px] font-bold text-[#063f3a] sm:inline-flex">
            <span>{monthFilter ? getMonthLabel(monthFilter) : "월 선택"} 자산 분석</span>
            <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[9px] font-black">
              ASSET
            </span>
          </div>

          <div className="sm:mt-3">
            <h1 className="text-[20px] font-black tracking-[-0.045em] text-white sm:text-[38px]">
              기린 · 짱구 자산현황
            </h1>

            <p className="mt-2 hidden text-[10px] font-medium leading-relaxed text-white/80 sm:block sm:text-[14px]">
              전월 자산 자동 이월과 수동 보정 카드로 월말 자산 흐름을 확인해요.
            </p>

            <div className="mt-3 hidden items-center justify-center gap-1.5 sm:mt-6 sm:flex sm:justify-start sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  const idx = monthOptions.indexOf(monthFilter);
                  if (idx > 0) {
                    setMonthFilter(monthOptions[idx - 1]);
                  }
                }}
                disabled={!monthFilter || monthOptions.indexOf(monthFilter) <= 0}
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
                  {monthOptions.map((month) => (
                      <option key={month} value={month}>
                        {getMonthLabel(month)}
                      </option>
                    ))}
                </select>

                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#0f766e]">
                  ▼
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const idx = monthOptions.indexOf(monthFilter);
                  if (idx >= 0 && idx < monthOptions.length - 1) {
                    setMonthFilter(monthOptions[idx + 1]);
                  }
                }}
                disabled={!monthFilter || monthOptions.indexOf(monthFilter) >= monthOptions.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/30 text-sm font-black text-slate-900 transition hover:bg-white/50 disabled:opacity-30 sm:h-11 sm:w-11 sm:text-lg"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 pt-3 sm:hidden">
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
            className="h-9 appearance-none rounded-full border border-slate-200 bg-white px-5 pr-8 text-[12px] font-black text-[#0f766e] shadow-sm outline-none"
          >
            {monthOptions.map((month) => (
              <option key={month} value={month}>{getMonthLabel(month)}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#0f766e]">▼</div>
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
    </section>

    <section className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-8">
      {loading ? (
        <div className="rounded-[28px] bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
          불러오는 중...
        </div>
      ) : (
        <>
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
    <div className="grid gap-6 xl:grid-cols-2">
      
    {/* 좌측: 요약 */}
    <div className="flex flex-col gap-3">
      <div className="rounded-[26px] bg-[#f0fdf4] px-6 py-5 ring-1 ring-emerald-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[13px] font-black text-emerald-700">
              현재 총 자산
            </div>
            <div className="mt-1 text-[34px] font-black tracking-[-0.06em] text-emerald-600">
              {formatMoney(totalSummary.ending)}
            </div>
          </div>
        </div>

        <div className="mt-3 text-[14px] font-bold text-emerald-700/75">
          {assetComment}
        </div>
      </div>

      <div className="grid gap-2">
        {[
          { label: "이번달 총 수익", value: totalSummary.income, tone: "text-emerald-600" },
          { label: "총 지출", value: totalSummary.expense, tone: "text-rose-500" },
          { label: "전월 이월금", value: totalSummary.carryIn, tone: "text-slate-900" },
          {
            label: "기타보유금",
            value: totalSummary.manualNet,
            tone: totalSummary.manualNet >= 0 ? "text-emerald-600" : "text-rose-500",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex h-[46px] items-center justify-between rounded-[16px] bg-slate-50 px-4 ring-1 ring-slate-200"
          >
            <span className="text-[13px] font-black text-slate-600">
              {item.label}
            </span>
            <span className={`text-[17px] font-black tracking-[-0.03em] ${item.tone}`}>
              {formatMoney(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>

        {/* 우측: 그래프 */}
        <div className="flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[20px] font-black text-slate-900">
                최근 자산 흐름
              </div>
              <div className="text-[13px] font-semibold text-slate-500">
                최근 {assetTrend.length}개월
              </div>
            </div>
          </div>

          <div className="mt-2 flex-1 rounded-[22px] bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            {assetTrend.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                데이터 없음
              </div>
            ) : (
              <svg viewBox={`0 0 ${assetChartWidth} ${assetChartHeight}`} className="h-[210px] w-full overflow-visible sm:h-[300px]">
                
            {[0, 0.25, 0.5, 0.75, 1].map((rate) => {
              const y = assetBaseY - rate * assetInnerHeight;
              const value = assetChartMin + assetChartRange * rate;

              return (
                <g key={rate}>
                  <line
                    x1={assetPadX}
                    x2={assetChartWidth - assetPadX}
                    y1={y}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 6"
                  />

                  {rate > 0 ? (
                    <text
                      x={assetPadX - 10}
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

                {assetChartMin < 0 && assetChartMax > 0 ? (() => {
                  const zeroY = assetBaseY - ((0 - assetChartMin) / assetChartRange) * assetInnerHeight;
                  return (
                    <line
                      x1={assetPadX}
                      x2={assetChartWidth - assetPadX}
                      y1={zeroY}
                      y2={zeroY}
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                    />
                  );
                })() : null}

                <path
                  ref={pathRef}
                  d={buildSmoothPath(assetPoints)}
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth="5"
                />

                {assetPoints.map((p, i) => (
                  <g
                    key={i}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    onClick={() => setHoverIdx((prev) => (prev === i ? null : i))}
                    className="cursor-pointer"
                  >
                    {/* 실제 보이는 점 */}
                    <circle cx={p.x} cy={p.y} r="6" fill="#14b8a6" />

                    {/* 호버 판정용 투명 영역 */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="22"
                      fill="transparent"
                      pointerEvents="all"
                    />
                  </g>
                ))}
                {hoverIdx !== null && (() => {
                  const p = assetPoints[hoverIdx];
                  const item = assetTrend[hoverIdx];

                  const tooltipW = 172;
                  const tooltipH = 52;
                  const tooltipX = Math.min(
                    Math.max(p.x - tooltipW / 2, 8),
                    assetChartWidth - tooltipW - 8
                  );
                  const tooltipY = Math.max(p.y - tooltipH - 18, 8);

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
                        {formatMoney(item.ending)}
                      </text>

                      <text
                        x={tooltipX + tooltipW / 2}
                        y={tooltipY + 42}
                        textAnchor="middle"
                        className="fill-gray-300 text-[13px] font-bold"
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                })()}
                {assetPoints.map((p, i) => {
                  const item = assetTrend[i];

                  return (
                    <text
                      key={`month-${item.month}`}
                      onClick={() => setHoverIdx((prev) => (prev === i ? null : i))}
                      className="cursor-pointer fill-slate-500 text-[12px] font-black"
                      x={p.x}
                      y={assetChartHeight - 10}
                      textAnchor={
                        i === 0 ? "start" : i === assetPoints.length - 1 ? "end" : "middle"
                      }
                      >
                      {item.label}
                    </text>
                  );
                })}
              </svg>
            )}
          </div>
         </div>
      </div>
    </div>

            {currentEntry ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <PersonAssetCard
                  name="기린"
                  trendItems={girinTrend}
                  isBaseMonth={monthFilter === oldestMonth}
                  baseAsset={baseAssets.기린}
                  onBaseAssetChange={(value) => updateBaseAsset("기린", value)}
                  carryIn={currentEntry.기린.carryIn}
                  income={currentEntry.기린.income}
                  expense={currentEntry.기린.expense}
                  manualItems={getManualItems(monthFilter, "기린")}
                  manualNet={currentEntry.기린.manualNet}
                  ending={currentEntry.기린.ending}
                  incomeDetail={getIncomeDetail(monthFilter, "기린")}
                  onIncomeDetailChange={(field, value) =>
                    updateIncomeDetail(monthFilter, "기린", field, value)
                  }
                  onAddManual={() => addManualCard(monthFilter, "기린")}
                  onChangeManual={(id, field, value) =>
                    updateManualCard(monthFilter, "기린", id, field, value)
                  }
                  onRemoveManual={(id) => removeManualCard(monthFilter, "기린", id)}
                />

                <PersonAssetCard
                  name="짱구"
                  trendItems={jjangguTrend}
                  isBaseMonth={monthFilter === oldestMonth}
                  baseAsset={baseAssets.짱구}
                  onBaseAssetChange={(value) => updateBaseAsset("짱구", value)}
                  carryIn={currentEntry.짱구.carryIn}
                  income={currentEntry.짱구.income}
                  expense={currentEntry.짱구.expense}
                  manualItems={getManualItems(monthFilter, "짱구")}
                  manualNet={currentEntry.짱구.manualNet}
                  ending={currentEntry.짱구.ending}
                  incomeDetail={getIncomeDetail(monthFilter, "짱구")}
                  onIncomeDetailChange={(field, value) =>
                    updateIncomeDetail(monthFilter, "짱구", field, value)
                  }
                  onAddManual={() => addManualCard(monthFilter, "짱구")}
                  onChangeManual={(id, field, value) =>
                    updateManualCard(monthFilter, "짱구", id, field, value)
                  }
                  onRemoveManual={(id) => removeManualCard(monthFilter, "짱구", id)}
                />
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] bg-white p-8 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
                아직 거래 데이터가 없어서 자산 흐름을 계산할 수 없어.
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}