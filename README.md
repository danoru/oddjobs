# Tear-Off

A tavern notice board of ready-made one-shot **casts**. Each one-shot is a job posting; its characters are posters with a hook, ties to each other, a stake in *this* adventure and a private secret. Players tear a poster off to claim a character, then print it, send it to Foundry, rebuild it in D&D Beyond, or tweak it.

Next 16 (Pages Router) · React 19 · MUI 9 · CSS Modules · Zod · Vitest · pnpm · Vercel. No database: content is JSON in git, validated at build time.

## Run it

```bash
pnpm install
cp .env.example .env.local   # set APP_PASSWORD and AUTH_SECRET
pnpm dev                     # http://localhost:3004
```

The whole site sits behind one table password (`src/proxy.ts`, `src/lib/auth.ts`, ported from world-gazetteer).

| Script | What it does |
|---|---|
| `pnpm validate [slug]` | Parse and cross-check content; prints each character's key numbers |
| `pnpm test` | Rules math, customization, exporters |
| `pnpm build` | Validate, then `next build` (fails on any broken one-shot) |
| `pnpm pdf [slug] [--a4]` | **Local only.** Render `public/pdf/<slug>-sheets.pdf` and `-flyer.pdf` from a running server with Playwright. Never runs on Vercel. |

## Pages

- `/` — the board: one posting per one-shot, filter by ruleset and table size.
- `/<oneshot>` — premise, the cast as posters (tear to claim), who-knows-whom, party role coverage.
- `/<oneshot>/<character>` — the two-page sheet, plus Print, Customize, D&D Beyond recipe and Foundry export.
- `/<oneshot>/print` — every sheet, ready to print.
- `/<oneshot>/flyer` — a physical tear-off flyer: one strip per character with a QR code to their sheet.

Claims and customizations are stored per browser (localStorage) in v1. Customizations can be shared with a `#t=` link.

## Writing a one-shot

```
content/oneshots/<slug>/oneshot.json
content/oneshots/<slug>/characters/<id>.json   # filename == id
```

The schema is `src/lib/schema.ts`; extra checks are in `crossCheck` in `src/lib/content.ts` (levels add up, ties point at real characters, ruleset-specific fields, customization options tag exactly one entry…). `content/oneshots/the-drowned-bell` is the reference.

Things that make a cast work:
- `premise` explains why exactly these people are together tonight.
- Every character has a `stake` in *this* adventure, a `secret` that makes for a great reveal without forcing PvP, and ties to at least one other character.
- Each tie has private `text` (on the player's own sheet) and an optional board-safe `public` line — **only `public` is shown on the shared board**, so keep secrets out of it.
- `poster.alias` (e.g. `"????"`) hides a mystery character's name on the board and flyer.
- `options` give players sanctioned swaps (a cantrip, a weapon, a trinket). A spell option can carry the `attack` line it produces.
- Feature text is a short paraphrase, never book text.

HP and AC are authored; modifiers, saves, skills, passive scores, initiative, spell DC and attack lines are derived (`src/lib/derive.ts`).

## Foundry

The export (`src/lib/export/foundry.ts`) is a **beta "lite" actor**: abilities, save/skill proficiencies, HP and AC overrides, spell slots, plus features, weapons and spells as plain items. Import it via right-click on an actor → *Import Data*.

To graduate to full compendium items with working advancement, we need, from your own Foundry:
1. Your Foundry and dnd5e system versions.
2. One fully built **2014** character and one fully built **2024** character, exported via *Export Data*, saved to `data/foundry/reference/`.
3. One run of `tools/foundry/harvest-items.js` as a Script macro; commit the downloaded `tearoff-harvest.json` to `data/foundry/`.

The first thing to compare is each class item's `advancement` array: dnd5e 4.x/5.x derives HP and features from it.

## D&D Beyond

D&D Beyond has no import API, so each sheet offers a **build recipe** (`src/lib/export/ddb.ts`): the builder's own steps in order, with final ability scores entered as overrides and a "check it matches" line at the end.

## Deploy

GitHub (private repo — gated content may include non-SRD material) → Vercel. Set `APP_PASSWORD` and `AUTH_SECRET` in the Vercel project. `vercel-build` runs validation then `next build`.

See `docs/PLAN.md` for the roadmap and the wow-feature list.
