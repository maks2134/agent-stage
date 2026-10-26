"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runPipeline } from "@/lib/api";
import { STATIONS, type InboundMessage, type RunResponse, type Step, type StepStatus } from "@/lib/types";

export type RunPhase = "idle" | "running" | "done" | "error";

export type RunState = {
  phase: RunPhase;
  statuses: StepStatus[];
  /** Steps revealed so far, indexed like STATIONS. */
  steps: (Step | undefined)[];
  /** Index of the station the token is heading to; STATIONS.length once finished. */
  active: number;
  meta?: Pick<RunResponse, "mode" | "model" | "fallback">;
  error?: string;
};

const initialState: RunState = {
  phase: "idle",
  statuses: STATIONS.map(() => "pending"),
  steps: [],
  active: -1,
};

const MIN_STEP_MS = 750;
const MAX_STEP_MS = 1700;

/** Stretch backend latency into a watchable beat while keeping relative pacing. */
function displayDuration(ms: number) {
  return Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, 450 + ms * 2.5));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePipelineRun() {
  const [state, setState] = useState<RunState>(initialState);
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (msg: InboundMessage) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    const stale = () => runId !== runIdRef.current;

    setState({
      phase: "running",
      statuses: STATIONS.map((_, i) => (i === 0 ? "running" : "pending")),
      steps: [],
      active: 0,
    });

    const startedAt = performance.now();
    let resp: RunResponse;
    try {
      resp = await runPipeline(msg, controller.signal);
    } catch (err) {
      if (stale()) return;
      setState((s) => ({
        ...s,
        phase: "error",
        statuses: s.statuses.map((st, i) => (i === 0 ? "error" : st)),
        error: err instanceof Error ? err.message : "Pipeline failed",
      }));
      return;
    }
    if (stale()) return;

    const byId = new Map(resp.steps.map((s) => [s.id, s]));
    const meta = { mode: resp.mode, model: resp.model, fallback: resp.fallback };
    setState((s) => ({ ...s, meta }));

    for (let i = 0; i < STATIONS.length; i++) {
      const step = byId.get(STATIONS[i].id);
      if (i > 0) {
        setState((s) => ({
          ...s,
          active: i,
          statuses: s.statuses.map((st, j) => (j === i ? "running" : st)),
        }));
      }

      const wait = displayDuration(step?.ms ?? 0) - (i === 0 ? performance.now() - startedAt : 0);
      if (wait > 0) await sleep(wait);
      if (stale()) return;

      const status: StepStatus = step ? step.status : "error";
      setState((s) => {
        const steps = [...s.steps];
        steps[i] = step;
        return { ...s, steps, statuses: s.statuses.map((st, j) => (j === i ? status : st)) };
      });
      if (status === "error") {
        setState((s) => ({ ...s, phase: "error", error: `${STATIONS[i].name} step failed` }));
        return;
      }
    }

    setState((s) => ({ ...s, phase: "done", active: STATIONS.length }));
  }, []);

  return { state, run };
}
