import { defineHandler, HTTPResponse } from "nitro";
import { readBody } from "nitro/h3";

/**
 * One-click unsubscribe, linked from the footer of every lifecycle email.
 *
 * Until this existed, `unsubscribeUrl()` in
 * supabase/functions/_shared/email/send.ts pointed every footer link and every
 * `List-Unsubscribe` header at a 404. That is worse than having no link: since
 * February 2024 Gmail and Yahoo require bulk senders to offer working one-click
 * unsubscribe, and a dead one is what gets a sending domain's reputation
 * destroyed rather than merely annoying the recipient.
 *
 * -- Why GET and POST do different things ------------------------------------
 * POST unsubscribes immediately. That is RFC 8058: the mail client posts
 * `List-Unsubscribe=One-Click` on the user's behalf, without a human ever
 * seeing this page, and expects a 2xx.
 *
 * GET only *offers* to unsubscribe, behind a form that posts back. A GET must
 * never change state here, because plenty of things fetch a URL that no human
 * clicked - link scanners in corporate mail gateways, spam filters, and clients
 * that prefetch. Unsubscribing on GET would silently opt people out of mail
 * they still wanted, and they would have no idea why it stopped arriving.
 *
 * -- Auth --------------------------------------------------------------------
 * The token is the credential: an unguessable per-user uuid, and
 * `unsubscribe_by_token` is granted to `anon` precisely so a recipient can act
 * without logging in. Requiring a login to leave a mailing list is both hostile
 * and non-compliant - the person may no longer have an account at all.
 */

const APP_NAME = "Eclipta";

/** Categories the token may be scoped to. Anything else unsubscribes from all. */
const KNOWN_CATEGORIES = new Set([
  "daily_digest",
  "weekly_report",
  "streak_saver",
  "re_engagement",
  "battle",
  "forum",
  "group",
  "ai_followup",
  "guardian_report",
]);

const CATEGORY_LABEL: Record<string, string> = {
  daily_digest: "daily digest",
  weekly_report: "weekly report",
  streak_saver: "streak reminder",
  re_engagement: "check-in",
  battle: "battle notification",
  forum: "forum notification",
  group: "study group notification",
  ai_followup: "Luna follow-up",
  guardian_report: "guardian report",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A self-contained page. No external stylesheet, font or script: the site's CSP
 * allows `style-src 'self' 'unsafe-inline'` but the recipient may not be logged
 * in, may be on a slow connection, and does not need the app shell to read one
 * sentence.
 */
function page(title: string, body: string, status = 200): HTTPResponse {
  return new HTTPResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} - ${APP_NAME}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 24px; box-sizing: border-box;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0b1020; color: #e8eaf2;
  }
  main { max-width: 34rem; width: 100%; }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 .75rem; }
  p { margin: 0 0 1rem; color: #9aa1b5; }
  strong { color: #e8eaf2; }
  .actions { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1.5rem; }
  button, .link {
    font: inherit; font-weight: 700; cursor: pointer;
    padding: .7rem 1.15rem; border-radius: .5rem; border: 1px solid #2a3350;
    background: #151c33; color: #e8eaf2; text-decoration: none;
  }
  button.primary { background: #e8eaf2; color: #0b1020; border-color: #e8eaf2; }
  button:focus-visible, .link:focus-visible { outline: 2px solid #7aa2ff; outline-offset: 2px; }
  @media (prefers-color-scheme: light) {
    body { background: #f7f8fc; color: #10142a; }
    p { color: #4d5570; }
    strong { color: #10142a; }
    button, .link { background: #fff; color: #10142a; border-color: #d3d8e8; }
    button.primary { background: #10142a; color: #fff; border-color: #10142a; }
  }
</style>
</head>
<body><main>${body}</main></body>
</html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Calls the SECURITY DEFINER RPC as `anon`. Returns true when a row matched. */
async function unsubscribe(token: string, category: string | null): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    console.error("unsubscribe: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not configured");
    return false;
  }

  const res = await fetch(`${url}/rest/v1/rpc/unsubscribe_by_token`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token, p_category: category }),
  });

  if (!res.ok) {
    // The token itself is a credential, so it is never logged.
    console.error("unsubscribe_by_token failed", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  // The RPC returns a boolean: false when no preferences row carries this token.
  return (await res.json().catch(() => false)) === true;
}

/** `?category=` is only honoured when it names a real category. */
function readCategory(raw: unknown): string | null {
  return typeof raw === "string" && KNOWN_CATEGORIES.has(raw) ? raw : null;
}

function scopeSentence(category: string | null): string {
  const label = category ? CATEGORY_LABEL[category] : null;
  return label
    ? `You will stop receiving <strong>${escapeHtml(label)}</strong> emails.`
    : `You will stop receiving <strong>all</strong> emails from ${APP_NAME}, except essential ones about your account such as password resets.`;
}

export default defineHandler(async (event) => {
  const method = event.req.method.toUpperCase();
  const url = new URL(event.req.url);
  const token = url.searchParams.get("token") ?? "";
  const category = readCategory(url.searchParams.get("category"));

  if (!token) {
    return page(
      "Link incomplete",
      `<h1>That link is incomplete</h1>
       <p>The unsubscribe address is missing its token, so we can't tell which
          subscription to end. Please use the link exactly as it appears in the
          email footer.</p>`,
      400,
    );
  }

  if (method === "POST") {
    // One-click. Mail clients post here directly; the form below posts here too.
    await readBody(event).catch(() => undefined);
    const ok = await unsubscribe(token, category);

    if (!ok) {
      return page(
        "Link expired",
        `<h1>We couldn't find that subscription</h1>
         <p>The link may have already been used, or it may have expired. If
            you're still receiving email you don't want, reply to any message
            and we'll sort it out.</p>`,
        404,
      );
    }

    return page(
      "Unsubscribed",
      `<h1>You're unsubscribed</h1>
       <p>${scopeSentence(category)}</p>
       <p>It can take a few minutes for anything already queued to stop.</p>
       <div class="actions"><a class="link" href="/">Back to ${APP_NAME}</a></div>`,
    );
  }

  if (method !== "GET" && method !== "HEAD") {
    return new HTTPResponse("Method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }

  // GET: confirm first. Never unsubscribe on a request no human made.
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe from ${APP_NAME} email?</h1>
     <p>${scopeSentence(category)}</p>
     <form method="post">
       <div class="actions">
         <button class="primary" type="submit">Yes, unsubscribe</button>
         <a class="link" href="/">No, keep them</a>
       </div>
     </form>`,
  );
});
