# Eclipta brand system

**Direction: Competitive Intelligence** — elite academy crossed with a
competitive arena. Midnight navy, warm ivory, gold accents; scholarly serif
headings; glow reserved for what's *earned* (rank, XP), not everything.
The feeling to chase is *aspirational* ("I want to become elite"), not
"cool sci-fi effects."

Single source of truth for color, type, and the logo lockup. If you're
adding a surface, reference these roles — never re-declare a font stack,
hardcode a brand color, or reassemble the logo by hand.

> The previous neon/cinematic-blue look is preserved on the
> `backup/brand-v1-cinematic-blue` branch (and local tag
> `brand-v1-cinematic-blue`) for easy reversal.

## Color spine

Canonical primitives live in `src/styles.css` `:root` as `--brand-*`
(bg, ink, dim, fog, line, line-2, flash, accent, accent-base, slate).
Cinematic scopes (`.cf`, `.ab`, `.btt`, Progress, Trophy Road) alias these —
change the brand once, it propagates everywhere.

- `--brand-bg` `#0B1020` — deep midnight navy (the one Eclipta ground).
- `--brand-ink` `#F4F1EA` — warm ivory text.
- `--brand-accent` / `--brand-accent-base` `#D4AF37` — **gold**, the single
  brand accent (also `--primary`/`--accent`/`--ring`). `--neon-purple` is a
  deprecated alias of `--accent`; prefer the `accent`/`primary` colors.
- `--brand-slate` `#3A4458` — quiet structural support.
- Restraint: gold is for *achievement and emphasis*, not every button. Let
  rank/XP shine; keep ordinary chrome calm (ivory/slate on navy).
- `--tier-diamond` sits at hue ~215 (icy), distinct from the gold accent.

### Battle team cues
1v1 uses a gold-vs-silver (1st-vs-2nd) contrast, not a neon duel:
- `--btt-you` `#D4AF37` (brand gold) · `--btt-foe` `oklch(0.74 0.03 250)`
  (cool steel-silver). `--btt-cyan`/`--btt-pink` are legacy aliases of these.
- Damage = restrained crimson (hue ~22), heal = gold; the critical-HP
  vignette stays red (functional danger).

### Aurora / glow
- Every scope's atmospheric aurora is a low-chroma navy wash + a restrained
  gold highlight (landing, About, Battles, Progress, Luna). The landing film
  resolves cool→gold as the eclipse turns; base intensity was lowered.
- Glow restraint (partial): the loudest *ambient* glows (hero title, idle
  lobby, card pulses) were demoted/recolored to subtle gold. A full
  per-component pass — making only *earned* states (rank, XP, victory) glow
  while ordinary chrome stays matte — is still worthwhile as components evolve.

## Type roles

One signature, each supporting role assigned by purpose. Defined once in
`src/styles.css` `@theme` (so they also emit `font-*` utilities) and
referenced by every scope.

| Token | Utility | Face | Role |
|-------|---------|------|------|
| `--font-display` | `font-display` | **Fraunces** (serif) → Playfair → Georgia | Signature: scholarly headings — prestige, not gaming |
| `--font-cinematic` | `font-cinematic` | **Archivo** (webfont) | Editorial hero / long-form display (landing, About, Compass, Luna session, Progress/Trophy body) |
| `--font-serif` | `font-serif` | **Instrument Serif** *italic* | Emotional accent / emphasis |
| `--font-shout` | `font-shout` | **Bebas Neue** | Condensed stat / big-number shout (battle HUD, Progress, Trophy Road, Luna name) |
| `--font-body` | `font-body` | **Inter** | Body copy |
| `--font-mono` | `font-mono` | **JetBrains Mono** | Labels, numerics, the wordmark |

Why serif + grotesque: Fraunces (display serif) carries the "elite academy"
prestige on headings; Archivo (clean grotesque, webfont-loaded) handles
editorial hero/long-form display where a serif would tire. Both render the
same off-Mac. The old gamer sans (RobotHeroes) is retired from the signature
role but its `@font-face` remains for the Bebas `--font-shout` fallback.

**Rule:** the same *role* must never drift between faces across surfaces.
If a new scope needs a heading, it uses `--font-display`/`font-display` —
not a fresh font stack.

## Logo lockup

Use `<BrandLockup>` (`src/components/BrandLockup.tsx`) — the only
sanctioned way to render the mark + wordmark.

- **Wordmark face:** JetBrains Mono, uppercase, `0.3em` tracking (the mono
  voice — RobotHeroes can't carry a lowercase wordmark reliably).
- **Sizes:** `sm` (22px mark) · `md` (30) · `lg` (44) · `xl` (72). The mark
  never renders below `MIN_MARK` = 18px.
- **Clear space:** pass `clearSpace` to reserve ½ the mark height on all
  sides.
- **Variants:** `full` (mark + wordmark), `mark` (icon only), `mono-light`
  (white, for imagery/inverted), `mono-dark` (black, for light surfaces).

```tsx
<BrandLockup size="sm" />                    // nav / footer
<BrandLockup size="xl" variant="mark" />     // hero mark
<BrandLockup variant="mono-light" />         // over a photo
```

The favicon is a separate square crop at `public/favicon.png` (cache-busted
via `?v=` in `__root.tsx`).
