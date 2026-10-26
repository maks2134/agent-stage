export type StationId = "ingest" | "classify" | "extract" | "act" | "draft";

export type StepStatus = "pending" | "running" | "done" | "error";

export type Step = {
  id: StationId;
  status: StepStatus;
  ms: number;
  label?: string;
  priority?: string;
  fields?: Record<string, string>;
  actions?: string[];
  text?: string;
};

/** `local` = API unreachable, steps generated in the browser. */
export type RunMode = "mock" | "llm" | "local";

export type RunResponse = {
  steps: Step[];
  mode: RunMode;
  model?: string;
  fallback?: string;
};

export type InboundMessage = {
  from: string;
  subject: string;
  body: string;
};

export const STATIONS: { id: StationId; name: string; hint: string }[] = [
  { id: "ingest", name: "Ingest", hint: "Normalize the message" },
  { id: "classify", name: "Classify", hint: "Label + priority" },
  { id: "extract", name: "Extract", hint: "Structured fields" },
  { id: "act", name: "Act", hint: "Route to tools" },
  { id: "draft", name: "Draft", hint: "Reply for review" },
];
