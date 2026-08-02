/**
 * Email design system.
 *
 * Email is not the web. Gmail strips <style> blocks in some clients, Outlook
 * renders through Word's HTML engine (no flexbox, no grid, no modern CSS), and
 * `prefers-color-scheme` is honoured by Apple Mail and iOS but ignored by Gmail
 * on Android. So:
 *
 *   - Layout is tables. Not nostalgia — the only thing that renders everywhere.
 *   - Styles are inline on every element. Anything in a <style> block is a
 *     progressive enhancement, never load-bearing.
 *   - **Dark palette is the default**, with a light-mode override rather than
 *     the other way round. Eclipta is a dark product; a white email would feel
 *     like a different company, and this way the brand survives the clients that
 *     ignore the media query entirely.
 *   - Width is 600px, the widest that survives Outlook's reading pane.
 */

export const BRAND = {
  // Matches src/styles.css --brand-* tokens so mail and app agree.
  bg: "#0B1020",
  surface: "#121831",
  surfaceAlt: "#1A2034",
  ink: "#F4F1EA",
  dim: "#BCBAB0",
  fog: "#7C8093",
  gold: "#D4AF37",
  blue: "#5B7FD4",
  border: "rgba(244,241,234,0.12)",
  // Two families with ubiquitous fallbacks. Web fonts are unreliable in email
  // (Outlook ignores @font-face), so the stack has to look right unloaded.
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

export interface EmailFrame {
  /** Preheader: the grey text after the subject in an inbox list. */
  preheader: string;
  title: string;
  bodyHtml: string;
  /** Unsubscribe URL — required in the footer of every non-transactional mail. */
  unsubscribeUrl?: string;
  /** Category label shown next to the unsubscribe link, so the user knows
   *  exactly which stream they are leaving. */
  categoryLabel?: string;
  appUrl: string;
}

/** Escape text destined for HTML. Everything user-authored goes through this. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap body content in the shared shell.
 *
 * The preheader trick: a hidden div of preheader text followed by a run of
 * zero-width spaces. Without the padding, the client pulls the first visible
 * words of the body into the inbox preview instead.
 */
export function renderEmail(frame: EmailFrame): string {
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(frame.title)}</title>
<style>
  /* Progressive enhancement only — nothing here is load-bearing. */
  @media (max-width: 620px) {
    .ec-wrap { width: 100% !important; }
    .ec-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .ec-stat { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
    .ec-h1 { font-size: 26px !important; }
  }
  /* Clients that DO honour the media query get a light variant. Dark is the
     default above, so ignoring this block still yields correct branding. */
  @media (prefers-color-scheme: light) {
    .ec-body { background: #F4F1EA !important; }
    .ec-card { background: #FFFFFF !important; }
    .ec-alt  { background: #F7F5EF !important; }
    .ec-ink  { color: #15192A !important; }
    .ec-dim  { color: #4A4F60 !important; }
    .ec-fog  { color: #6B7080 !important; }
    .ec-hr   { border-color: rgba(21,25,42,0.12) !important; }
  }
  a { text-decoration: none; }
</style>
</head>
<body class="ec-body" style="margin:0;padding:0;background:${BRAND.bg};-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:${BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(frame.preheader)}${pad}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" class="ec-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- Wordmark. Text, not an image: images are blocked by default in
             Outlook and Gmail, and a logo-only header renders as an empty box. -->
        <tr><td class="ec-pad" style="padding:0 32px 24px 32px;">
          <span style="font-family:${BRAND.display};font-size:20px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.gold};">Eclipta</span>
        </td></tr>

        <tr><td class="ec-card" style="background:${BRAND.surface};border-radius:14px;border:1px solid ${BRAND.border};">
          ${frame.bodyHtml}
        </td></tr>

        <tr><td class="ec-pad" style="padding:24px 32px 0 32px;">
          <p class="ec-fog" style="margin:0 0 8px 0;font-family:${BRAND.body};font-size:12px;line-height:18px;color:${BRAND.fog};">
            ${
              frame.unsubscribeUrl
                ? `You're receiving this because you have ${esc(frame.categoryLabel ?? "these emails")} switched on.
                   <a href="${frame.unsubscribeUrl}" style="color:${BRAND.fog};text-decoration:underline;">Unsubscribe</a>
                   · <a href="${frame.appUrl}/profile" style="color:${BRAND.fog};text-decoration:underline;">Email settings</a>`
                : `This is a service message about your Eclipta account.`
            }
          </p>
          <p class="ec-fog" style="margin:0;font-family:${BRAND.body};font-size:12px;line-height:18px;color:${BRAND.fog};">Eclipta · Learn by competing</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export function heading(text: string, sub?: string): string {
  return `<tr><td class="ec-pad" style="padding:32px 32px 0 32px;">
    <h1 class="ec-h1 ec-ink" style="margin:0;font-family:${BRAND.display};font-size:30px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:${BRAND.ink};">${esc(text)}</h1>
    ${
      sub
        ? `<p class="ec-dim" style="margin:10px 0 0 0;font-family:${BRAND.body};font-size:15px;line-height:23px;color:${BRAND.dim};">${esc(sub)}</p>`
        : ""
    }
  </td></tr>`;
}

export function paragraph(html: string): string {
  return `<tr><td class="ec-pad" style="padding:18px 32px 0 32px;">
    <p class="ec-dim" style="margin:0;font-family:${BRAND.body};font-size:15px;line-height:23px;color:${BRAND.dim};">${html}</p>
  </td></tr>`;
}

/**
 * Primary action. A table-wrapped anchor, not a styled <div>: Outlook drops
 * padding on inline elements, so the padding has to sit on a <td>.
 */
export function button(label: string, url: string): string {
  return `<tr><td class="ec-pad" style="padding:26px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="background:${BRAND.gold};border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${BRAND.body};font-size:15px;font-weight:600;color:${BRAND.bg};">${esc(label)}</a>
      </td>
    </tr></table>
  </td></tr>`;
}

export interface Stat {
  label: string;
  value: string;
  /** Optional delta, e.g. "+3 places". Rendered with a glyph as well as a
   *  colour, so the direction survives a colour-blind reader. */
  delta?: { text: string; direction: "up" | "down" | "flat" };
}

/** A row of figures. Table cells, which stack via the mobile media query. */
export function stats(items: Stat[]): string {
  const cells = items
    .map((s) => {
      const d = s.delta;
      const glyph = d ? (d.direction === "up" ? "▲" : d.direction === "down" ? "▼" : "—") : "";
      const colour = d
        ? d.direction === "up"
          ? BRAND.gold
          : d.direction === "down"
            ? BRAND.blue
            : BRAND.fog
        : BRAND.fog;
      return `<td class="ec-stat" width="${Math.floor(100 / items.length)}%" valign="top" style="padding:0 8px;">
        <p class="ec-fog" style="margin:0 0 4px 0;font-family:${BRAND.mono};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.fog};">${esc(s.label)}</p>
        <p class="ec-ink" style="margin:0;font-family:${BRAND.display};font-size:26px;line-height:1.1;font-weight:600;color:${BRAND.ink};">${esc(s.value)}</p>
        ${
          d
            ? `<p style="margin:4px 0 0 0;font-family:${BRAND.body};font-size:12px;color:${colour};">${glyph} ${esc(d.text)}</p>`
            : ""
        }
      </td>`;
    })
    .join("");
  return `<tr><td class="ec-pad" style="padding:26px 24px 0 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
  </td></tr>`;
}

/**
 * Horizontal bar chart.
 *
 * Bars are table cells with a background colour, because that is the only chart
 * that renders in every client: an <img> needs a server to draw it and is
 * blocked by default, SVG is stripped by Gmail and Outlook, and CSS gradients
 * are unreliable. Each row also states its value as text, so the chart is
 * readable when images are off and by a screen reader.
 */
export function barChart(rows: { label: string; value: number; max: number; note?: string }[]): string {
  const body = rows
    .map((r) => {
      const pct = r.max > 0 ? Math.max(2, Math.round((r.value / r.max) * 100)) : 2;
      return `<tr>
        <td style="padding:0 0 12px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:${BRAND.body};font-size:13px;color:${BRAND.dim};padding-bottom:5px;" class="ec-dim">
                ${esc(r.label)}
                <span style="color:${BRAND.fog};">— ${esc(r.note ?? String(r.value))}</span>
              </td>
            </tr>
            <tr><td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ec-alt" style="background:${BRAND.surfaceAlt};border-radius:5px;">
                <tr>
                  <td width="${pct}%" style="background:${BRAND.gold};border-radius:5px;font-size:0;line-height:0;height:8px;">&nbsp;</td>
                  <td width="${100 - pct}%" style="font-size:0;line-height:0;height:8px;">&nbsp;</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");
  return `<tr><td class="ec-pad" style="padding:26px 32px 0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr>`;
}

/** A labelled list, for weakest topics or recommendations. */
export function list(label: string, items: string[]): string {
  if (items.length === 0) return "";
  const lis = items
    .map(
      (i) =>
        `<li style="margin:0 0 7px 0;font-family:${BRAND.body};font-size:14px;line-height:21px;color:${BRAND.dim};" class="ec-dim">${esc(i)}</li>`,
    )
    .join("");
  return `<tr><td class="ec-pad" style="padding:26px 32px 0 32px;">
    <p class="ec-fog" style="margin:0 0 10px 0;font-family:${BRAND.mono};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.fog};">${esc(label)}</p>
    <ul style="margin:0;padding-left:18px;">${lis}</ul>
  </td></tr>`;
}

/** Pull-quote for a motivational insight. */
export function insight(text: string): string {
  return `<tr><td class="ec-pad" style="padding:26px 32px 0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ec-alt" style="background:${BRAND.surfaceAlt};border-radius:10px;">
      <tr><td style="padding:18px 20px;border-left:3px solid ${BRAND.gold};border-radius:10px;">
        <p class="ec-ink" style="margin:0;font-family:${BRAND.display};font-size:16px;line-height:24px;font-style:italic;color:${BRAND.ink};">${esc(text)}</p>
      </td></tr>
    </table>
  </td></tr>`;
}

export function divider(): string {
  return `<tr><td class="ec-pad" style="padding:28px 32px 0 32px;">
    <div class="ec-hr" style="border-top:1px solid ${BRAND.border};font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>`;
}

export function spacer(px = 32): string {
  return `<tr><td style="font-size:0;line-height:0;height:${px}px;">&nbsp;</td></tr>`;
}
