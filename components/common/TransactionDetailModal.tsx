"use client";

import type { ReactNode } from "react";
import { splitType, isoToShortDate, parseShortDate, formatSignedMoney } from "@/lib/finance-utils";
import { normalizeAccountLabel, normalizeUserTag } from "@/lib/finance-labels";
import { isImageIcon, resolveOptionIcon, type OptionIconMap } from "@/lib/option-icons";

export type TransactionLike = {
  id: string | number;
  tx_date: string | null;
  description: string | null;
  type: string | null;
  amount: number | null;
  balance: number | null;
  user_type: string | null;
  account_type: string | null;
  memo?: string | null;
};

export type TransactionEditForm = {
  id: string | number;
  tx_date: string;
  description: string;
  type: string;
  amount: string;
  balance: string;
  user_type: string;
  account_type: string;
  memo: string;
};

function formatNumberWithComma(value: string | number) {
  const num = String(value).replace(/,/g, "");
  if (!num) return "";
  return Number(num).toLocaleString();
}

function parseNullableNumber(value: string) {
  const cleaned = value.replace(/[,\s원₩]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function makeTransactionEditForm(row: TransactionLike): TransactionEditForm {
  return {
    id: row.id,
    tx_date: parseShortDate(row.tx_date)?.iso ?? "",
    description: row.description ?? "",
    type: row.type ?? "",
    amount: row.amount !== null && row.amount !== undefined ? String(Math.abs(row.amount)) : "",
    balance: row.balance !== null && row.balance !== undefined ? String(row.balance) : "",
    user_type: normalizeUserTag(row.user_type ?? ""),
    account_type: normalizeAccountLabel(row.account_type ?? ""),
    memo: row.memo ?? "",
  };
}

export function getTransactionEditSignedAmount(editing: TransactionEditForm) {
  const typeMeta = splitType(editing.type);
  const raw = Math.abs(Number(editing.amount || 0));

  if (typeMeta.flow === "지출" || editing.type.startsWith("지출/")) return -raw;
  if (typeMeta.flow === "수입" || editing.type.startsWith("수입/")) return raw;
  return raw;
}

export function buildTransactionUpdatePayload(editing: TransactionEditForm) {
  return {
    tx_date: editing.tx_date ? isoToShortDate(editing.tx_date) : null,
    description: editing.description.trim() || null,
    type: editing.type.trim() || null,
    amount: getTransactionEditSignedAmount(editing),
    balance: parseNullableNumber(editing.balance),
    user_type: normalizeUserTag(editing.user_type.trim() || null) || null,
    account_type: normalizeAccountLabel(editing.account_type.trim() || null) || null,
    memo: editing.memo.trim() || null,
  };
}

function getTypeFlowOptions(typeOptions: string[]) {
  return Array.from(new Set(typeOptions.map((type) => splitType(type).flow).filter(Boolean)));
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

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1.5 text-[11px] font-black text-slate-400">{label}</div>
      {children}
    </label>
  );
}

type Props = {
  editing: TransactionEditForm;
  typeOptions: string[];
  accountOptions: string[];
  optionIcons?: OptionIconMap;
  saveLoading?: boolean;
  deleteLoading?: boolean;
  onChange: (key: keyof TransactionEditForm, value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export default function TransactionDetailModal({
  editing,
  typeOptions,
  accountOptions,
  optionIcons = {},
  saveLoading = false,
  deleteLoading = false,
  onChange,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const editTypeMeta = splitType(editing.type);
  const editAmount = getTransactionEditSignedAmount(editing);
  const categoryOptionsForFlow = getTypeCategoryOptions(typeOptions, editTypeMeta.flow);
  const flowOptions = getTypeFlowOptions(typeOptions);
  const safeFlowOptions = flowOptions.length > 0 ? flowOptions : ["지출", "수입"];

  const renderIcon = (group: "users" | "accounts" | "categories", label: string | null) => {
    const icon = resolveOptionIcon(group, label, optionIcons);
    if (!icon) return null;
    if (isImageIcon(icon)) return <img src={icon} alt="" className="h-5 w-5 object-contain" />;
    return <span className="text-base leading-none">{icon}</span>;
  };

  const setEditFlow = (flow: string) => {
    const nextCategory = getTypeCategoryOptions(typeOptions, flow)[0] ?? "기타";
    onChange("type", `${flow}/${nextCategory}`);
  };

  const setEditCategory = (category: string) => {
    const flow = editTypeMeta.flow || "지출";
    onChange("type", `${flow}/${category}`);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-x-hidden bg-slate-950/45 px-3 py-4 backdrop-blur-sm touch-pan-y">
      <div className="max-h-[90vh] w-full max-w-[calc(100vw-24px)] overflow-x-hidden overflow-y-auto rounded-[26px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)] sm:max-w-2xl sm:rounded-[34px]" style={{ touchAction: "pan-y" }}>
        <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fffe_0%,#effffe_100%)] px-5 py-4 sm:px-7 sm:py-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-black text-slate-400 shadow-sm transition hover:bg-slate-50 hover:text-slate-600 sm:right-5 sm:top-5 sm:h-10 sm:w-10"
          >
            ×
          </button>

          <div className="pr-12">
            <div className="inline-flex rounded-full bg-[#d8f3f1] px-3 py-1 text-[11px] font-black text-[#0f766e]">
              TRANSACTION DETAIL
            </div>
            <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-800 sm:mt-3 sm:text-2xl">
              거래내역 상세/수정
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-400 sm:text-sm">
              날짜·분류·금액·메모까지 거래건별로 확인하고 수정해요.
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
                  {editing.memo ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-amber-500">
                      메모 있음
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className={`whitespace-nowrap text-lg font-black tabular-nums sm:text-xl ${editAmount < 0 ? "text-rose-400" : "text-sky-500"}`}>
                  {formatSignedMoney(editAmount)}
                </div>
                <div className="mt-1 text-[10px] font-bold text-slate-300">현재 금액</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4">
            <Field label="날짜">
              <input
                type="date"
                value={editing.tx_date}
                onChange={(e) => onChange("tx_date", e.target.value)}
                className="h-11 w-full min-w-0 max-w-full appearance-none rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-700 outline-none focus:border-[#21bdb7] sm:h-12 sm:rounded-[18px] sm:text-sm"
              />
            </Field>

            <Field label="지출/수입">
              <div className="grid grid-cols-2 gap-2">
                {safeFlowOptions.map((flow) => (
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
                    onClick={() => onChange("user_type", user.key)}
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
                onChange={(e) => onChange("description", e.target.value)}
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              />
            </Field>

            <Field label="메모" className="sm:col-span-2">
              <input
                type="text"
                value={editing.memo}
                onChange={(e) => onChange("memo", e.target.value)}
                placeholder="참고용 메모"
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-bold"
              />
            </Field>

            <Field label="금액">
              <input
                type="text"
                value={formatNumberWithComma(editing.amount)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[,\s원₩]/g, "");
                  if (!/^\d*$/.test(raw)) return;
                  onChange("amount", raw);
                }}
                className="app-input h-12 w-full rounded-[18px] border-slate-200 bg-slate-50 font-black tabular-nums text-rose-400"
                placeholder="19000 / 350000"
              />
            </Field>

            <Field label="결제수단">
              <div className="relative">
                <select
                  value={editing.account_type}
                  onChange={(e) => onChange("account_type", e.target.value)}
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

                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">▼</div>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleteLoading || saveLoading}
            className="w-full rounded-[18px] bg-rose-50 px-5 py-3 text-sm font-black text-rose-500 transition hover:bg-rose-100 disabled:opacity-60 sm:w-auto"
          >
            {deleteLoading ? "삭제 중..." : "삭제"}
          </button>

          <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={saveLoading || deleteLoading}
              className="w-full rounded-[18px] bg-[#21bdb7] px-6 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(33,189,183,0.24)] transition hover:bg-[#18aaa4] disabled:opacity-60 sm:w-auto"
            >
              {saveLoading ? "저장 중..." : "저장"}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={deleteLoading || saveLoading}
              className="w-full rounded-[18px] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
