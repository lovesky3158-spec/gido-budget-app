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

const ACCOUNT_SEPARATOR = " · ";
const CARD_KIND_WORDS = ["신용", "체크", "법인"];

function normalizeAccountSeparator(value: string) {
  const raw = String(value ?? "").replace(/카드/g, "").trim();
  if (!raw) return "";

  const parts = raw
    .split(/[|·]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const issuer = parts[0];
    const kind = parts.find((part, index) => index > 0 && CARD_KIND_WORDS.includes(part));
    return kind ? `${issuer}${ACCOUNT_SEPARATOR}${kind}` : parts.join(ACCOUNT_SEPARATOR);
  }

  return raw;
}

function buildAccountLabel(issuer: string, kind: string) {
  const cleanIssuer = normalizeAccountSeparator(issuer);
  if (!cleanIssuer || cleanIssuer === "현금" || cleanIssuer === "계좌" || cleanIssuer === "기타") return cleanIssuer;
  return `${cleanIssuer}${ACCOUNT_SEPARATOR}${kind}`;
}

function joinAccountType(issuer: string, joined: string) {
  const normalizedIssuer = normalizeAccountSeparator(issuer);
  if (!normalizedIssuer) return "";
  if (normalizedIssuer === "현금" || normalizedIssuer === "계좌" || normalizedIssuer === "기타") return normalizedIssuer;
  if (normalizedIssuer.includes(ACCOUNT_SEPARATOR)) return normalizedIssuer;

  const compact = joined.replace(/\s/g, "").toLowerCase();

  if (compact.includes("체크") || compact.includes("check") || compact.includes("debit")) {
    return buildAccountLabel(normalizedIssuer, "체크");
  }

  if (compact.includes("법인") || compact.includes("business") || compact.includes("corp")) {
    return buildAccountLabel(normalizedIssuer, "법인");
  }

  if (compact.includes("신용") || compact.includes("credit")) {
    return buildAccountLabel(normalizedIssuer, "신용");
  }

  // 기존 개발용 DB처럼 account_type에 카드사만 저장된 데이터는 기본 신용으로 보정한다.
  if (["국민", "신한", "농협", "우리", "현대", "삼성", "카카오"].includes(normalizedIssuer)) {
    return buildAccountLabel(normalizedIssuer, "신용");
  }

  return normalizedIssuer;
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

  if (raw.includes("|") || raw.includes("·")) return normalizeAccountSeparator(raw);

  if (
    joined.includes("국민") ||
    joined.includes("kb") ||
    joined.includes("kbcard")
  ) {
    return joinAccountType("국민", joined);
  }

  if (joined.includes("신한") || joined.includes("shinhan")) {
    return joinAccountType("신한", joined);
  }

  if (
    joined.includes("농협") ||
    joined.includes("nh") ||
    joined.includes("nhcard") ||
    joined.includes("m390")
  ) {
    return joinAccountType("농협", joined);
  }

  if (joined.includes("우리")) return joinAccountType("우리", joined);
  if (joined.includes("현금") || joined.includes("cash")) return "현금";
  if (joined.includes("계좌")) return "계좌";

  if (raw.includes("카드")) {
    const cleaned = raw.replace(/카드/g, "").trim() || raw;
    return joinAccountType(cleaned, joined);
  }

  return raw || "기타";
}
