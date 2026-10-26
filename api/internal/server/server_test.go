package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/maks2134/agent-stage/api/internal/pipeline"
)

func TestRun(t *testing.T) {
	h := New(pipeline.Mock{}, []string{"http://localhost:3000"})

	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{"ok", `{"from":"alex@startup.io","subject":"Need a refund for order ORD-1042","body":"please refund"}`, http.StatusOK},
		{"empty", `{"from":"alex@startup.io"}`, http.StatusBadRequest},
		{"bad json", `{`, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/run", strings.NewReader(tt.body))
			req.Header.Set("Origin", "http://localhost:3000")
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
				t.Errorf("CORS origin = %q", got)
			}
			if tt.wantStatus != http.StatusOK {
				return
			}
			var resp pipeline.Response
			if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
				t.Fatal(err)
			}
			if len(resp.Steps) != 5 || resp.Steps[1].Label != "billing" {
				t.Fatalf("unexpected response: %+v", resp)
			}
		})
	}
}

func TestCORSRejectsUnknownOrigin(t *testing.T) {
	h := New(pipeline.Mock{}, []string{"http://localhost:3000"})
	req := httptest.NewRequest(http.MethodOptions, "/run", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected CORS header %q", got)
	}
}

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	New(pipeline.Mock{}, nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Fatalf("healthz: %d %s", rec.Code, rec.Body)
	}
}
