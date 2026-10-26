package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"
)

const (
	DefaultLLMBaseURL = "https://openrouter.ai/api/v1"
	DefaultLLMModel   = "openai/gpt-4o-mini"
)

var (
	allowedLabels     = []string{"billing", "bug", "sales", "general"}
	allowedPriorities = []string{"low", "normal", "high"}
)

// LLM classifies/extracts and drafts with an OpenAI-compatible API
// (OpenRouter by default). Routing actions stay rule-based: they are policy,
// not something a model should invent.
type LLM struct {
	BaseURL string
	APIKey  string
	Model   string
	Client  *http.Client
}

func NewLLM(apiKey, baseURL, model string) *LLM {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = DefaultLLMBaseURL
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultLLMModel
	}
	return &LLM{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		Client:  &http.Client{Timeout: 30 * time.Second},
	}
}

type triage struct {
	Label    string            `json:"label"`
	Priority string            `json:"priority"`
	Fields   map[string]string `json:"fields"`
}

const triagePrompt = `You triage inbound customer emails for a SaaS company.
Return ONLY a JSON object:
{"label": "billing|bug|sales|general", "priority": "low|normal|high", "fields": {"intent": "...", ...}}
fields: snake_case keys, short string values. Always include "intent".
Include when present: order_id, invoice_id, company, seats, error_code, version, deadline.
Never invent values that are not in the email.`

const draftPrompt = `You write short, warm, specific customer support replies (60-110 words).
Greet the sender by first name if known, otherwise "Hi there".
Reference concrete details (order id, version, seats). Do not promise refunds or dates beyond
"within 1 business day". Sign off as "Best,\nAcme Support". Plain text only.`

func (l *LLM) Run(ctx context.Context, req Request) (Response, error) {
	req, err := Normalize(req)
	if err != nil {
		return Response{}, err
	}
	steps := make([]Step, 0, 5)

	start := time.Now()
	steps = append(steps, Step{ID: StepIngest, Status: StatusDone, MS: since(start), Fields: ingestFields(req)})

	start = time.Now()
	raw, err := l.chat(ctx, triagePrompt, formatEmail(req), true)
	if err != nil {
		return Response{}, fmt.Errorf("triage: %w", err)
	}
	classifyMS := since(start)

	start = time.Now()
	t, err := parseTriage(raw)
	if err != nil {
		return Response{}, fmt.Errorf("triage: %w", err)
	}
	steps = append(steps,
		Step{ID: StepClassify, Status: StatusDone, MS: classifyMS, Label: t.Label, Priority: t.Priority},
		Step{ID: StepExtract, Status: StatusDone, MS: since(start), Fields: t.Fields},
	)

	start = time.Now()
	actions := planActions(t.Label, t.Priority, t.Fields)
	steps = append(steps, Step{ID: StepAct, Status: StatusDone, MS: since(start), Actions: actions})

	start = time.Now()
	prompt := fmt.Sprintf("Triage: label=%s priority=%s fields=%v\nPlanned actions: %s\n\n%s",
		t.Label, t.Priority, t.Fields, strings.Join(actions, ", "), formatEmail(req))
	draft, err := l.chat(ctx, draftPrompt, prompt, false)
	if err != nil {
		return Response{}, fmt.Errorf("draft: %w", err)
	}
	steps = append(steps, Step{ID: StepDraft, Status: StatusDone, MS: since(start), Text: strings.TrimSpace(draft)})

	return Response{Steps: steps, Mode: ModeLLM, Model: l.Model}, nil
}

func formatEmail(req Request) string {
	return fmt.Sprintf("From: %s\nSubject: %s\n\n%s", req.From, req.Subject, req.Body)
}

func parseTriage(raw string) (triage, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")

	var t triage
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &t); err != nil {
		return t, fmt.Errorf("parse json: %w", err)
	}
	t.Label = strings.ToLower(strings.TrimSpace(t.Label))
	t.Priority = strings.ToLower(strings.TrimSpace(t.Priority))
	if !slices.Contains(allowedLabels, t.Label) {
		t.Label = "general"
	}
	if !slices.Contains(allowedPriorities, t.Priority) {
		t.Priority = "normal"
	}
	if t.Fields == nil {
		t.Fields = map[string]string{}
	}
	if t.Fields["intent"] == "" {
		t.Fields["intent"] = t.Label
	}
	return t, nil
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	MaxTokens      int           `json:"max_tokens"`
	ResponseFormat *struct {
		Type string `json:"type"`
	} `json:"response_format,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (l *LLM) chat(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	payload := chatRequest{
		Model:       l.Model,
		Messages:    []chatMessage{{Role: "system", Content: system}, {Role: "user", Content: user}},
		Temperature: 0.2,
		MaxTokens:   400,
	}
	if jsonMode {
		payload.ResponseFormat = &struct {
			Type string `json:"type"`
		}{Type: "json_object"}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, l.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+l.APIKey)
	httpReq.Header.Set("HTTP-Referer", "https://github.com/maks2134/agent-stage")
	httpReq.Header.Set("X-Title", "Agent Stage")

	resp, err := l.Client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("http %d: %.300s", resp.StatusCode, raw)
	}

	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if out.Error != nil {
		return "", fmt.Errorf("provider: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("empty completion")
	}
	return out.Choices[0].Message.Content, nil
}

// WithFallback runs primary and falls back to Mock on any non-input error,
// so the demo never shows a dead stage because a provider hiccupped.
type WithFallback struct {
	Primary Runner
}

func (f WithFallback) Run(ctx context.Context, req Request) (Response, error) {
	resp, err := f.Primary.Run(ctx, req)
	if err == nil {
		return resp, nil
	}
	if errors.Is(err, ErrEmptyMessage) || ctx.Err() != nil {
		return Response{}, err
	}
	slog.Warn("primary runner failed, using mock", "err", err)
	resp, mockErr := Mock{}.Run(ctx, req)
	if mockErr != nil {
		return Response{}, mockErr
	}
	resp.Fallback = "llm_unavailable"
	return resp, nil
}

func since(t time.Time) int64 {
	return time.Since(t).Milliseconds()
}
