import { runLocalMock } from "./localMock";
import type { InboundMessage, RunResponse } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8084").replace(/\/$/, "");

export async function runPipeline(msg: InboundMessage, signal?: AbortSignal): Promise<RunResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    return runLocalMock(msg);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `API error ${res.status}`);
  }
  return (await res.json()) as RunResponse;
}
