import type { InboundMessage, RunResponse } from "./types";

/**
 * Browser-side copy of the API's rule-based pipeline, used only when the API
 * is unreachable so the stage stays playable. The Go mock is the source of truth.
 */
export function runLocalMock(msg: InboundMessage): RunResponse {
  const text = `${msg.subject}\n${msg.body}`;
  const lower = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => lower.includes(w));

  let label = "general";
  let priority = "low";
  if (has(["refund", "chargeback", "charged twice"])) [label, priority] = ["billing", "high"];
  else if (has(["bug", "broken", "crash", "error", "outage", "down", "not working"])) [label, priority] = ["bug", "high"];
  else if (has(["demo", "pricing", "quote", "seats", "enterprise", "trial"])) [label, priority] = ["sales", "normal"];
  else if (has(["invoice", "receipt", "billing", "payment"])) [label, priority] = ["billing", "normal"];
  if (priority !== "high" && has(["urgent", "asap", "immediately", "production"])) priority = "high";

  const fields: Record<string, string> = {};
  const order = text.match(/\b(ORD-\d+)\b/i);
  if (order) fields.order_id = order[1].toUpperCase();
  const domain = msg.from.split("@")[1]?.split(".")[0]?.toLowerCase();
  if (domain && !["gmail", "yahoo", "outlook", "hotmail", "icloud"].includes(domain)) fields.company = domain;
  if (label === "billing") fields.intent = has(["refund", "chargeback"]) ? "refund" : "billing_question";
  if (label === "bug") {
    fields.intent = "bug_report";
    const code = text.match(/\b([45]\d\d)\b/);
    if (code) fields.error_code = code[1];
    const version = text.match(/\bv?(\d+\.\d+(?:\.\d+)?)\b/i);
    if (version) fields.version = version[1];
  }
  if (label === "sales") {
    fields.intent = "sales_lead";
    const seats = text.match(/\b(\d{1,5})\s*(?:seats|users|people|agents)\b/i);
    if (seats) fields.seats = seats[1];
  }
  if (label === "general") fields.intent = "general_question";

  const actions = {
    billing: fields.intent === "refund" ? ["slack:#billing", "stripe:lookup_charge"] : ["slack:#billing"],
    bug: ["linear:create_issue", "slack:#eng-triage"],
    sales: ["crm:create_deal", "slack:#sales"],
    general: ["helpdesk:queue_general"],
  }[label]!;
  if (priority === "high") actions.push("human_handoff");

  const local = msg.from.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  const name = local ? local[0].toUpperCase() + local.slice(1).toLowerCase() : "there";
  const body = {
    billing: `Sorry about the issue${fields.order_id ? ` with ${fields.order_id}` : ""}. I've flagged your request for our billing team — you'll hear back within 1 business day.`,
    bug: "Thanks for the report — sorry you hit this. I've opened a high-priority ticket with engineering and we'll follow up with a fix or workaround.",
    sales: `Thanks for your interest!${fields.seats ? ` A ${fields.seats}-seat rollout is a great fit.` : ""} Someone from our team will reach out today with pricing and demo slots.`,
    general: "Thanks for your message. A teammate will review it and get back to you shortly.",
  }[label];
  const draft = `Hi ${name},\n\n${body}\n\nBest,\nAcme Support`;

  return {
    mode: "local",
    steps: [
      { id: "ingest", status: "done", ms: 30, fields: { channel: "email", sender: msg.from || "unknown" } },
      { id: "classify", status: "done", ms: 180, label, priority },
      { id: "extract", status: "done", ms: 120, fields },
      { id: "act", status: "done", ms: 90, actions },
      { id: "draft", status: "done", ms: 220, text: draft },
    ],
  };
}
