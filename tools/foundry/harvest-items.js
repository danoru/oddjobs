/**
 * Oddjobs — Foundry harvest macro.
 *
 * Run once in your own Foundry world (dnd5e system) as a Script macro.
 * It dumps two things the Oddjobs exporter needs to graduate from "lite" to
 * full compendium items:
 *
 *   1. Every Item in the compendiums listed below (classes, subclasses,
 *      species, backgrounds, feats, spells, equipment), as plain JSON.
 *   2. Version info: Foundry core + dnd5e system version.
 *
 * It downloads a single file, tearoff-harvest.json. Commit it to
 * data/foundry/ in the Oddjobs repo. Nothing in your world is changed.
 *
 * Also export one fully built character per ruleset you use
 * (right-click actor → Export Data) and put those in data/foundry/reference/.
 */
(async () => {
  // Compendiums to read. Add your own (e.g. purchased content) by pack id.
  const PACKS = [
    "dnd5e.classes",
    "dnd5e.subclasses",
    "dnd5e.races",
    "dnd5e.backgrounds",
    "dnd5e.classfeatures",
    "dnd5e.feats",
    "dnd5e.spells",
    "dnd5e.items",
    // 2024 rules content ships in its own module packs when installed:
    "dnd-players-handbook.classes",
    "dnd-players-handbook.origins",
    "dnd-players-handbook.feats",
    "dnd-players-handbook.spells",
    "dnd-players-handbook.equipment",
  ];

  const out = {
    harvestedAt: new Date().toISOString(),
    core: game.version,
    system: { id: game.system.id, version: game.system.version },
    packs: {},
  };

  for (const id of PACKS) {
    const pack = game.packs.get(id);
    if (!pack) {
      console.log(`Oddjobs harvest: pack ${id} not found, skipping`);
      continue;
    }
    const docs = await pack.getDocuments();
    out.packs[id] = docs.map((d) => ({ uuid: d.uuid, ...d.toObject() }));
    ui.notifications.info(`Oddjobs: read ${docs.length} items from ${id}`);
  }

  const json = JSON.stringify(out);
  saveDataToFile(json, "application/json", "tearoff-harvest.json");
  ui.notifications.info("Oddjobs: harvest downloaded. Commit it to data/foundry/.");
})();
