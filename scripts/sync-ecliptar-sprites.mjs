#!/usr/bin/env node
/**
 * Sync Ecliptar sprite art → public/ecliptars/<slug>.png
 *
 * Source of truth: the `Ecliptars/` folder in the repo, laid out as
 *   Ecliptars/<anything>/<Creature Name>/sprite.png
 * The PARENT folder name is ignored — each creature is matched to its stable
 * slug by NAME (via the roster below, which mirrors ECLIPTAR_NAMES in
 * src/lib/ecliptars.ts), so "Iron Hide" → tank-d, "Nitpick" → chud-d, etc.
 *
 * For any creature folder that has art but no sprite.png yet, this also creates
 * sprite.png from the single image it finds (so "every folder has a sprite.png").
 *
 * Run:  node scripts/sync-ecliptar-sprites.mjs   (or: npm run sync:sprites)
 */
import { readdirSync, existsSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Keep in sync with ECLIPTAR_NAMES in src/lib/ecliptars.ts.
const ROSTER = {
  speedster:   ["Griffstrike", "Spark", "Correr", "Zypheroo"],
  tank:        ["Dingus", "Syntium", "Mammorock", "Ironhide"],
  chud:        ["Razorwing", "Crownscar", "Nighthorn", "Nitpick"],
  gambler:     ["Mr. McHenry", "Rattleslot", "Snailouette", "Fortunox"],
  healer:      ["BrightEye", "Chobroni", "Bloomheart", "Mossy Golem"],
  fulcrum:     ["Fuego", "Petrona", "Ticonder", "Equinox"],
  accelerator: ["Venuck", "Fueljaw", "Adrenalynx", "Chronovex"],
  god:         ["Newton", "Ecliptadon", "Einsteinium", "Temporubyss"],
};
const SLOTS = ["a", "b", "c", "d"];
// God Ecliptars use named slugs (not god-a..d). Order matches ROSTER.god.
const GOD_SLUGS = ["newton", "ecliptadon", "einsteinium", "temporobys"];
const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const nameToSlug = {};
for (const [arch, names] of Object.entries(ROSTER)) {
  names.forEach((n, i) => {
    nameToSlug[norm(n)] = arch === "god" ? GOD_SLUGS[i] : `${arch}-${SLOTS[i]}`;
  });
}

const SRC = "Ecliptars";
const OUT = join("public", "ecliptars");
if (!existsSync(SRC)) { console.error(`No ${SRC}/ folder found.`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const dirs = (p) => readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory());
let copied = 0, made = 0, warned = 0;

for (const archFolder of dirs(SRC)) {
  for (const creature of dirs(join(SRC, archFolder))) {
    const dir = join(SRC, archFolder, creature);
    let sprite = join(dir, "sprite.png");

    // 1. Ensure a sprite.png exists in the folder.
    if (!existsSync(sprite)) {
      const imgs = readdirSync(dir).filter((f) => IMG_EXT.has(extname(f).toLowerCase()));
      const pick = imgs.find((f) => /^sprite/i.test(f)) ?? (imgs.length === 1 ? imgs[0] : null);
      if (pick) { copyFileSync(join(dir, pick), sprite); made++; console.log(`made   ${sprite}  (from "${pick}")`); }
      else { console.warn(`WARN   ${dir}: no sprite.png and ${imgs.length === 0 ? "no image" : "multiple images — rename one to sprite.png"}`); warned++; continue; }
    }

    // 2. Copy it to public/ecliptars/<slug>.png.
    const slug = nameToSlug[norm(creature)];
    if (!slug) { console.warn(`WARN   "${creature}" (in ${archFolder}/) matches no known Ecliptar — skipped`); warned++; continue; }
    copyFileSync(sprite, join(OUT, `${slug}.png`));
    copied++; console.log(`sync   ${creature} → public/ecliptars/${slug}.png`);
  }
}
console.log(`\nDone: ${copied} sprites synced, ${made} sprite.png created, ${warned} warnings.`);
