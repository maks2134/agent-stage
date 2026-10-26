import { AgentStage } from "@/components/AgentStage";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:h-dvh lg:min-h-[720px] lg:py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_0%,rgba(200,241,53,0.07),transparent_50%)]"
      />

      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-lime uppercase">Inbound AI workflow · demo</p>
          <h1 className="font-display text-[clamp(2.6rem,7vw,5.25rem)] leading-[0.9] font-extrabold tracking-tight">
            Agent Stage
          </h1>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-fog sm:text-base lg:pb-1 lg:text-right">
          Paste an email or ticket. Watch it get <span className="text-cream">classified, parsed, routed</span> and
          answered — every step timed and inspectable.
        </p>
      </header>

      <AgentStage />

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-fog/70">
        <span>Go API · Next.js · React Three Fiber</span>
        <span>
          Built by{" "}
          <a className="text-cream underline-offset-4 hover:text-lime hover:underline" href="https://personal-landing-sigma.vercel.app">
            Max Kozlov
          </a>{" "}
          ·{" "}
          <a className="text-cream underline-offset-4 hover:text-lime hover:underline" href="https://github.com/maks2134">
            GitHub
          </a>
        </span>
      </footer>
    </main>
  );
}
