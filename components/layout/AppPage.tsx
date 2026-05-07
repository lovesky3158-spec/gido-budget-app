import { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  right?: ReactNode;
  tone?: "teal" | "yellow" | "neutral";
};

const toneClass = {
  teal: "from-[#25c8c8] via-[#21c3b7] to-[#18b89c]",
  yellow: "from-[#ffe27a] via-[#ffd95c] to-[#ffc533]",
  neutral: "from-[#25c8c8] via-[#21c3b7] to-[#18b89c]",
};

export default function AppPage({ eyebrow, title, description, children, right, tone = "teal" }: Props) {
  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <section className={`relative hidden overflow-hidden bg-gradient-to-br ${toneClass[tone]} text-white sm:block`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_22%),radial-gradient(circle_at_top_right,rgba(255,223,107,0.18),transparent_24%)]" />
        <div className="app-shell relative px-4 py-3 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              {eyebrow ? (
                <div className="hidden rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold backdrop-blur-sm sm:inline-flex">
                  {eyebrow}
                </div>
              ) : null}
              <h1 className="mt-0 text-[25px] font-black tracking-[-0.045em] sm:mt-4 sm:text-4xl">{title}</h1>
              {description ? <p className="mt-1.5 hidden text-xs leading-relaxed text-white/85 sm:mt-2 sm:block sm:text-sm">{description}</p> : null}
            </div>
            {right ? <div className="w-full max-w-full lg:w-auto">{right}</div> : null}
          </div>
        </div>
      </section>
      <section className="app-shell px-4 pb-28 pt-3 sm:px-6 sm:py-8">{children}</section>
    </main>
  );
}
