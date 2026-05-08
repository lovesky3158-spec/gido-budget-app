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

function joinAccountType(issuer: string, joined: string) {
  if (issuer === "현금" || issuer === "계좌" || issuer === "기타") return issuer;
  if (issuer.includes("|")) return issuer;

  const compact = joined.replace(/\s/g, "").toLowerCase();

  if (compact.includes("체크") || compact.includes("check") || compact.includes("debit")) {
    return `${issuer}|체크`;
  }

  if (compact.includes("신용") || compact.includes("credit")) {
    return `${issuer}|신용`;
  }

  // 기존 개발용 DB처럼 account_type에 카드사만 저장된 데이터도
  // 화면에서는 카드사|구분 형태로 보이도록 기본값을 보정한다.
  if (issuer === "국민") return "국민|신용";
  if (issuer === "신한") return "신한|체크";
  if (issuer === "농협") return "농협|체크";
  if (issuer === "우리") return "우리|체크";

  return issuer;
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

  if (raw.includes("|")) return raw.replace(/카드/g, "").trim();

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
