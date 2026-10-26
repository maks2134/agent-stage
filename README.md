# Agent Stage

**Paste an inbound email or ticket → watch it get classified, parsed, routed and answered.**

Agent Stage is a visual demo of an inbound AI workflow. One page, one button: a message travels through five
stations in a 3D scene — **Ingest → Classify → Extract → Act → Draft** — while a step log shows what each
station decided and how long it took. The result is a reply draft (for human review) plus the actions a real
system would fire: Slack alerts, CRM deals, Linear issues, Stripe lookups, human handoff.

## Business outcome

Support and sales inboxes get the same few kinds of messages over and over. This pipeline:

- **Triages instantly** — label (billing / bug / sales / general) and priority on arrival.
- **Pulls the structured data out** — order IDs, seat counts, error codes, versions, company.
- **Routes to the right tool** — the right Slack channel, a CRM deal, an issue tracker, or a human.
- **Drafts the reply** — specific to the message, ready for a human to approve.

Routing is rule-based on purpose: the model reads and writes text; what gets triggered stays predictable policy.

## Stack

| Layer | Tech |
|-------|------|
| API | Go 1.25, `net/http`, no framework |
| LLM (optional) | Any OpenAI-compatible API, OpenRouter by default (`gpt-4o-mini`) |
| UI | Next.js 16 (App Router) + TypeScript + Tailwind v4 |
| 3D | React Three Fiber + drei |

## Run locally

```bash
# API — deterministic mock, no keys needed
cd api
go run .                      # http://localhost:8084

# UI
cd web
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8084
npm install
npm run dev                   # http://localhost:3000
```

Pick a preset (Refund / Sales lead / Bug report) or paste your own email, hit **Run pipeline**.

If the API isn't running, the UI falls back to an in-browser copy of the mock pipeline (badge: `offline · browser mock`),
so the frontend alone is always playable.

### Real LLM mode

```bash
cd api
export OPENROUTER_API_KEY=sk-or-...    # see api/.env.example for all options
go run .
```

With a key, Classify + Extract come from one JSON-mode call and Draft from a second call; Act stays rule-based.
Any provider error falls back to the mock, and the UI shows `mock · LLM fallback` — the stage never dies mid-demo.

### Tests

```bash
cd api && go test ./...
cd web && npm run lint && npm run build
```

## API

`GET /healthz` → `{"status":"ok"}`

`POST /run`

```json
{
  "from": "alex@startup.io",
  "subject": "Need a refund for order ORD-1042",
  "body": "Feature broken after last update, please refund."
}
```

```json
{
  "mode": "mock",
  "steps": [
    { "id": "ingest", "status": "done", "ms": 32, "fields": { "channel": "email", "sender": "alex@startup.io", "words": "13" } },
    { "id": "classify", "status": "done", "ms": 163, "label": "billing", "priority": "high" },
    { "id": "extract", "status": "done", "ms": 146, "fields": { "company": "startup", "intent": "refund", "order_id": "ORD-1042" } },
    { "id": "act", "status": "done", "ms": 115, "actions": ["slack:#billing", "stripe:lookup_charge", "human_handoff"] },
    { "id": "draft", "status": "done", "ms": 237, "text": "Hi Alex,\n\nSorry about the issue with ORD-1042. ..." }
  ]
}
```

`mode` is `mock` or `llm`; `model` is set in LLM mode; `fallback` is set when the LLM failed and the mock answered.
Errors: `400 {"error": "..."}` for invalid JSON or an empty message.

| Env (API) | Default | |
|-----------|---------|-|
| `OPENROUTER_API_KEY` / `LLM_API_KEY` | — | Enables LLM mode |
| `LLM_MODEL` | `openai/gpt-4o-mini` | |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible endpoint |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated, `*` for any |
| `PORT` / `ADDR` | `:8084` | `PORT` wins (Render/Fly) |

## Layout

```
api/
  main.go                     config, graceful shutdown
  internal/pipeline/          Mock (rules), LLM (OpenRouter), WithFallback
  internal/server/            routes, CORS, validation
web/
  src/components/Stage.tsx    R3F scene: stations, track, token, projected labels
  src/hooks/usePipelineRun.ts playback: paces backend steps into a watchable sequence
  src/lib/localMock.ts        offline fallback
```

## Loom script (60–90 s)

1. **0–10 s — outcome first.** "Every support inbox gets the same refund, bug and sales emails. This pipeline triages
   them, pulls out the data, routes them, and drafts the reply — in about a second."
2. **10–30 s — Refund preset → Run.** Follow the token: "Ingest… Classify says billing, high priority… Extract pulls
   order ORD-1042… Act pings #billing, looks up the Stripe charge, and flags a human because it's a refund."
3. **30–45 s — the draft.** "Here's the reply, referencing the order — a person approves it, nothing auto-sends."
4. **45–60 s — Bug report preset.** "Different email, different route: Linear issue, #eng-triage, version and error
   code extracted."
5. **60–80 s — under the hood.** Show the step log timings and the `curl` response: "Go API, one JSON contract.
   Mock mode for demos, OpenRouter for real models, automatic fallback."
6. **80–90 s — CTA.** "I build this for your inbox — your categories, your tools, your tone. Link below."

## Contra

- **Title:** `Agent Stage — inbound email/ticket → classify, act, draft`
- **Blurb:**

```
Visual inbound AI pipeline: paste an email, watch stations fire (ingest → classify → extract → act → draft), get a reply draft + suggested Slack/CRM actions.

Stack: Go API + Next.js + React Three Fiber. Built to demo inbound automation packages — not a notebook.
```

---

Built by [Max Kozlov](https://personal-landing-sigma.vercel.app) · [GitHub](https://github.com/maks2134)
