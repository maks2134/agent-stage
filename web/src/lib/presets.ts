import type { InboundMessage } from "./types";

export const PRESETS: { id: string; name: string; message: InboundMessage }[] = [
  {
    id: "refund",
    name: "Refund",
    message: {
      from: "alex@startup.io",
      subject: "Need a refund for order ORD-1042",
      body: "Hi team, the export feature has been broken since the last update and my team can't use it. Please refund order ORD-1042.",
    },
  },
  {
    id: "lead",
    name: "Sales lead",
    message: {
      from: "priya.n@northwind.com",
      subject: "Pricing for our support team",
      body: "Hello! We're evaluating tools for our support org. Could we get a demo and pricing for 40 seats? We'd like to start in November.",
    },
  },
  {
    id: "bug",
    name: "Bug report",
    message: {
      from: "dmitri@pixelforge.dev",
      subject: "CSV export crashes",
      body: "Since v2.3.1 the CSV export returns a 500 error every time on larger workspaces. This is blocking our production reporting — urgent.",
    },
  },
];
