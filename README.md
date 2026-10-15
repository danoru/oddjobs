# Tear-Off

A tavern notice board of ready-made one-shot **casts**. Each one-shot is a job posting; its characters are posters with a hook, ties to each other, a stake in *this* adventure and a private secret. Players tear a poster off to claim a character, then print it, send it to Foundry, rebuild it in D&D Beyond, or tweak it.

Next 16 (Pages Router) · React 19 · MUI 9 · CSS Modules · Zod · Vitest · Prisma 6 + Postgres · pnpm · Vercel. Content is JSON in git, validated at build time; the database only holds table sessions (who tore which poster).

## Run it

```bash
pnpm install
cp .env.example .env.local   # set APP_PASSWORD, GM_PASSWORD and AUTH_SECRET
pnpm db:dev                  # local Postgres (Prisma's `prisma dev`); prints a TCP URL
# put DATABASE_URL and DIRECT_URL in .env (the Prisma CLI doesn't read .env.local):
#   the printed TCP URL plus &schema=tearoff&connection_limit=1, for both
pnpm db:deploy               # apply prisma/migrations
pnpm dev                     # http://localhost:3004
```

The site sits behind a password gate (`src/proxy.ts`, `src/lib/auth.ts`, ported from world-gazetteer) with two tiers. `APP_PASSWORD` lets players in. `GM_PASSWORD` lets the GM in too and also opens `/<oneshot>/gm`. The signed cookie carries the role (`table` or `gm`). The proxy sends anyone else from a GM page to the login page, and the GM page and GM-only API routes check the role again themselves.

If `prisma migrate` fails with `prepared statement "s0" already exists`, the local server is holding a stale connection: `pnpm exec prisma dev stop tearoff`, then `pnpm db:dev` again. The local server takes one connection at a time.

Without a database the site still works: claims just stay in each browser, as in v1.

| Script | What it does |
|---|---|
| `pnpm validate [slug]` | Parse and cross-check content; prints each character's key numbers |
| `pnpm test` | Rules math, customization, exporters, auth roles, table codes, `gmNotes` stays off player pages |
| `pnpm build` | `prisma generate`, validate, then `next build` (fails on any broken one-shot) |
| `pnpm db:dev` | Start a local Postgres server in the background (`prisma dev --name tearoff --detach`); stop it with `pnpm exec prisma dev stop tearoff` |
| `pnpm db:migrate` | `prisma migrate dev`: make a new migration after editing `prisma/schema.prisma` |
| `pnpm db:deploy` | Apply migrations to `DIRECT_URL` |
| `pnpm import-draft <file>.draft.json [--force]` | Write a cast drafted on `/draft` into `content/oneshots/`, then validate it |
| `pnpm pdf [slug] [--a4]` | **Local only.** Render `public/pdf/<slug>-sheets.pdf` and `-flyer.pdf` from a running server with Playwright. Never runs on Vercel. |

## Pages

- `/` — the board: one posting per one-shot, filter by ruleset and table size.
- `/<oneshot>` — premise, the cast as posters (tear to claim), who-knows-whom, party role coverage. A note on top joins a table by code; `/<oneshot>?table=CODE` fills the code in.
- `/<oneshot>/<character>` — the two-page sheet, plus Print, Customize, D&D Beyond recipe and Foundry export.
- `/<oneshot>/print` — every sheet, ready to print.
- `/<oneshot>/flyer` — a physical tear-off flyer: one strip per character with a QR code to their sheet.
- `/<oneshot>/gm` — **GM password only.** Open a table and read out its code, watch claims live (and pin any poster back up), plus the `gmNotes`, every character's secret and the full private tie texts. Also: *What changes tonight*, sealed letters to deliver, and the session-zero recap.
- `/<oneshot>/tv` — the board for the TV: big posters, the table code and a join QR. Posters rip off live as players claim them on their phones.
- `/<oneshot>/sounds` — the GM's soundboard: ambience beds that crossfade and one-shot stingers, all synthesised in the browser (no audio files).
- `/<oneshot>/epilogue` — the morning after: give each character a fate and one line, print a broadsheet front page, and save survivors to the shared world.
- `/draft` — **GM password only.** A cast from a pitch: Claude drafts the one-shot and its cast, the site's validator checks it, and you download it for `pnpm import-draft`.

## Table play

- **Red-yarn board.** The job page shows who knows whom as cards joined by red string with the board-safe tie lines. Once posters are being claimed, unclaimed characters turn into grey NPC cards.
- **What changes tonight.** Each character's `ifUnclaimed` says how to run them as an NPC, which story beats move to whom (first listed character at the table wins), and what gets cut. The GM page works it out from the live claims (`src/lib/tonight.ts`).
- **Sealed letters.** One-shots declare `letters`, each addressed to one character and timed to an act. The GM delivers them from the GM page. They arrive on that player's sheet as a sealed envelope, and the player breaks the seal to read it. Story beats inherited from absent characters can be sent the same way. Text is resolved from content on the server and only ever sent to the holder of the recipient character (`/api/tables/<code>/letters`, `Delivery` in Prisma).
- **Session zero.** Each character has a `flashback` question. After claiming, the player answers it on their sheet, and the GM page collects the answers as a "previously on…" recap (`/api/tables/<code>/flashbacks`, `Flashback` in Prisma).
- **Woodcut portraits.** In Customize, upload any photo and it's turned into an ink-on-parchment engraving in the browser (`src/lib/woodcut.ts`). It's stored with the tweaks on that device and isn't included in share links.
- **The shared world.** The epilogue page downloads survivor records. Put the file in `content/legacy/` and survivors appear on the home board and as "also seen in town" cameos on other one-shots (`src/lib/legacy.ts`).

## Tables (shared claims)

The GM opens a **table** on the GM page and gets a five-character code (no 0/O/1/I). Players type it on the job page with their name. After that, tearing a poster locks it for everyone at that table, and every board, sheet and the GM page poll the table every 3 seconds. Only whoever tore a poster, or the GM, can pin it back up.

- Storage: `prisma/schema.prisma`. A `Table` (code and one-shot) has many `Claim`s. The unique `(tableId, characterId)` key is the lock, so two players tearing at once can't both win.
- API: `POST /api/tables` (GM only) opens a table. `GET /api/tables/<code>` returns the table. `POST` or `DELETE /api/tables/<code>/claims` tears a poster or pins it back up.
- Players get no accounts. Each browser makes up a random player id (sent as `x-tearoff-player`) and remembers it with the player's name in localStorage. The API only tells each browser which claims are *its own*; it never sends other players' ids.
- Client: `useClaims` in `src/lib/storage.ts`. It polls when the browser has a table code for this one-shot. Without a code it uses localStorage only.
- Tables are never deleted yet; they're tiny.

`gmNotes` never reaches a player. Player pages are static and built from `toPublic()`, which strips it. The GM page uses `getServerSideProps`, which checks the role before reading content, so there's no static page or `_next/data` file for it. Because that page reads `content/` at request time, `next.config.mjs` adds the content to its file tracing (`outputFileTracingIncludes`).

Customizations are stored per browser (localStorage) and can be shared with a `#t=` link.

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

### Table sync module

`tools/foundry/tearoff-sync/` is a Foundry module (v12/v13, dnd5e) that shows the Tear-Off board for a table inside Foundry. When a player tears a poster, it gives the matching Foundry user ownership of the imported actor (matched on `flags.tearoff`) and a private journal with their secret. It talks to `GET /api/foundry/tables/<code>` with `Authorization: Bearer $FOUNDRY_TOKEN`. That route skips the site cookie, returns CORS headers, and only includes secrets for claimed characters. See the module's README. It hasn't been run in a real Foundry yet.

## D&D Beyond

D&D Beyond has no import API, so each sheet offers a **build recipe** (`src/lib/export/ddb.ts`): the builder's own steps in order, with final ability scores entered as overrides and a "check it matches" line at the end.

## Deploy

GitHub (private repo — gated content may include non-SRD material) → Vercel. Set these in the Vercel project:

- `APP_PASSWORD`, `GM_PASSWORD` and `AUTH_SECRET`.
- Optional: `FOUNDRY_TOKEN` (Foundry table sync) and `ANTHROPIC_API_KEY` (drafting casts on `/draft`).
- `DATABASE_URL` (Supabase pooler, port 6543, `?pgbouncer=true&schema=tearoff`) and `DIRECT_URL` (port 5432, `?schema=tearoff`). It's the same Supabase project as world-gazetteer, in its own Postgres schema. `prisma migrate deploy` needs `DIRECT_URL`.

`vercel-build` runs `prisma migrate deploy`, then `prisma generate`, then validation, then `next build`.

See `docs/PLAN.md` for the roadmap and the wow-feature list.
