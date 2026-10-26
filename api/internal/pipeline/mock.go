package pipeline

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// Mock is a deterministic, keyless runner: same input → same steps.
type Mock struct{}

func (Mock) Run(_ context.Context, req Request) (Response, error) {
	req, err := Normalize(req)
	if err != nil {
		return Response{}, err
	}

	label, priority := classify(req)
	fields := extract(req, label)
	actions := planActions(label, priority, fields)
	draft := draftReply(req, label, fields)

	size := int64(len(req.Subject) + len(req.Body))
	return Response{
		Mode: ModeMock,
		Steps: []Step{
			{ID: StepIngest, Status: StatusDone, MS: 30 + size/40, Fields: ingestFields(req)},
			{ID: StepClassify, Status: StatusDone, MS: 160 + size/25, Label: label, Priority: priority},
			{ID: StepExtract, Status: StatusDone, MS: 110 + int64(len(fields))*12, Fields: fields},
			{ID: StepAct, Status: StatusDone, MS: 70 + int64(len(actions))*15, Actions: actions},
			{ID: StepDraft, Status: StatusDone, MS: 200 + int64(len(draft))/6, Text: draft},
		},
	}, nil
}

var (
	reOrderID = regexp.MustCompile(`(?i)\b(ORD-\d+)\b|\border\s*#?\s*(\d{3,})\b`)
	reInvoice = regexp.MustCompile(`(?i)\b(INV-\d+)\b`)
	reSeats   = regexp.MustCompile(`(?i)\b(\d{1,5})\s*(?:seats|users|people|agents)\b`)
	reVersion = regexp.MustCompile(`(?i)\bv?(\d+\.\d+(?:\.\d+)?)\b`)
	reErrCode = regexp.MustCompile(`\b([45]\d\d)\b`)
)

type rule struct {
	label    string
	priority string
	words    []string
}

// Order matters: the first rule with a hit wins.
var rules = []rule{
	{"billing", "high", []string{"refund", "chargeback", "charged twice", "double charge"}},
	{"bug", "high", []string{"bug", "broken", "crash", "error", "outage", "down", "not working", "doesn't work"}},
	{"sales", "normal", []string{"demo", "pricing", "quote", "seats", "enterprise", "trial", "plan"}},
	{"billing", "normal", []string{"invoice", "receipt", "billing", "payment"}},
}

func classify(req Request) (label, priority string) {
	text := strings.ToLower(req.Subject + " " + req.Body)
	for _, r := range rules {
		for _, w := range r.words {
			if strings.Contains(text, w) {
				return r.label, bumpPriority(r.priority, text)
			}
		}
	}
	return "general", bumpPriority("low", text)
}

func bumpPriority(p, text string) string {
	if p == "high" {
		return p
	}
	for _, w := range []string{"urgent", "asap", "immediately", "production"} {
		if strings.Contains(text, w) {
			return "high"
		}
	}
	return p
}

func ingestFields(req Request) map[string]string {
	return map[string]string{
		"channel": "email",
		"sender":  orDefault(req.From, "unknown"),
		"words":   fmt.Sprint(len(strings.Fields(req.Subject + " " + req.Body))),
	}
}

func extract(req Request, label string) map[string]string {
	text := req.Subject + "\n" + req.Body
	fields := map[string]string{}

	if m := reOrderID.FindStringSubmatch(text); m != nil {
		if m[1] != "" {
			fields["order_id"] = strings.ToUpper(m[1])
		} else {
			fields["order_id"] = "ORD-" + m[2]
		}
	}
	if m := reInvoice.FindStringSubmatch(text); m != nil {
		fields["invoice_id"] = strings.ToUpper(m[1])
	}
	if company := companyFromEmail(req.From); company != "" {
		fields["company"] = company
	}

	lower := strings.ToLower(text)
	switch label {
	case "billing":
		fields["intent"] = "billing_question"
		if strings.Contains(lower, "refund") || strings.Contains(lower, "chargeback") {
			fields["intent"] = "refund"
		}
	case "bug":
		fields["intent"] = "bug_report"
		if m := reErrCode.FindStringSubmatch(text); m != nil {
			fields["error_code"] = m[1]
		}
		if m := reVersion.FindStringSubmatch(text); m != nil {
			fields["version"] = m[1]
		}
	case "sales":
		fields["intent"] = "sales_lead"
		if m := reSeats.FindStringSubmatch(text); m != nil {
			fields["seats"] = m[1]
		}
	default:
		fields["intent"] = "general_question"
	}
	return fields
}

func planActions(label, priority string, fields map[string]string) []string {
	var actions []string
	switch label {
	case "billing":
		actions = append(actions, "slack:#billing")
		if fields["intent"] == "refund" {
			actions = append(actions, "stripe:lookup_charge")
		}
	case "bug":
		actions = append(actions, "linear:create_issue", "slack:#eng-triage")
	case "sales":
		actions = append(actions, "crm:create_deal", "slack:#sales")
	default:
		actions = append(actions, "helpdesk:queue_general")
	}
	if priority == "high" {
		actions = append(actions, "human_handoff")
	}
	return actions
}

func draftReply(req Request, label string, fields map[string]string) string {
	name := guessName(req.From)
	var body string
	switch label {
	case "billing":
		ref := ""
		if id := fields["order_id"]; id != "" {
			ref = " with " + id
		}
		if fields["intent"] == "refund" {
			body = "Sorry about the issue" + ref + ". I've flagged your refund request for our billing team — " +
				"you'll get a confirmation within 1 business day, and the refund lands on the original payment method."
		} else {
			body = "Thanks for reaching out about billing" + ref + ". I've routed this to our billing team; " +
				"they'll reply with the details within 1 business day."
		}
	case "bug":
		body = "Thanks for the report — sorry you hit this. I've opened a ticket with engineering and flagged it as high priority. " +
			"We'll follow up with a fix or workaround as soon as we have one."
		if v := fields["version"]; v != "" {
			body += " (Noted: version " + v + ".)"
		}
	case "sales":
		body = "Thanks for your interest!"
		if s := fields["seats"]; s != "" {
			body += " A " + s + "-seat rollout is a great fit."
		}
		body += " Someone from our team will reach out today with pricing and a couple of demo slots."
	default:
		body = "Thanks for your message. A teammate will review it and get back to you shortly."
	}
	return "Hi " + name + ",\n\n" + body + "\n\nBest,\nAcme Support"
}

func guessName(from string) string {
	local, _, _ := strings.Cut(from, "@")
	parts := strings.FieldsFunc(local, func(r rune) bool { return r == '.' || r == '_' || r == '-' || r == '+' })
	if len(parts) == 0 || parts[0] == "" {
		return "there"
	}
	first := parts[0]
	if isRoleAccount(first) {
		return "there"
	}
	return strings.ToUpper(first[:1]) + strings.ToLower(first[1:])
}

func isRoleAccount(s string) bool {
	switch strings.ToLower(s) {
	case "info", "support", "hello", "admin", "contact", "sales", "team", "noreply", "no":
		return true
	}
	return false
}

func companyFromEmail(from string) string {
	_, domain, ok := strings.Cut(from, "@")
	if !ok {
		return ""
	}
	name, _, _ := strings.Cut(strings.ToLower(domain), ".")
	switch name {
	case "", "gmail", "yahoo", "outlook", "hotmail", "icloud", "proton", "protonmail":
		return ""
	}
	return name
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
