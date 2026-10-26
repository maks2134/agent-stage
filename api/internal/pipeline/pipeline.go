// Package pipeline turns an inbound email/ticket into ordered pipeline steps:
// ingest → classify → extract → act → draft.
package pipeline

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

const (
	StepIngest   = "ingest"
	StepClassify = "classify"
	StepExtract  = "extract"
	StepAct      = "act"
	StepDraft    = "draft"

	StatusDone  = "done"
	StatusError = "error"

	ModeMock = "mock"
	ModeLLM  = "llm"

	maxSubjectRunes = 300
	maxBodyRunes    = 6000
)

var ErrEmptyMessage = errors.New("subject or body is required")

type Request struct {
	From    string `json:"from"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

type Step struct {
	ID       string            `json:"id"`
	Status   string            `json:"status"`
	MS       int64             `json:"ms"`
	Label    string            `json:"label,omitempty"`
	Priority string            `json:"priority,omitempty"`
	Fields   map[string]string `json:"fields,omitempty"`
	Actions  []string          `json:"actions,omitempty"`
	Text     string            `json:"text,omitempty"`
}

type Response struct {
	Steps    []Step `json:"steps"`
	Mode     string `json:"mode"`
	Model    string `json:"model,omitempty"`
	Fallback string `json:"fallback,omitempty"`
}

// Runner executes the full pipeline for one message.
type Runner interface {
	Run(ctx context.Context, req Request) (Response, error)
}

// Normalize trims and bounds the input; it returns ErrEmptyMessage when
// there is nothing to process.
func Normalize(req Request) (Request, error) {
	req.From = strings.TrimSpace(req.From)
	req.Subject = truncateRunes(strings.TrimSpace(req.Subject), maxSubjectRunes)
	req.Body = truncateRunes(strings.TrimSpace(req.Body), maxBodyRunes)
	if req.Subject == "" && req.Body == "" {
		return req, ErrEmptyMessage
	}
	return req, nil
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}
