# Tear-Off Table Sync (Foundry module)

Shows the Tear-Off board for your table inside Foundry. When a player tears a poster on the site, the module gives that player ownership of the matching actor and a private "Secret: <name>" journal.

Foundry v12 minimum, verified on v13, dnd5e system. GM client only; players need nothing installed.

## Install

1. Copy this whole folder (`tearoff-sync`) into your Foundry **Data/modules** folder, so you have `Data/modules/tearoff-sync/module.json`.
2. Restart Foundry (or reload the setup screen), open your world, and enable **Tear-Off Table Sync** under Manage Modules.
   (A manifest URL for one-click install can come later.)
3. On the Tear-Off server set `FOUNDRY_TOKEN` to a long random string (see `.env.example`) and redeploy. Without it the API answers 503.
4. In Foundry: Game Settings, Configure Settings, Tear-Off Table Sync:
   - **Tear-Off site URL**: e.g. `https://tearoff.example.com`
   - **Foundry token**: the same string as `FOUNDRY_TOKEN`. This one is stored only in the GM's browser, so enter it once on each device you GM from.
   - **Table code**: the five-character code from the GM page (clear it to stop syncing)
   - **Auto-assign torn characters**: on by default

## Use

- Import each character's actor from its sheet page (Foundry export, then right-click an actor, Import Data). The export carries `flags.tearoff.oneshot` and `flags.tearoff.character`; that is how the module finds the actor for a poster.
- Make a Foundry user for each player whose name matches the name they type when tearing a poster (case and extra spaces don't matter).
- Open the board from the scroll button in the Token scene controls (left toolbar), or from a macro: `game.modules.get("tearoff-sync").api.openBoard()`.

## What it does

Every 5 seconds, on the GM's client, while a table code is set:

1. Fetches `GET <site>/api/foundry/tables/<code>` with `Authorization: Bearer <token>`.
2. For each claimed poster, finds the world actor with matching `flags.tearoff.character` and `flags.tearoff.oneshot`, and the Foundry user whose name matches the claiming player.
3. If both exist and auto-assign is on: gives that user OWNER on the actor, sets it as their character if they have none, and creates or updates a journal "Secret: <name>" that only that user (OBSERVER) and GMs can read.
4. Whispers the GM on each new assignment. Warns once if a name or actor can't be matched ("Maya tore Rook but there's no Foundry user called Maya").

Everything is idempotent: nothing is updated if it already matches. If the poster changes hands, the previous player loses access to the secret journal. The module never removes actor ownership; revoke that by hand.

With auto-assign off the board still updates and shows an **Assign** button per claimed poster.

If two GMs are logged in, only one (Foundry's active GM) writes.

## Network errors

If the site can't be reached or the token is wrong, you get one warning notification per distinct problem, then it keeps polling quietly. The board shows the current problem.

## Security note

The token only allows reading table boards, and a poster's secret appears in the API only once it's claimed. It's stored as a client setting in the GM's browser, so players' browsers never receive it (Foundry sends world settings to everyone). Still use a long random value you can rotate.

## Not covered

- Creating actors: import them yourself from the site.
- Two torn posters for one player: the second is owned but doesn't replace their existing character.
- Players that tear posters under a different name than their Foundry user name are reported as unmatched; fix either name and the next poll picks it up.
