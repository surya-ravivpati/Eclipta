import type { Rendered } from "./templates.ts";

/**
 * Delivery.
 *
 * ── About the From address ──────────────────────────────────────────────────
 * The requested sender was `ecliptalearning@gmail.com`. That address **cannot**
 * be the From header of platform mail, and this is a hard constraint rather than
 * a preference:
 *
 *   - gmail.com publishes `v=spf1 redirect=_spf.google.com`, which does not
 *     authorise Resend/SendGrid/Postmark to send on its behalf. Every message
 *     would fail SPF.
 *   - DKIM cannot be aligned either: signing requires a key published under the
 *     sending domain's DNS, and nobody can add a DNS record to gmail.com.
 *   - Since February 2024 Google and Yahoo *require* SPF + DKIM + DMARC
 *     alignment from bulk senders. Unaligned mail is rejected or binned, so a
 *     Gmail From address means digests silently stop arriving.
 *
 * So: mail is sent from a verified domain (`EMAIL_FROM`), and
 * `ecliptalearning@gmail.com` is set as **Reply-To** — which is what that
 * address is actually good for. Replies land in the Gmail inbox as intended,
 * and delivery still authenticates. `EMAIL_REPLY_TO` overrides it.
 *
 * Provider is Resend-shaped but isolated behind `deliver()`, so swapping to
 * SendGrid or SES is one function.
 */

export interface SendResult {
  ok: boolean;
  providerId?: string;
  detail?: string;
}

const FROM = Deno.env.get("EMAIL_FROM") ?? "Eclipta <no-reply@ecliptalearning.com>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "ecliptalearning@gmail.com";
const API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

export async function deliver(args: {
  to: string;
  rendered: Rendered;
  /** Included so a recipient can leave without logging in — and because
   *  `List-Unsubscribe` is required by bulk-sender rules. */
  unsubscribeUrl?: string;
  /** Threads related notifications together in the recipient's client. */
  threadKey?: string;
}): Promise<SendResult> {
  if (!API_KEY) {
    // Loud in logs, harmless in effect: a missing key must not crash a digest
    // run over thousands of users.
    return { ok: false, detail: "RESEND_API_KEY is not configured" };
  }

  const headers: Record<string, string> = {};
  if (args.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${args.unsubscribeUrl}>`;
    // Signals that the URL is a one-click POST endpoint, which Gmail and Yahoo
    // now expect; without it they show their own "report spam" path instead.
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (args.threadKey) {
    headers["References"] = `<${args.threadKey}@ecliptalearning.com>`;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [args.to],
        subject: args.rendered.subject,
        html: args.rendered.html,
        // Always multipart: a message with no text/plain part scores badly with
        // spam filters and is unreadable in plain-text mode.
        text: args.rendered.text,
        headers,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, detail: `${res.status}: ${detail.slice(0, 300)}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, providerId: json.id };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown send error" };
  }
}

/** Public unsubscribe URL for a preferences token. */
export function unsubscribeUrl(appUrl: string, token: string, category?: string): string {
  const q = category ? `&category=${encodeURIComponent(category)}` : "";
  return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}${q}`;
}
