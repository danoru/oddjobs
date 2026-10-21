import { MODULE_ID, restart, start } from "./sync.js";
import { openBoard } from "./board.js";

/**
 * Oddjobs Table Sync: entry point. Registers the settings and the scene
 * control button, and starts the poller on the GM's client.
 */

Hooks.once("init", () => {
  // World settings are only editable by a GM. The token is different: Foundry
  // sends world settings to every connected browser, so it lives in the GM's
  // own browser (client scope) and players never receive it. Only the GM's
  // client polls, so that's the only place it's needed.
  const onChange = () => {
    if (game.ready && game.user.isGM) restart();
  };

  game.settings.register(MODULE_ID, "siteUrl", {
    name: "Oddjobs site URL",
    hint: "Where Oddjobs is hosted, e.g. https://oddjobs.example.com (no trailing path).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange,
  });
  game.settings.register(MODULE_ID, "token", {
    name: "Foundry token",
    hint: "Must match FOUNDRY_TOKEN on the Oddjobs server. Stored only in this browser, so each GM device enters it once.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    onChange,
  });
  game.settings.register(MODULE_ID, "tableCode", {
    name: "Table code",
    hint: "The five-character code on the GM page. Clear it to stop syncing.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange,
  });
  game.settings.register(MODULE_ID, "autoAssign", {
    name: "Auto-assign torn characters",
    hint: "Give each player ownership of the actor they tore, and a private journal with its secret. Off: the board still updates and you assign by hand.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange,
  });
});

/**
 * Scene control button. The hook's argument changed shape between versions:
 * v12 passes an array of controls with `tools` arrays; v13 passes an object
 * keyed by control name with `tools` objects. ASSUMPTION: the token controls
 * are named "token" (v12) / "tokens" (v13).
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tool = {
    name: "tearoff",
    title: "Oddjobs board",
    icon: "fa-solid fa-scroll",
    button: true,
    order: 100,
    visible: true,
    onClick: () => openBoard(), // v12
    onChange: () => openBoard(), // v13
  };
  if (Array.isArray(controls)) {
    controls.find((c) => c.name === "token")?.tools.push(tool);
  } else {
    const group = controls.tokens ?? controls.token;
    if (group) group.tools.tearoff = tool;
  }
});

Hooks.once("ready", () => {
  // Also reachable from a macro: game.modules.get("tearoff-sync").api.openBoard()
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { openBoard };
  if (game.user.isGM) start();
});
