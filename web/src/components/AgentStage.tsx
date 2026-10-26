"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { InputPanel } from "@/components/InputPanel";
import { StepLog } from "@/components/StepLog";
import { usePipelineRun } from "@/hooks/usePipelineRun";
import { PRESETS } from "@/lib/presets";
import type { InboundMessage } from "@/lib/types";

const Stage = dynamic(() => import("@/components/Stage"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-panel/40" />,
});

export function AgentStage() {
  const [message, setMessage] = useState<InboundMessage>(PRESETS[0].message);
  const { state, run } = usePipelineRun();
  const running = state.phase === "running";

  return (
    <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,360px)]">
      <div className="order-1 lg:min-h-0">
        <InputPanel value={message} onChange={setMessage} onRun={() => run(message)} running={running} />
      </div>

      <div className="relative order-2 h-[300px] overflow-hidden rounded-2xl border border-edge sm:h-[380px] lg:h-auto lg:min-h-[420px]">
        <Stage statuses={state.statuses} active={state.active} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 font-mono text-[10px] tracking-[0.18em] text-fog/70 uppercase">
          <span>pipeline · live</span>
          <span>{stageCaption(state.phase, state.active)}</span>
        </div>
      </div>

      <div className="order-3 lg:min-h-0">
        <StepLog state={state} />
      </div>
    </div>
  );
}

function stageCaption(phase: string, active: number) {
  if (phase === "idle") return "waiting for input";
  if (phase === "error") return "halted";
  if (phase === "done") return "reply ready";
  return `station ${Math.min(active + 1, 5)} / 5`;
}
