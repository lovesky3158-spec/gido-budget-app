export type TransactionLike = {
  tx_date?: string | null;
  type?: string | null;
  amount?: number | string | null;
};

export function parseDateMeta(value: string | null | undefined) {
  if (!value) return null;

  let m = String(value).match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m) {
    const year = 2000 + Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    return {
      year,
      month,
      day,
      ym,
      iso: `${ym}-${String(day).padStart(2, "0")}`,
      display: `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
    };
  }

  m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    return {
      year,
      month,
      day,
      ym,
      iso: `${ym}-${String(day).padStart(2, "0")}`,
      display: `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
    };
  }

  return null;
}

export const parseShortDate = parseDateMeta;

export function isoToShortDate(value: string) {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

export function splitType(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const [flow = "", category = ""] = raw.split("/");

  return {
    flow: flow.trim(),
    category: category.trim(),
    raw,
  };
}

export function getNormalizedAmount(row: TransactionLike) {
  const rawAmount = Number(row.amount ?? 0);
  const meta = splitType(row.type);

  if (meta.flow === "지출" && rawAmount > 0) return -rawAmount;
  if (meta.flow === "수입" && rawAmount < 0) return Math.abs(rawAmount);

  return rawAmount;
}

export function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatAbsMoney(value: number) {
  return `${Math.round(Math.abs(value)).toLocaleString("ko-KR")}원`;
}

export function formatSignedMoney(value: number) {
  if (value > 0) return `+${Math.round(value).toLocaleString("ko-KR")}원`;
  if (value < 0) return `-${Math.round(Math.abs(value)).toLocaleString("ko-KR")}원`;
  return "0원";
}

export function formatChartMoney(value: number) {
  const abs = Math.abs(value);

  if (abs >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;

  return value.toLocaleString("ko-KR");
}

export function getMonthLabel(month: string) {
  if (!month) return "월 선택";
  const [year, mm] = month.split("-");
  return `${year}년 ${Number(mm)}월`;
}

export function getMonthShort(month: string) {
  if (!month) return "-";
  const [, mm] = month.split("-");
  return `${Number(mm)}월`;
}

export function getCategoryEmoji(category: string) {
  const key = category.trim();

  if (key.includes("주거")) return "🏠";
  if (key.includes("교통")) return "🚌";
  if (key.includes("병원") || key.includes("의료")) return "🏥";
  if (key.includes("카페")) return "☕";
  if (key.includes("식") || key.includes("외식")) return "🍚";
  if (key.includes("쇼핑")) return "🛍️";
  if (key.includes("육아") || key.includes("아이")) return "🧸";
  if (key.includes("취미") || key.includes("여가")) return "🎮";
  if (key.includes("통신")) return "📱";
  if (key.includes("공과금")) return "💡";
  if (key.includes("여행")) return "✈️";

  return "✨";
}