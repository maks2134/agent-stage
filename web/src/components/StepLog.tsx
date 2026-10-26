"use client";

import { useEffect, useState } from "react";
import type { RunState } from "@/hooks/usePipelineRun";
import { STATIONS, type Step, type StepStatus } from "@/lib/types";

const statusStyle: Record<StepStatus, string> = {
  pending: "text-fog/50",
  running: "text-lime",
  done: "text-lime/80",
  error: "text-red-300",
};

const priorityStyle: Record<string, string> = {
  high: "border-red-400/50 text-red-200",
  normal: "border-lime/40 text-lime",
  low: "border-edge text-fog",
};

export function StepLog({ state }: { state: RunState }) {
  const draft = state.steps[STATIONS.length - 1]?.text;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-edge bg-panel/80 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-fog uppercase">Step log</h2>
        <ModeBadge state={state} />
      </div>

      <ol className="flex flex-col gap-2">
        {STATIONS.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-lg border px-3 py-2 transition-colors duration-300 ${
              state.statuses[i] === "running" ? "border-lime/40 bg-lime/[0.04]" : "border-edge/70"
            }`}
          >
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-fog/50">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-cream">{s.name}</span>
              <span className={`ml-auto ${statusStyle[state.statuses[i]]}`}>
                {state.statuses[i] === "running" ? "running…" : state.statuses[i]}
              </span>
              <span className="w-12 text-right text-fog/70">
                {state.steps[i] ? `${state.steps[i]!.ms}ms` : "—"}
              </span>
            </div>
            {state.steps[i] && <StepDetail step={state.steps[i]!} />}
          </li>
        ))}
      </ol>

      {state.error && <p className="text-sm text-red-300">{state.error}</p>}

      <div className="min-h-0 flex-1">
        {draft ? (
          <DraftCard key={draft} text={draft} />
        ) : (
          <p className="pt-1 text-sm text-fog/60">
            {state.phase === "idle" ? "Pick a preset or paste an email, then hit Run." : "Drafting reply…"}
          </p>
        )}
      </div>
    </section>
  );
}

function ModeBadge({ state }: { state: RunState }) {
  if (!state.meta) return null;
  const { mode, model, fallback } = state.meta;
  const label =
    mode === "llm" ? `LLM · ${model ?? "model"}` : mode === "local" ? "offline · browser mock" : fallback ? "mock · LLM fallback" : "mock";
  return (
    <span className="max-w-[60%] truncate rounded-full border border-edge px-2 py-0.5 font-mono text-[10px] text-fog" title={label}>
      {label}
    </span>
  );
}

function StepDetail({ step }: { step: Step }) {
  const chips: { text: string; cls?: string }[] = [];
  if (step.label) chips.push({ text: step.label, cls: "border-lime/40 text-lime" });
  if (step.priority) chips.push({ text: `${step.priority} priority`, cls: priorityStyle[step.priority] });
  if (step.id !== "ingest" && step.fields) {
    for (const [k, v] of Object.entries(step.fields)) chips.push({ text: `${k}: ${v}` });
  }
  for (const a of step.actions ?? []) chips.push({ text: a, cls: "border-lime/30 text-cream" });
  if (step.id === "ingest" && step.fields?.sender) chips.push({ text: `from ${step.fields.sender}` });
  if (chips.length === 0) return null;

  return (
    <div className="animate-fade-up mt-1.5 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.text} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${c.cls ?? "border-edge text-fog"}`}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

function DraftCard({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(id);
          return n;
        }
        return Math.min(text.length, n + 3);
      });
    }, 16);
    return () => clearInterval(id);
  }, [text]);

  const typing = shown < text.length;
  return (
    <div className="animate-fade-up flex h-full flex-col rounded-xl border border-lime/30 bg-ink/70 p-3 shadow-[0_0_32px_rgba(200,241,53,0.08)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] text-lime uppercase">Draft reply · needs review</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text)}
          className="font-mono text-[10px] text-fog transition-colors hover:text-cream"
        >
          copy
        </button>
      </div>
      <p className="min-h-0 flex-1 overflow-auto text-sm leading-relaxed whitespace-pre-wrap text-cream">
        {text.slice(0, shown)}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-lime" />}
      </p>
    </div>
  );
}
