"use client";

import { PRESETS } from "@/lib/presets";
import type { InboundMessage } from "@/lib/types";

type Props = {
  value: InboundMessage;
  onChange: (v: InboundMessage) => void;
  onRun: () => void;
  running: boolean;
};

const fieldClass =
  "w-full rounded-lg border border-edge bg-ink/70 px-3 py-2 text-sm text-cream placeholder:text-fog/50 outline-none transition-colors focus:border-lime/60";

export function InputPanel({ value, onChange, onRun, running }: Props) {
  const canRun = !running && (value.subject.trim() !== "" || value.body.trim() !== "");
  const set = (k: keyof InboundMessage) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <form
      className="flex h-full flex-col gap-3 rounded-2xl border border-edge bg-panel/80 p-4 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        if (canRun) onRun();
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] tracking-[0.18em] text-fog uppercase">Inbound message</h2>
        <span className="font-mono text-[10px] text-fog/60">email / ticket</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const selected = p.message.subject === value.subject && p.message.from === value.from;
          return (
            <button
              key={p.id}
              type="button"
              disabled={running}
              onClick={() => onChange(p.message)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                selected ? "border-lime/60 text-lime" : "border-edge text-fog hover:border-fog/60 hover:text-cream"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-fog">From</span>
        <input className={fieldClass} value={value.from} onChange={set("from")} placeholder="name@company.com" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-fog">Subject</span>
        <input className={fieldClass} value={value.subject} onChange={set("subject")} maxLength={300} />
      </label>
      <label className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="text-xs text-fog">Body</span>
        <textarea
          className={`${fieldClass} min-h-28 flex-1 resize-none leading-relaxed`}
          value={value.body}
          onChange={set("body")}
          maxLength={6000}
        />
      </label>

      <button
        type="submit"
        disabled={!canRun}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink shadow-[0_0_24px_rgba(200,241,53,0.25)] transition-[transform,opacity] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {running ? (
          <>
            <span className="size-2 animate-ping rounded-full bg-ink" /> Running pipeline…
          </>
        ) : (
          <>Run pipeline →</>
        )}
      </button>
    </form>
  );
}
