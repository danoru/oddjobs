import type { Claim, Delivery, Epilogue as EpilogueRow, Table, TableEvent } from "@prisma/client";
import type { OneShotWithCast } from "./schema";
import { viewEvents } from "./live";
import { peopleAt, toLiveRow } from "./tables.server";
import { buildTapestry, stripNoteText, type Panel } from "./tapestry";
import { epilogueSchema, noEdits, tapestryEditsSchema, type TapestryEdits } from "./epilogueSchema";
import type { Epilogue } from "@/components/gazette/Gazette";

export type TableWithNight = Table & { claims: Claim[]; deliveries: Delivery[]; events: TableEvent[]; epilogue: EpilogueRow | null; game?: { state: unknown } | null };

/** Include this in a Prisma table query to get everything a night's tapestry needs. */
export const NIGHT_INCLUDE = {
  claims: true,
  deliveries: true,
  events: { orderBy: { id: "asc" } },
  epilogue: true,
  game: true,
} as const;

/** A table's epilogue and tapestry: panels from what the table saw (the TV's view), and the GM's edits. */
export function nightOf(table: TableWithNight, os: OneShotWithCast): { panels: Panel[]; edits: TapestryEdits; epilogue: Epilogue | null } {
  const people = peopleAt(table, os);
  const events = stripNoteText(viewEvents(table.events.map(toLiveRow), { role: "table" }, { people, rumors: [] }));
  const ep = epilogueSchema.safeParse(table.epilogue?.data);
  const edits = tapestryEditsSchema.safeParse(table.epilogue?.tapestry);
  const epilogue = ep.success ? ep.data : null;
  const panels = buildTapestry({
    cast: os.cast.map((c) => ({ id: c.id, name: c.name })),
    claims: table.claims.map((c) => ({ characterId: c.characterId, name: c.playerName, claimedAt: c.claimedAt.toISOString() })),
    letters: table.deliveries.map((d) => ({ id: d.letterId, to: d.characterId, openedAt: d.openedAt?.toISOString() ?? null })),
    events,
    epilogue,
  });
  return { panels, edits: edits.success ? edits.data : noEdits(), epilogue };
}
