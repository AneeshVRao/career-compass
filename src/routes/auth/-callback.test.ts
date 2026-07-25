// Named with the "-" prefix so the TanStack router plugin's routeFileIgnorePrefix
// excludes it from route generation while it stays next to the route it covers.
import { describe, expect, it } from "vitest";
import { Route, safeNext } from "./callback";

// Values an attacker could put in ?next=. Every one of these must be refused, or
// the OAuth callback becomes an open redirect off the back of a real session.
const MALICIOUS = [
  "https://evil.com",
  "http://evil.com/path",
  "//evil.com",
  "///evil.com",
  "\\\\evil.com",
  "/\\evil.com",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "mailto:someone@evil.com",
  "evil.com",
  "board",
];

const LEGITIMATE = ["/", "/board", "/settings", "/list?sort=company", "/board#card-1"];

describe("safeNext", () => {
  it.each(MALICIOUS)("refuses %j and falls back to the app root", (raw) => {
    expect(safeNext(raw)).toBe("/");
  });

  it.each(LEGITIMATE)("passes the same-origin relative path %j through", (raw) => {
    expect(safeNext(raw)).toBe(raw);
  });

  it("falls back to the app root when next is absent", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});

// Exercises the actual wired GET handler rather than just the helper. No `code`
// param is supplied, so the handler short-circuits past the Supabase exchange and
// the redirect target is the only thing under test.
function callHandler(url: string): Promise<Response> {
  const handler = Route.options.server!.handlers as {
    GET: (ctx: { request: Request }) => Promise<Response>;
  };
  return handler.GET({ request: new Request(url) });
}

describe("GET /auth/callback", () => {
  it("ignores an off-origin next and redirects to the app root", async () => {
    const res = await callHandler("http://localhost:8080/auth/callback?next=https://evil.com");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("ignores a protocol-relative next and redirects to the app root", async () => {
    const res = await callHandler("http://localhost:8080/auth/callback?next=//evil.com");
    expect(res.headers.get("Location")).toBe("/");
  });

  it("honours a same-origin relative next", async () => {
    const res = await callHandler("http://localhost:8080/auth/callback?next=/board");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/board");
  });

  it("defaults to the app root when no next is given", async () => {
    const res = await callHandler("http://localhost:8080/auth/callback");
    expect(res.headers.get("Location")).toBe("/");
  });
});
