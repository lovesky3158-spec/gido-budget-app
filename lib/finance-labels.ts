export const USER_ALIASES = {
  husband: "기린",
  wife: "짱구",
  shared: "공동",
} as const;

export function normalizeUserTag(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();

  if (!raw) return "";
  if (raw === "남편" || raw === "기린") return USER_ALIASES.husband;
  if (raw === "아내" || raw === "짱구") return USER_ALIASES.wife;
  if (raw === "공동") return USER_ALIASES.shared;

  return String(value ?? "").trim();
}

export function getUserDisplayName(value: string | null | undefined) {
  return normalizeUserTag(value) || "미지정";
}

export function normalizeAccountLabel(
  value: string | null | undefined,
  fileName?: string | null,
  preset?: string | null
) {
  const raw = String(value ?? "").trim();
  if (!raw && !fileName && !preset) return "";

  const lower = raw.toLowerCase();
  const file = String(fileName ?? "").trim().toLowerCase();
  const presetText = String(preset ?? "").trim().toLowerCase();
  const joined = `${lower} ${file} ${presetText}`;

  const detectCardKind = () => {
    if (joined.includes("체크") || joined.includes("check") || joined.includes("debit")) return "체크";
    if (joined.includes("신용") || joined.includes("credit") || joined.includes("일시불") || joined.includes("할부")) return "신용";
    if (joined.includes("법인") || joined.includes("corporate") || joined.includes("corp")) return "법인";
    return "";
  };

  const withKind = (base: string) => {
    const kind = detectCardKind();
    if (!kind) return base;
    if (base.includes("|")) return base;
    if (base === "현금" || base === "계좌" || base === "기타") return base;
    return `${base}|${kind}`;
  };

  // 이미 국민|신용처럼 저장된 값은 그대로 유지
  if (raw.includes("|")) {
    const [base, kind] = raw.split("|").map((v) => v.trim()).filter(Boolean);
    return kind ? `${base}|${kind}` : base || raw;
  }

  if (
    joined.includes("국민") ||
    joined.includes("kb") ||
    joined.includes("kbcard")
  ) {
    return withKind("국민");
  }

  if (joined.includes("신한") || joined.includes("shinhan")) {
    return withKind("신한");
  }

  if (
    joined.includes("농협") ||
    joined.includes("nh") ||
    joined.includes("nhcard") ||
    joined.includes("m390")
  ) {
    return withKind("농협");
  }

  if (joined.includes("우리")) return withKind("우리");
  if (joined.includes("현금") || joined.includes("cash")) return "현금";
  if (joined.includes("계좌")) return "계좌";

  if (raw.includes("카드")) return withKind(raw.replace(/카드/g, "").trim() || raw);

  return raw || "기타";
}
