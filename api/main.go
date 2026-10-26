// Agent Stage API: POST /run turns an inbound email into pipeline steps.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/maks2134/agent-stage/api/internal/pipeline"
	"github.com/maks2134/agent-stage/api/internal/server"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	runner, mode := newRunner()
	origins := splitCSV(env("ALLOWED_ORIGINS", "http://localhost:3000"))

	srv := &http.Server{
		Addr:              listenAddr(),
		Handler:           server.New(runner, origins),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      70 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("agent-stage api listening", "addr", srv.Addr, "mode", mode, "origins", origins)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown", "err", err)
	}
}

func newRunner() (pipeline.Runner, string) {
	key := env("OPENROUTER_API_KEY", os.Getenv("LLM_API_KEY"))
	if key == "" {
		return pipeline.Mock{}, pipeline.ModeMock
	}
	llm := pipeline.NewLLM(key, os.Getenv("LLM_BASE_URL"), os.Getenv("LLM_MODEL"))
	return pipeline.WithFallback{Primary: llm}, pipeline.ModeLLM + ":" + llm.Model
}

// listenAddr honours PORT (Render/Fly) before ADDR.
func listenAddr() string {
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return env("ADDR", ":8084")
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
