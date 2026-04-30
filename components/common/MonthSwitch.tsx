"use client";

type Props = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function formatMonthLabel(value: string) {
  if (!value) return "월 선택";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}년 ${Number(month)}월`;
}

export default function MonthSwitch({ value, options, onChange }: Props) {
  const currentIndex = options.findIndex((item) => item === value);

  const canPrev = currentIndex >= 0 && currentIndex < options.length - 1;
  const canNext = currentIndex > 0;

  const handlePrev = () => {
    if (!canPrev) return;
    onChange(options[currentIndex + 1]);
  };

  const handleNext = () => {
    if (!canNext) return;
    onChange(options[currentIndex - 1]);
  };

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 shadow-sm">
      <button
        type="button"
        onClick={handlePrev}
        disabled={!canPrev}
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="이전 월"
      >
        ‹
      </button>

      <div className="min-w-[140px] px-3 text-center">
        <div className="text-[15px] font-extrabold tracking-tight text-slate-800">
          {formatMonthLabel(value)}
        </div>
      </div>

      <button
        type="button"
        onClick={handleNext}
        disabled={!canNext}
        className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="다음 월"
      >
        ›
      </button>
    </div>
  );
}