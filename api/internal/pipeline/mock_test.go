package pipeline

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"testing"
)

func TestMockRun(t *testing.T) {
	tests := []struct {
		name        string
		req         Request
		wantLabel   string
		wantPrio    string
		wantFields  map[string]string
		wantActions []string
	}{
		{
			name:        "refund",
			req:         Request{From: "alex@startup.io", Subject: "Need a refund for order ORD-1042", Body: "Feature broken after last update, please refund."},
			wantLabel:   "billing",
			wantPrio:    "high",
			wantFields:  map[string]string{"order_id": "ORD-1042", "intent": "refund", "company": "startup"},
			wantActions: []string{"slack:#billing", "stripe:lookup_charge", "human_handoff"},
		},
		{
			name:        "sales lead",
			req:         Request{From: "priya.n@northwind.com", Subject: "Pricing for our team", Body: "We'd like a demo for 40 seats next week."},
			wantLabel:   "sales",
			wantPrio:    "normal",
			wantFields:  map[string]string{"intent": "sales_lead", "seats": "40", "company": "northwind"},
			wantActions: []string{"crm:create_deal", "slack:#sales"},
		},
		{
			name:        "bug report",
			req:         Request{From: "dev@gmail.com", Subject: "Export crashes", Body: "Since v2.3.1 export returns 500 every time."},
			wantLabel:   "bug",
			wantPrio:    "high",
			wantFields:  map[string]string{"intent": "bug_report", "error_code": "500", "version": "2.3.1"},
			wantActions: []string{"linear:create_issue", "slack:#eng-triage", "human_handoff"},
		},
		{
			name:        "general urgent",
			req:         Request{Subject: "Question", Body: "Can you call me asap?"},
			wantLabel:   "general",
			wantPrio:    "high",
			wantFields:  map[string]string{"intent": "general_question"},
			wantActions: []string{"helpdesk:queue_general", "human_handoff"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, err := Mock{}.Run(context.Background(), tt.req)
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			ids := make([]string, 0, len(resp.Steps))
			for _, s := range resp.Steps {
				ids = append(ids, s.ID)
				if s.Status != StatusDone || s.MS <= 0 {
					t.Errorf("step %s: status=%q ms=%d", s.ID, s.Status, s.MS)
				}
			}
			if want := []string{StepIngest, StepClassify, StepExtract, StepAct, StepDraft}; !slices.Equal(ids, want) {
				t.Fatalf("step order = %v, want %v", ids, want)
			}
			if got := resp.Steps[1]; got.Label != tt.wantLabel || got.Priority != tt.wantPrio {
				t.Errorf("classify = %s/%s, want %s/%s", got.Label, got.Priority, tt.wantLabel, tt.wantPrio)
			}
			if got := resp.Steps[2].Fields; !reflect.DeepEqual(got, tt.wantFields) {
				t.Errorf("fields = %v, want %v", got, tt.wantFields)
			}
			if got := resp.Steps[3].Actions; !slices.Equal(got, tt.wantActions) {
				t.Errorf("actions = %v, want %v", got, tt.wantActions)
			}
			if resp.Steps[4].Text == "" {
				t.Error("empty draft")
			}
		})
	}
}

func TestMockDeterministic(t *testing.T) {
	req := Request{From: "alex@startup.io", Subject: "refund ORD-1", Body: "please"}
	a, _ := Mock{}.Run(context.Background(), req)
	b, _ := Mock{}.Run(context.Background(), req)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("mock output is not deterministic")
	}
}

func TestMockEmpty(t *testing.T) {
	_, err := Mock{}.Run(context.Background(), Request{From: "a@b.c", Subject: "  "})
	if !errors.Is(err, ErrEmptyMessage) {
		t.Fatalf("err = %v, want ErrEmptyMessage", err)
	}
}

func TestGuessName(t *testing.T) {
	for in, want := range map[string]string{
		"alex@startup.io":     "Alex",
		"PRIYA.n@northwind":   "Priya",
		"support@acme.com":    "there",
		"":                    "there",
		"j_doe+tag@gmail.com": "J",
	} {
		if got := guessName(in); got != want {
			t.Errorf("guessName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseTriage(t *testing.T) {
	got, err := parseTriage("```json\n{\"label\":\"Sales\",\"priority\":\"urgent\",\"fields\":{\"seats\":\"12\"}}\n```")
	if err != nil {
		t.Fatal(err)
	}
	if got.Label != "sales" || got.Priority != "normal" || got.Fields["intent"] != "sales" || got.Fields["seats"] != "12" {
		t.Fatalf("unexpected triage: %+v", got)
	}
}

type failingRunner struct{}

func (failingRunner) Run(context.Context, Request) (Response, error) {
	return Response{}, errors.New("provider down")
}

func TestWithFallback(t *testing.T) {
	resp, err := WithFallback{Primary: failingRunner{}}.Run(context.Background(), Request{Subject: "refund please"})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Mode != ModeMock || resp.Fallback == "" || len(resp.Steps) != 5 {
		t.Fatalf("unexpected fallback response: %+v", resp)
	}
}
