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

  if (
    joined.includes("국민") ||
    joined.includes("kb") ||
    joined.includes("kbcard")
  ) {
    return "국민";
  }

  if (joined.includes("신한") || joined.includes("shinhan")) {
    return "신한";
  }

  if (
    joined.includes("농협") ||
    joined.includes("nh") ||
    joined.includes("nhcard") ||
    joined.includes("m390")
  ) {
    return "농협";
  }

  if (joined.includes("우리")) return "우리";
  if (joined.includes("현금") || joined.includes("cash")) return "현금";
  if (joined.includes("계좌")) return "계좌";

  if (raw.includes("카드")) return raw.replace(/카드/g, "").trim() || raw;

  return raw || "기타";
}