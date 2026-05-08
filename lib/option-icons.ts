export type OptionGroupKey = "users" | "accounts" | "categories";
export type OptionIconMap = Partial<Record<OptionGroupKey, Record<string, string>>>;

const LS_OPTION_ICONS = "asset_couple_option_icons";

export function loadOptionIcons(): OptionIconMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_OPTION_ICONS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOptionIcons(value: OptionIconMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_OPTION_ICONS, JSON.stringify(value));
}

export function isImageIcon(value: string) {
  return value.startsWith("/") || value.startsWith("data:image");
}

export function getDefaultOptionIcon(group: OptionGroupKey, value: string) {
  const key = String(value ?? "").trim();

  if (group === "users") {
    if (key === "기린") return "/icons/girin.png";
    if (key === "짱구" || key.toLowerCase() === "zzangu") return "/icons/zzangu.png";
    if (key === "공동") return "🤝";
  }

  if (group === "accounts") {
    const accountKey = key.split("|")[0].replace(/카드/g, "").trim();
    if (accountKey === "신한") return "/icons/sh.png";
    if (accountKey === "국민") return "/icons/kb.png";
    if (accountKey === "농협") return "/icons/nh.png";
    if (accountKey === "우리") return "/icons/woori.png";
    if (accountKey === "현금") return "💵";
    if (accountKey === "계좌") return "🏦";
    if (accountKey === "기타") return "💳";
  }

  if (group === "categories") {
    if (key.includes("식대") || key.includes("식비") || key.includes("외식")) return "🍚";
    if (key.includes("카페") || key.includes("커피")) return "☕";
    if (key.includes("장보기") || key.includes("마트")) return "🛒";
    if (key.includes("생활")) return "🧴";
    if (key.includes("교통")) return "🚕";
    if (key.includes("쇼핑")) return "🛍️";
    if (key.includes("여가") || key.includes("취미")) return "🎮";
    if (key.includes("병원") || key.includes("의료") || key.includes("약")) return "💊";
    if (key.includes("주거")) return "🏠";
    if (key.includes("통신")) return "📱";
    if (key.includes("공과금")) return "💡";
    if (key.includes("여행")) return "✈️";
    if (key.includes("기타")) return "✨";
  }

  return "";
}

export function resolveOptionIcon(
  group: OptionGroupKey,
  value: string | null | undefined,
  icons: OptionIconMap
) {
  const key = String(value ?? "").trim();
  if (!key) return "";

  const saved = icons[group]?.[key];
  if (saved) return saved;

  if (group === "accounts") {
    const withoutCard = key.replace(/카드/g, "").trim();
    const issuerOnly = withoutCard.split("|")[0].trim();
    const savedWithoutCard = icons.accounts?.[withoutCard];
    if (savedWithoutCard) return savedWithoutCard;

    const savedIssuerOnly = icons.accounts?.[issuerOnly];
    if (savedIssuerOnly) return savedIssuerOnly;

    return getDefaultOptionIcon(group, issuerOnly || withoutCard || key);
  }

  return getDefaultOptionIcon(group, key);
}