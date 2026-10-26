// Package server exposes the pipeline over HTTP.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/maks2134/agent-stage/api/internal/pipeline"
)

const (
	maxBodyBytes = 32 << 10
	runTimeout   = 60 * time.Second
)

// New returns the API handler. origins may contain "*" to allow any origin.
func New(runner pipeline.Runner, origins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /run", runHandler(runner))
	return withCORS(mux, origins)
}

func runHandler(runner pipeline.Runner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		var req pipeline.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), runTimeout)
		defer cancel()

		resp, err := runner.Run(ctx, req)
		switch {
		case errors.Is(err, pipeline.ErrEmptyMessage):
			writeError(w, http.StatusBadRequest, err.Error())
			return
		case err != nil:
			slog.Error("run failed", "err", err)
			writeError(w, http.StatusInternalServerError, "pipeline failed")
			return
		}
		slog.Info("run", "mode", resp.Mode, "fallback", resp.Fallback, "steps", len(resp.Steps))
		writeJSON(w, http.StatusOK, resp)
	}
}

func withCORS(next http.Handler, origins []string) http.Handler {
	anyOrigin := slices.Contains(origins, "*")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (anyOrigin || slices.Contains(origins, origin)) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
