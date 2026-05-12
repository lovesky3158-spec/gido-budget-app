import Image from "next/image";

type PersonType = "기린" | "짱구" | "공동" | string | null | undefined;

type Props = {
  user: PersonType;
  compact?: boolean;
};

export default function PersonBadge({ user, compact = false }: Props) {
  const value = String(user ?? "").trim();
  const map = {
    기린: { label: "기린", className: "bg-teal-100 text-teal-700", icon: "/icons/girin.png", emoji: "🦒" },
    짱구: { label: "짱구", className: "bg-yellow-100 text-amber-700", icon: "/icons/zzangu.png", emoji: "🧒" },
    공동: { label: "공동", className: "bg-emerald-100 text-emerald-700", icon: "", emoji: "👫" },
  } as const;
  const item = map[value as keyof typeof map] ?? { label: value || "미지정", className: "bg-slate-100 text-slate-600", icon: "", emoji: "•" };

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${compact ? "text-[11px]" : "text-xs"} ${item.className}`}>
      {item.icon ? (
        <Image src={item.icon} alt={item.label} width={compact ? 14 : 16} height={compact ? 14 : 16} className="rounded-full object-cover" unoptimized />
      ) : (
        <span>{item.emoji}</span>
      )}
      {item.label}
    </span>
  );
}
