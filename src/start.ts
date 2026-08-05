import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Server functions are same-origin RPC endpoints reached with the user's cookies
// attached, so a cross-site page can invoke them on a signed-in visitor's behalf.
// Today the only one is `fetchAuthUser`, a read-only GET whose response the
// attacker's page cannot read anyway (same-origin policy), so this is not closing
// a live hole — it is making the default safe, so the first server function that
// *does* mutate something is protected without anyone having to remember.
//
// Scoped to serverFn handlers deliberately: applying it to every request would
// also gate ordinary document navigations, and `/api/public/run-reminders` is
// called by pg_cron with no Origin, Referer, or Sec-Fetch-Site header at all —
// that endpoint authenticates with its own shared secret instead.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// No functionMiddleware: the auth session travels in a cookie that server
// functions read directly, so nothing needs to attach a bearer token per call.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
