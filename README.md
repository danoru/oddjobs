# Oddjobs

*Formerly Tear-Off.* The repo folder, browser storage keys, login cookie and Foundry module id still say `tearoff` on purpose, so saved claims, logins and imported Foundry actors keep working.

A tavern notice board of ready-made one-shot **casts**. Each one-shot is a job posting; its characters are posters with a hook, ties to each other, a stake in *this* adventure and a private secret. Players tear a poster off to claim a character, then print it, send it to Foundry, rebuild it in D&D Beyond, or tweak it.

One-shots come in more than one game system:

- **D&D 5e** (2014 and 2024) is the original.
- **Ten Candles** is a play aid for tables that own the game, with candles, dice, cards, truths and last words run from everyone's phones.
- **Daggerheart** is built on its SRD, with level-1 casts, domain cards and duality dice rolled from the phone.
- **Paranoia** is a play aid for tables that own the 2023 Core Book. It gives Troubleshooters whose naughty sides never reach a player page, NODE dice with the Computer die, six-packs of clones, treason Flags, treason reports and Friend Computer on every screen.

See [docs/SYSTEMS.md](docs/SYSTEMS.md) for how systems plug in, and for each game's rules, licence and sources.

Next 16 (Pages Router) · React 19 · MUI 9 · CSS Modules · Zod · Vitest · Prisma 6 + Postgres · pnpm · Vercel. Content is JSON in git, validated at build time, and written through the **builder** at `/admin` (see [The builder](#the-builder)); the database only holds table sessions (who tore which poster).

## Run it

```bash
pnpm install
cp .env.example .env         # set APP_PASSWORD, GM_PASSWORD and AUTH_SECRET
pnpm db:dev                  # local Postgres (Prisma's `prisma dev`); prints a TCP URL
# also put DATABASE_URL and DIRECT_URL in .env (keep everything in .env: the Prisma CLI only reads .env,
# and a .env.local would override it for Next):
#   the printed TCP URL plus &schema=tearoff&connection_limit=1, for both
pnpm db:deploy               # apply prisma/migrations
pnpm dev                     # http://localhost:3004
```

The site sits behind a password gate (`src/proxy.ts`, `src/lib/auth.ts`, ported from world-gazetteer) with two tiers. Whoever comes in with the GM password gets a **GM bar** across the top of every page (`src/components/GmBar.tsx`): the builder, the spell book and the chronicle, plus, on a one-shot's pages, its GM page, TV, printed box (and kit), tapestry and builder entry. **Hide** folds it into a small tab to see a page as players do; the TV never shows it. It asks `/api/whoami` for the role and is only navigation: the pages and APIs still check the role themselves. `APP_PASSWORD` lets players in. `GM_PASSWORD` lets the GM in too and also opens `/<oneshot>/gm`. The signed cookie carries the role (`table` or `gm`). The proxy sends anyone else from a GM page to the login page, and the GM page and GM-only API routes check the role again themselves.

If `prisma migrate` fails with `prepared statement "s0" already exists`, the local server is holding a stale connection: `pnpm exec prisma dev stop tearoff`, then `pnpm db:dev` again. Adding `&pgbouncer=true` to the local `DATABASE_URL` (not `DIRECT_URL`) stops the app from using named prepared statements, which keeps the local server from tripping over them under the phones' polling. The local server takes one connection at a time. In phase 4's four-phone Ten Candles runs, the detached server (`pnpm db:dev`) stopped on its own a few minutes in; running it in the foreground in its own terminal (`pnpm exec prisma dev --name tearoff`) stayed up, and so does having only one app server connected to it.

In phase 6's runs the local `prisma dev` server also exited silently a few minutes into a busy table (a GM, phones and the TV all polling) and came back empty: it only holds test tables, so start it again and run `pnpm db:deploy`. For long e2e runs, a plain PGlite socket server (`@electric-sql/pglite` with `@electric-sql/pglite-socket`, the engine `prisma dev` uses) on the same port stayed up for every run.

Without a database the site still works: claims just stay in each browser, as in v1.

| Script | What it does |
|---|---|
| `pnpm validate [slug]` | Parse and cross-check content; prints each character's key numbers (Daggerheart: Evasion, HP, Stress, Armor, thresholds, traits and domain cards) |
| `pnpm test` | Rules math (HP, slots, pact magic), level variants, cards, tokens, reading modes, customization, exporters, auth roles, table codes, `gmNotes` stays off player pages; the event log's rules and privacy (notes, hidden rolls, rumor truths, ticks, targeted bells, no browser ids), the tapestry, the Ten Candles mirror and its act cards, shake detection, and the builder's new fields. Daggerheart: the derived numbers, every check, the SRD tables and errata, duality dice, Hope/Fear/slot tallies and who may move them, its privacy rules, and its checks pointing at their builder fields |
| `pnpm build` | `prisma generate`, validate, then `next build` (fails on any broken one-shot) |
| `pnpm db:dev` | Start a local Postgres server in the background (`prisma dev --name tearoff --detach`); stop it with `pnpm exec prisma dev stop tearoff` |
| `pnpm db:migrate` | `prisma migrate dev`: make a new migration after editing `prisma/schema.prisma` |
| `pnpm db:deploy` | Apply migrations to `DIRECT_URL` |
| `pnpm pdf [slug] [--a4]` | **Local only.** Render `public/pdf/<slug>-sheets`, `-cards`, `-tents` and `-flyer` PDFs (and `<slug>-l<N>-…` for each level variant; `<slug>-kit` and `-flyer` for Ten Candles) from a running server with Playwright. Never runs on Vercel. |
| `pnpm a11y-check [route…]` | **Local only.** Run axe-core over the main pages (signed in as GM) and Tab through each, checking every focus stop shows a ring. Exits 1 on any problem. |
| `pnpm parity snap <dir>` / `pnpm parity diff <a> <b>` | **Local only.** Snapshot every 5e page's visible text, every printable's PDF page count and a few screenshots, then compare two snapshots. Run it before and after a refactor: phase 4 used it to prove moving 5e into `src/systems/dnd5e/` changed nothing. |
| `pnpm e2e:builder` | **Local only.** Builds a 5e one-shot (three characters), a Ten Candles module, a Daggerheart one-shot (two characters, with the rules help) and a Paranoia mission (two Troubleshooters, the skill draft, naughty sides kept off player pages) from nothing in the builder, in headless Chromium against a running dev server: trips and fixes the checks, publishes both, reads them back on the board and their sheets, duplicates, edits and unpublishes one, checks players can't reach `/admin` or its API, then deletes every test one-shot. `SHOTS=dir` saves screenshots, `KEEP=1` leaves the test one-shots. |
| `pnpm e2e:candles` | **Local only.** Plays a whole Ten Candles night in headless Chromium against a running server with a database: a GM and three phones with fake microphones, creation, recordings, truths, rolls, the Last Stand and the end. Checks along the way that nobody sees another player's cards or recordings. `SHOTS=dir` saves screenshots. |
| `pnpm e2e:toys` | **Local only.** Phase 6's table toys end to end in headless Chromium against a running server with a database: a GM, two phones and the TV on a 5e table (The Drowned Bell) and a Ten Candles one (Lights Out at Marrowby). Dice and the tray, notes, the bell, act cards, the spotlight (with a fast-forwarded clock), rumors, the town board, coins, the epilogue per table, the tapestry and the chronicle; it page-checks the printed box on Letter and A4, the tapestry and the chronicle, and checks over HTTP and on screen that players never see GM-only data, other players' notes, hidden rolls or rumor truths. `SHOTS=dir` saves screenshots. |
| `pnpm e2e:daggerheart` | **Local only.** A Daggerheart night (A Vow Before Dawn) in headless Chromium, against a running server with a database: a GM, two phones and the TV. It covers the opening Fear, duality rolls from the sheet until both Hope and Fear have come up (checked against the server's fold and on the TV), an Experience and advantage, damage dice, slots and the damage helper, the GM correcting a mark and spending Fear, adversary attacks behind the screen, and phase 6's toys at a Daggerheart table. It also checks the box's page count on Letter and A4, the tapestry and the chronicle, axe on the new screens, and over HTTP that players never see the adversaries, GM notes, letters, hidden rolls or browser ids. `SHOTS=dir` saves screenshots. |
| `pnpm e2e:paranoia` | **Local only.** A Paranoia mission in headless Chromium against a running server with a database: a GM, two phones and the TV. It checks first that no player page, print view, cards or tents page carries a naughty side, and that the secrets API hands each phone only its own. Then it plays NODE dice from the sheet (checked against the sheet, wounds and Flags on the server), gear dice, wounds and Moxie on the phone, a clone's death and the next one decanted, a treason report the accused and the TV can't read, Flags and XP from the GM, Friend Computer on every screen, and phase 6's toys. It also checks the box (both sides) on Letter and A4, the tapestry and the chronicle, and runs axe. `SHOTS=dir` saves screenshots. |
| `pnpm print-check [slug]` | **Local only.** Render every printable at every level, on Letter and A4, in each reading mode, count the PDF pages and look for card text that overflows. Exits 1 if anything doesn't fit. |

## Pages

- `/` — the board: one posting per one-shot, each with a system badge; filter by game, ruleset and table size.
- `/<oneshot>` — premise, the cast as posters (tear to claim), who-knows-whom, party role coverage. A note on top joins a table by code; `/<oneshot>?table=CODE` fills the code in. If the one-shot has level variants, wax stamps on the posting pick the level. The page wears the one-shot's skin.
- `/<oneshot>/<character>` — the two-page sheet, plus Print, Customize, D&D Beyond recipe and Foundry export.
- `/<oneshot>/print` — every sheet, ready to print.
- `/<oneshot>/cards` and `/<oneshot>/<character>/cards` — spell, item and feature cards, nine to a page with crop marks.
- `/<oneshot>/tents` and `/<oneshot>/<character>/tent` — folded name tents, two to a page, plus round token PNGs to download.
- `/<oneshot>/flyer` — a physical tear-off flyer: one strip per character with a QR code to their sheet.
- `/<oneshot>/gm` — **GM password only.** Open a table and read out its code, watch claims live (and pin any poster back up), plus the `gmNotes`, every character's secret and the full private tie texts. Also: *What changes tonight*, sealed letters to deliver, and the session-zero recap.
- `/<oneshot>/tv` — the board for the TV: big posters, the table code and a join QR. Posters rip off live as players claim them on their phones.
- `/<oneshot>/sounds` — the GM's soundboard: ambience beds that crossfade and one-shot stingers, all synthesised in the browser (no audio files).
- `/<oneshot>/epilogue` — the morning after: give each character a fate and one line, print a broadsheet front page, and save survivors to the shared world. At a table it's kept with the table: the GM sets the front page and each player writes their own character's line.
- `/<oneshot>/tapestry` — the night's tapestry: a frieze woven from the table's events, printed as a long strip or a poster. The GM can rename or drop panels.
- `/<oneshot>/box` — **GM password only.** Print the whole box: every printable for a table without phones, in table order (sealed letters included, so it's GM-only).
- `/chronicle` — every night with a morning-after front page, bound into one printable book: a title page, then a chapter per night with its broadsheet, tapestry and survivors.
- `/admin` — **GM password only.** The one-shot builder: every one-shot, published and draft, to create, edit, duplicate, unpublish, delete, import and export. `/admin/<slug>` edits one; `/admin/preview/<slug>[/<character>|/print]` shows the real player pages from the saved draft.

Ten Candles one-shots have no sheets, cards or tents. Instead:

- `/<oneshot>/play` — **the phone at the table.** Join with the code, optionally take a pre-made, sit down, then make your character with the people either side of you and play the night: rolls, burning cards, truths, last words.
- `/<oneshot>/<character>` — a pre-made concept (name, look, who they were), to take instead of starting blank.
- `/<oneshot>/gm` — adds seats, house readings for disputed rules, ten candles to match the real ones, every player's stack, truths, rolling for a player, and the module with the current stage lit.
- `/<oneshot>/tv` — ten flickering candles (steady for viewers who prefer less motion), the join QR, truths as they're said, every roll, and the last words in the dark.
- `/<oneshot>/kit` — **GM password only.** The printable table kit: the module, a candle and scene tracker, 3 × 5 in index cards, MISSING posters and the flyer.

Daggerheart one-shots have the 5e pages, with Daggerheart's own content:

- `/<oneshot>/<character>` — the two-page Daggerheart sheet. At a table it's the phone in play (see below).
- `/print`, `/cards`, `/tents` — the printables. The cards are the domain cards (in each domain's ink), weapons, armor and features.
- `/<oneshot>/gm` — adds the Fear pool, everyone's Hope and marks, and the GM-only adversaries.
- `/<oneshot>/tv` — adds the Fear pool, each claimed poster's Hope, Stress and HP, and the Hope and Fear dice.

Paranoia one-shots have the same pages, but secrets work differently:

- `/<oneshot>/<character>` — the public side of the Troubleshooter's sheet. At a table, the claiming player gets their naughty side (from `/api/tables/<code>/secrets`), sealed until they break it.
- `/print`, `/cards`, `/tents` — the public side only: clone ID and gear cards, tents with the clone name to the table.
- `/<oneshot>/box` — **GM only.** Adds both sides of every sheet, and the society, mutation and secret-objective cards.
- `/<oneshot>/gm` — adds every naughty side, Friend Computer says, everyone's record, and the treason reports.

## Ten Candles at the table

A play aid, not the game: you need [Ten Candles](https://cavalrygames.com/ten-candles-info) (Cavalry Games). Every rule and prompt is in our own words. We couldn't check the rules against the book, so each rule carries a confidence grade, and the UI marks any rule our sources disagree on or that we couldn't confirm. The GM picks the house reading for the disputed ones before play. The details and sources are in [docs/SYSTEMS.md](docs/SYSTEMS.md).

- **Live play** is one JSON game state per table (`Game` in Prisma). It changes only through a pure reducer (`src/systems/tencandles/game.ts`) and is read only through a per-viewer projection: the GM sees everything, a player sees their own stack plus the cards they wrote and anything burned, and the TV sees only what's public. Dice are rolled on the server. Phones poll `/api/tables/<code>/game` every 2 s.
- **Candles on the screen** behave like real ones, for tables without real candles (or smoke detectors that object). Each candle gets a burn time when it's lit (2 to 3 hours by default, random within the range so they don't all go out together), shrinks on the TV as it burns, gutters in its last minutes and goes out when it's spent, which ends the scene like any candle going out. **Drafts** come at random (about once an hour by default): a candle sputters on the TV and the GM gets a prompt they can't miss (a dialog, a gust of sound, a buzz, a flashing tab title and, if allowed, a system notification) to decide whether it goes out. The GM page keeps the candles, so keep it open; both are set on the GM page under the candles, at any time, and "real candles" turns burning off.
- **Seat order** is clockwise from the GM's left. The GM sets it in the lobby; cards pass by it and truths go round it.
- **Last words.** Each phone records up to 45 s with MediaRecorder and keeps it in the browser's IndexedDB. It goes to the server (`Recording`, capped at 450 KB, one per player) **only if the GM ticks "keep recordings"**. Players hear only their own until the end, the GM hears all kept ones, and anyone can download their own. **Microphones need https or localhost:** phones joining a dev server by its plain-http LAN address get a written-message fallback instead.

## Daggerheart at the table

Built on the Daggerheart SRD 1.0 under the Darrington Press Community Gaming License. Every Daggerheart page carries the licence's notice, and all rules text is in our own words. A private table falls outside the licence's sharing rules, but a public site wouldn't (websites aren't a permitted format); see [docs/SYSTEMS.md](docs/SYSTEMS.md#daggerheart-daggerheart).

- **Duality dice from the sheet.** Tap a trait or a weapon's attack on the phone.
  - The server rolls the Hope and Fear d12s.
  - The tray adds advantage or disadvantage (±d6), Experiences (a Hope each) and reaction rolls.
  - The phone and the TV show both dice and "with Hope", "with Fear" or "Critical success!".
  - Damage rolls Proficiency dice.
- **Hope, Fear and harm.**
  - A roll with Hope gives the roller a Hope; with Fear, the GM a Fear; a critical gives a Hope and clears a Stress. These land on their own.
  - Players tap the slots on their sheet for Hit Points, Stress, Armor and Hope, or use the damage helper, which knows the thresholds and the Armor Slot.
  - The GM takes the opening Fear, spends it and corrects anyone's marks from the GM page.
  - It all runs on the table's event log as `tally` rows, so the TV, the phones and the GM page agree.
- **Adversaries** are GM-only stat blocks, with their attacks and damage rolled behind the screen.
- **No inspiration coins:** Hope does that job, on the sheet.

## Paranoia at the table

A play aid for Mongoose's 2023 PARANOIA Core Book; you need the book. There's no licence for Paranoia, so every rule is our own paraphrase, graded like the Ten Candles rules, and the GM picks house readings where sources disagree. See [docs/SYSTEMS.md](docs/SYSTEMS.md#paranoia-paranoia).

- **The naughty side stays secret.** No player page carries anyone's society, mutation or secret objectives. Each phone gets only its own Troubleshooter's.
- **NODE dice.** Tap a stat or a skill on the phone.
  - The server builds the pool from the sheet, gear and wounds, adds the Computer die, and lights it when the Computer notices you (more often the more Flags you have).
  - A negative pool rolls anti-dice.
- **The record.**
  - Players mark their wounds and Moxie, and decant their next clone when they die (six to a pack).
  - The GM raises Flags and hands out XP Points.
  - The TV shows each poster's clone, wounds and Flag, and announces each clone decanted.
- **Treason reports.** A player reports a teammate from the phone. Only the GM reads it, and can raise a Flag from it; the TV just says one was filed.
- **Friend Computer says.** The GM pushes the briefing, the mission's lines or anything typed. Every phone shows it with a chime, and the TV shows it across the top.

## Table play

- **Red-yarn board.** The job page shows who knows whom as cards joined by red string with the board-safe tie lines. Once posters are being claimed, unclaimed characters turn into grey NPC cards.
- **What changes tonight.** Each character's `ifUnclaimed` says how to run them as an NPC, which story beats move to whom (first listed character at the table wins), and what gets cut. The GM page works it out from the live claims (`src/lib/tonight.ts`).
- **Sealed letters.** One-shots declare `letters`, each addressed to one character and timed to an act. The GM delivers them from the GM page. They arrive on that player's sheet as a sealed envelope, and the player breaks the seal to read it. Story beats inherited from absent characters can be sent the same way. Text is resolved from content on the server and only ever sent to the holder of the recipient character (`/api/tables/<code>/letters`, `Delivery` in Prisma).
- **Session zero.** Each character has a `flashback` question. After claiming, the player answers it on their sheet, and the GM page collects the answers as a "previously on…" recap (`/api/tables/<code>/flashbacks`, `Flashback` in Prisma).
- **Woodcut portraits.** In Customize, upload any photo and it's turned into an ink-on-parchment engraving in the browser (`src/lib/woodcut.ts`). It's stored with the tweaks on that device and isn't included in share links.
- **The shared world.** The epilogue page downloads survivor records. Put the file in `content/legacy/` and survivors appear on the home board and as "also seen in town" cameos on other one-shots (`src/lib/legacy.ts`).

## Table toys (phase 6)

Everything here is system-aware through `src/systems/registry.ts` (each system's `dice`, `spotlight` beats and `coins`) and runs on one append-only **event log** per table: `TableEvent` in Prisma, `/api/tables/<code>/live` (polled every 2 s with a cursor), the pure rules and per-viewer projection in `src/lib/live.ts`, and `useLive` in the browser. People at a table know each other by an opaque handle; nobody but the server sees a browser id. No paid services: the dice are rolled on the server with crypto randomness, the sound is synthesised (`src/lib/sound/synth.ts`), and the phone uses Vibration, Wake Lock and DeviceMotion.

- **Phone dice, shared tray.** On a 5e sheet at a table, every number is a button: tap a check, save, skill, initiative, attack or damage to roll it, with advantage or disadvantage from the tray along the bottom, or shake the phone to roll the last one again (iOS asks for motion permission behind the "Shake to roll" button). The server rolls; the TV shows the dice tumbling and a roll log. The GM rolls from the GM page, behind the screen by default, and can hide any roll afterwards: then only the GM and the roller see it, and everyone else sees "a die rattles behind the screen". Ten Candles keeps its own d6 pool (phase 4's reducer); its phones get shake-to-roll, and each settled roll is mirrored into the log for the TV, the spotlight and the tapestry.
- **Notes under the table.** Fold a note to the GM or another player from the phone. Only the sender and the recipient read it (not even the GM, unless it's to or from them); the TV shows a folded note changing hands. Anyone can reply to a note sent to them.
- **The bell on every phone.** The GM picks a stinger (the one-shot's own or any preset) and rings it on every phone, or on one player's: each phone plays it and buzzes once. Phones tap "Let the bell ring here" once to unlock audio (and keep the screen awake); a reloaded phone doesn't ring old bells.
- **Act cards on the TV.** `acts` (title, subtitle, optional image) are GM-only until raised. The GM raises them in order; the TV draws the curtain, sets the title, then wipes in the image (or an engraved panel of the cast's icons), and keeps a small "Act II" chip after. In Ten Candles the candles drive them: acts follow the module's stages, with one more for the Last Stand, and each goes up by itself when a scene opens in its stage.
- **Spotlight tracker.** On the GM page, each person at the table gets the system's beats to tick (5e: stake, secret, ties, letters, flashback; Ten Candles: concept, Virtue, Vice, Moment, Brink, letters) and the minutes since their last moment (a roll, a note, a coin, a letter opened, a tick). After N minutes it nudges, suggesting an undelivered letter for them (one for the current act first) with a Deliver button.
- **Rumor mill.** `rumors` (text plus truth: true, false or half). Each player draws two from their phone after claiming (least-heard first); only the GM sees who heard what and which are true. Rumors never reach a player page; `toPublic` keeps only `hasRumors`.
- **Living town board.** The GM pins `notices` presets (new poster, reward changed, sighted, settled) or writes one on the night, stamps them SETTLED or takes them down. They show on the job page and the TV.
- **Inspiration coins.** A player tosses a brass coin to someone else (one per act by default); it flies across the TV from poster to poster and lands in their purse on the sheet. The GM grants any number. Under 2024 it's Heroic Inspiration (spend it to reroll from the tray), under 2014 Inspiration; `coins` in a 5e one-shot renames it, changes the tosses per act or turns it off. Ten Candles has none.
- **Print the whole box.** `/<oneshot>/box`: the flyer, every sheet, the cards, the tents, the sealed letters as fold-and-seal envelopes (addressed on the outside with the act to open them at), the act cards, rumor slips and a blank gazette; for Ten Candles, the table kit in place of the 5e printables. `pnpm e2e:toys` checks its page count on Letter and A4.
- **The night's tapestry.** Panels for each poster torn, letter opened, natural 20 and 1 (or candle darkened and death), act raised, the notes passed and the coins tossed, and the fates. It's built from the TV's view of the log, so hidden rolls and note texts never reach it.
- **The chronicle.** Epilogues are kept per table (`Epilogue` in Prisma), so `/chronicle` binds every night into one book with a chapter each: the broadsheet, the tapestry (with the GM's edits) and who survived (the shared world's records, or the night's own fates).

## Printables, levels, skins and reading modes

- **Cards.** Every spell, weapon, kept item (not plain packs) and feature gets a 2.5 × 3.4 in card, sleeve-sized, nine to a Letter or A4 page with crop marks. Each character starts on a fresh page so their stack can be handed over. Spell cards carry the casting time, range, components, duration and a paraphrased effect from `content/rules/spells.json`, plus the character's own attack line and DC. Weapon cards explain each property and 2024 mastery; ammunition and limited-use features get tick-boxes. The cards page sets its own 0.25 in margins with a named `@page`, so print at 100%.
- **Name tents.** Half a page each, folded along the middle. The top half prints upside down so that, stood up, the name and epithet face the table and AC, HP, initiative, saves and the top attacks face the player. A mystery character's tent and token show the board's alias.
- **Tokens.** `src/lib/token.ts` draws a 512 px round token in the browser: the woodcut portrait from Customize (or the poster icon on engraved hatching) inside a parchment ring with the name along the bottom. Download it from the sheet or the tents page and drop it into Foundry or Owlbear Rodeo. A linked portrait from a host that blocks canvas use falls back to the icon.
- **Level variants.** A one-shot can declare `variants` at other levels (The Drowned Bell plays at 3 or 5). Story, posters and ties are shared; each level has its own mechanics in `variants/<level>/<id>.json`. The level is picked on the job page or the GM page and remembered per browser (`tearoff:level:<slug>`). A `?level=N` in any link sets it, and the GM's join link, the TV's QR code and the flyer's QR codes carry it. Sheets, cards, tents, tokens, the D&D Beyond recipe and the Foundry export all use the chosen level. The Foundry table-sync API still serves the base level.
- **Skins.** `skin` in `oneshot.json` dresses the job page and its posters: `noticeboard` (the default cork board), `dossier` (case files paper-clipped on a desk blotter), `playbill` (a theatre bill and its company on red velvet) or `tarot` (gilt cards on a star cloth). The home page always stays the notice board. Preview any skin with `?skin=tarot` on a job page. The styles are in `src/components/board/Skins.module.css`, and the words each skin uses ("SIGN OUT THIS FILE", "TAKE THE PART"…) are in `src/lib/skins.ts`.
- **Reading modes.** The *Reading* button in the header of sheet pages toggles large print, high contrast and dyslexia-friendly type (Atkinson Hyperlegible, no italics, looser spacing). They combine and are remembered on the device (`tearoff:reading`), and apply to the sheet, print view, cards and tents. In large print each printed sheet face runs to two pages and cards print four to a page. High contrast and dyslexia mode keep each face on one page (`pnpm print-check` checks this).
- **Keyboard and screen readers.** Every page has a skip link, landmarks and a heading outline, and focus shows as a brass ring. Proficiency dots, use boxes and "always prepared" marks have text for screen readers, the level picker is a radio group (arrow keys), and the sealed secret is hidden from screen readers too until the seal is broken. `pnpm a11y-check` runs axe-core and a Tab walk over the board, job pages, a sheet, cards, tents and the GM page; it reports no violations and a visible ring at every focus stop.

## Tables (shared claims)

The GM opens a **table** on the GM page and gets a five-character code (no 0/O/1/I). Players type it on the job page with their name. After that, tearing a poster locks it for everyone at that table, and every board, sheet and the GM page poll the table every 3 seconds. Only whoever tore a poster, or the GM, can pin it back up.

- Storage: `prisma/schema.prisma`. A `Table` (code and one-shot) has many `Claim`s. The unique `(tableId, characterId)` key is the lock, so two players tearing at once can't both win.
- API: `POST /api/tables` (GM only) opens a table. `GET /api/tables/<code>` returns the table. `POST` or `DELETE /api/tables/<code>/claims` tears a poster or pins it back up.
- Players get no accounts. Each browser makes up a random player id (sent as `x-tearoff-player`) and remembers it with the player's name in localStorage. The API only tells each browser which claims are *its own*; it never sends other players' ids.
- Client: `useClaims` in `src/lib/storage.ts`. It polls when the browser has a table code for this one-shot. Without a code it uses localStorage only.
- Tables are never deleted yet; they're tiny.

`gmNotes` never reaches a player. Player pages are static and built from `toPublic()`, which strips it. The GM page uses `getServerSideProps`, which checks the role before reading content, so there's no static page or `_next/data` file for it. Because that page reads `content/` at request time, `next.config.mjs` adds the content to its file tracing (`outputFileTracingIncludes`).

Customizations are stored per browser (localStorage) and can be shared with a `#t=` link.

## The builder

`/admin` (GM password) is where one-shots are written now; nobody needs to hand-write JSON. It runs on your own machine and writes the same files the build reads, which you then commit.

- **The list.** Every one-shot with its system and whether it's on the board, a draft, or published with unpublished changes. **New one-shot** (pick the system, give a title), **Duplicate as template**, **Edit**, **Unpublish** (back to a draft), **Delete** (type the slug to confirm), **Import JSON** and **Export**.
- **The editor.** The one-shot's sections and the cast on the left (reorder with the arrows, add by name), the form in the middle, problems and a live preview on the right.
  - Shared sections: posting and premise, skin (and 5e level variants), table play (act cards, sealed letters with the act they open at, the rumor mill with each rumor's truth, town-board notices, 5e inspiration coins, soundboard presets with a play button, the broadsheet), GM notes. Per character: poster (with a 90-character counter on the hook and an icon picker), story and ties (pick who; the board-safe line has an 80-character counter and warns when it shares words with the secret), the session-zero flashback, and *if unclaimed* (heirs picked in order from the rest of the cast).
  - **5e mechanics with rules help:** ability scores with standard-array and point-buy helpers, class, subclass and level, live modifiers, saves, skills, passives, initiative and spell DC (`src/systems/dnd5e/derive.ts`), hit points from the fixed average (with an override), AC, the class table's spell slots and pact magic, spells picked from the spell book, and each attack's to-hit and damage. One tab per level when the one-shot has level variants.
  - **Ten Candles:** the module (intro, goal, Them, areas, stages with a ten-candle strip, the Last Stand), suggested truths, and optional pre-made concepts.
- **Checks as you type.** Every change runs the build's own checks (Zod plus `crossCheck`, the rules math, level variants and the spell book; `src/lib/oneShotCheck.ts`) and shows each problem on its field and in a list with jump links. Drafts may be invalid; **Publish** (the wax seal) needs zero problems, and the server checks again by loading the files exactly as `next build` does.
- **Preview.** The real poster, yarn-board and sheet components, as you type. "Job page preview", "Full page" and "Print view" open the real pages from the saved draft.
- **Autosave.** Drafts save a moment after you stop typing; leaving with unsaved changes asks first.
- **The spell book** (`/admin/spells`). Every entry in `content/rules/spells.json`: add, edit or delete one at a time, with the schema's checks as you type (a 20–300 character paraphrase, a counter on it) and an optional block for what differs under 2014 (or 2024), including "no upcasting". A spell the builder's picker doesn't know shows "Not in the spell book yet. Add it", which opens this page prefilled; reload the one-shot's page afterwards to pick it. A spell a one-shot still uses can't be deleted. The file is rewritten in name order with the builder's JSON layout.

**Where it writes.** Drafts are `content/drafts/<slug>/draft.json` (the whole one-shot in one file). Publishing writes `content/oneshots/<slug>/…` and removes the draft; only files whose JSON changed are rewritten, so a git diff shows just your edits. Every write goes to a temp file and is renamed into place, and slugs and ids are checked before they touch a path. A note lists the files changed since you last committed: **commit them yourself**; the builder never runs git.

**When it can write.** Only when the app runs on your machine: `pnpm dev` (`NODE_ENV=development`), or `TEAROFF_CONTENT_WRITE=1` for a local production build (`TEAROFF_CONTENT_WRITE=0` turns it off). On Vercel, or any production build without the flag, the builder is read-only and says why; the API refuses writes the same way.

A dev server keeps each page's list of paths for a moment, so right after publishing the builder knocks on the new job page once before it says so; another page of a brand-new one-shot can still 404 on the very first visit (reload). A production build has the new one-shot only after you commit, push and deploy.

The store behind it is an interface (`src/lib/store/`), so a database store can replace the files later without touching the builder; [docs/PLAN.md](docs/PLAN.md#migrating-to-a-database-store) has the plan.

## Writing a one-shot

The builder writes these files for you; this is what's in them.

```
content/oneshots/<slug>/oneshot.json
content/oneshots/<slug>/characters/<id>.json   # filename == id
```

Every `oneshot.json` says its `"system"`: `"dnd5e"`, `"tencandles"`, `"daggerheart"` or `"paranoia"`. The shared parts of the schema are in `src/lib/coreSchema.ts`, and each system's own are in `src/systems/<system>/schema.ts`.

A **Ten Candles** one-shot has a `module`, which is GM-only:

- `intro` to read aloud;
- `goal`;
- notes on `them`;
- `areas` with things to find;
- optional `stages` by candle count;
- `lastStand`.

Optional `suggestedTruths` are also GM-only. Its `characters/*.json` are optional pre-made concepts (`story`: `concept`, `look`, `namePrompts`, `carrying`, `stake`, `ties`), with MISSING / LAST SEEN posters. `content/oneshots/lights-out-at-marrowby` is the reference.

A **Daggerheart** one-shot has a `level` (1 for now) and GM-only `adversaries`. Its characters' `mech` follows `src/systems/daggerheart/schema.ts` and is checked against the SRD tables in `src/systems/daggerheart/srd.ts`: class, subclass, the trait spread, Evasion, HP, Stress, Armor, thresholds, Experiences, domain cards and weapons. Extras from a subclass, ancestry or shield go in `mech.bonuses` with a note. `content/oneshots/a-vow-before-dawn` is the reference.

A **Paranoia** one-shot has a `team`, public `objectives`, Friend Computer's `briefing` and `announcements` (GM-only), and `houseRules`. Each Troubleshooter has a public `mech` (clone name, service group, duty, skills by the draft, gear) and a `naughty` side: society, mutation, secret objectives, treasonous gear, favours. `toPublic` strips the naughty side.

For **5e**, the schema is `src/systems/dnd5e/schema.ts`; extra checks are in `crossCheck` in `src/systems/dnd5e/content.ts` (levels add up, ties point at real characters, ruleset-specific fields, customization options tag exactly one entry…) and `src/systems/dnd5e/rules.ts`. That file checks HP against the fixed-average rule (with Tough and dwarf bonuses), spell slots against the class tables (half casters by edition, multiclass caster levels), warlock pact slots, and that no spell is above the highest slot. `content/oneshots/the-drowned-bell` is the reference.

Optional extras in `oneshot.json`:
- `"skin": "dossier"`: see *Skins* above.
- `"acts"`, `"rumors"` and `"notices"`: see *Table toys* above. All three are GM-only until the GM raises, deals or pins them. A letter's optional `"act"` names the act it opens at.
- `"coins": { "enabled": true, "name": "…", "tossesPerAct": 1 }` (5e only): the inspiration coin at this table.
- `"homebrew": true` (5e only): for a cast that breaks the rules on purpose (a wedding one-shot, a custom class). The rules checks (levels add up, HP, spell slots, pact magic, two saves, ruleset-only fields, expertise) are skipped; the checks the pages need (ids, ties, letters, acts, options, the spell book) stay. The posting gets a HOMEBREW stamp and the sheets say "homebrew". Homebrew spells go in the spell book as usual.
- `"variants": [{ "level": 3, "note": "…" }]`: then write `content/oneshots/<slug>/variants/3/<id>.json` for **every** character, as `{ "id", "mech", "options"? }`. `mech` is the full mechanics at that level; `options` replaces the base options only when they'd be wrong at that level, and should keep the same option ids so saved tweaks carry over. Every level runs through the same checks, and the validator prints each level's key numbers.

Every spell a character can have, at any level and in any option, needs an entry in `content/rules/spells.json`, keyed by name. Each entry has level, school, casting time, range, components, duration, concentration and ritual, plus a paraphrased `text` and an optional `higher`. Base fields follow 2024; a `"2014"` block lists what differs under 2014 (an empty `higher` there means "no upcasting"). The build fails on a missing spell, so a new cast with new spells needs entries added here too; the builder's spell book (`/admin/spells`) does that for you.

Things that make a cast work:
- `premise` explains why exactly these people are together tonight.
- Every character has a `stake` in *this* adventure, a `secret` that makes for a great reveal without forcing PvP, and ties to at least one other character.
- Each tie has private `text` (on the player's own sheet) and an optional board-safe `public` line — **only `public` is shown on the shared board**, so keep secrets out of it.
- `poster.alias` (e.g. `"????"`) hides a mystery character's name on the board and flyer.
- `options` give players sanctioned swaps (a cantrip, a weapon, a trinket). A spell option can carry the `attack` line it produces.
- Feature text is a short paraphrase, never book text.

HP and AC are authored; modifiers, saves, skills, passive scores, initiative, spell DC and attack lines are derived (`src/systems/dnd5e/derive.ts`).

## Foundry

The export (`src/systems/dnd5e/export/foundry.ts`) is a **beta "lite" actor**: abilities, save/skill proficiencies, HP and AC overrides, spell slots, plus features, weapons and spells as plain items. Import it via right-click on an actor → *Import Data*.

To graduate to full compendium items with working advancement, we need, from your own Foundry:
1. Your Foundry and dnd5e system versions.
2. One fully built **2014** character and one fully built **2024** character, exported via *Export Data*, saved to `data/foundry/reference/`.
3. One run of `tools/foundry/harvest-items.js` as a Script macro; commit the downloaded `tearoff-harvest.json` to `data/foundry/`.

The first thing to compare is each class item's `advancement` array: dnd5e 4.x/5.x derives HP and features from it.

### Table sync module

`tools/foundry/tearoff-sync/` is a Foundry module (v12/v13, dnd5e) that shows the Oddjobs board for a table inside Foundry. When a player tears a poster, it gives the matching Foundry user ownership of the imported actor (matched on `flags.tearoff`) and a private journal with their secret. It talks to `GET /api/foundry/tables/<code>` with `Authorization: Bearer $FOUNDRY_TOKEN`. That route skips the site cookie, returns CORS headers, and only includes secrets for claimed characters. See the module's README. It hasn't been run in a real Foundry yet.

## D&D Beyond

D&D Beyond has no import API, so each sheet offers a **build recipe** (`src/systems/dnd5e/export/ddb.ts`): the builder's own steps in order, with final ability scores entered as overrides and a "check it matches" line at the end.

## Deploy

GitHub (private repo — gated content may include non-SRD material) → Vercel. Set these in the Vercel project:

- `APP_PASSWORD`, `GM_PASSWORD` and `AUTH_SECRET`.
- Optional: `FOUNDRY_TOKEN` (Foundry table sync).
- Don't set `TEAROFF_CONTENT_WRITE` there: the deployed builder is read-only (Vercel's disk is too, and the store refuses to write whenever `VERCEL` is set).
- `DATABASE_URL` (Supabase pooler, port 6543, `?pgbouncer=true&schema=tearoff`) and `DIRECT_URL` (port 5432, `?schema=tearoff`). It's the same Supabase project as world-gazetteer, in its own Postgres schema. `prisma migrate deploy` needs `DIRECT_URL`.

`vercel-build` runs `prisma migrate deploy`, then `prisma generate`, then validation, then `next build`.

See `docs/PLAN.md` for the roadmap and the wow-feature list.
