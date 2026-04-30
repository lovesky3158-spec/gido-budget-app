"use client";

type Tab = { key: string; label: string };

type Props = {
  value: string;
  onChange: (key: string) => void;
  tabs: Tab[];
};

export default function SubTabs({ value, onChange, tabs }: Props) {
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-[18px] px-4 py-2 text-sm font-bold transition ${
              active ? "bg-[#11b5b0] text-white shadow-sm" : "bg-transparent text-slate-500 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
