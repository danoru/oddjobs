import { z } from "zod";
import { FATES } from "./legacy";

/**
 * The morning after as it's stored per table (`Epilogue` in Prisma), so the
 * chronicle can bind every night: the broadsheet, and the GM's edits to the
 * night's tapestry. The epilogue page and the API share these.
 */

export const epilogueEntrySchema = z.object({
  fate: z.enum(FATES).optional(),
  line: z.string().max(280).optional(),
  title: z.string().max(60).optional(),
  scar: z.string().max(140).optional(),
  playedBy: z.string().max(60).optional(),
  /** The secret came out at the table (the GM says so): its player's own history may show it. */
  revealed: z.boolean().optional(),
});

export const epilogueSchema = z.object({
  headline: z.string().max(120),
  subhead: z.string().max(200),
  lead: z.string().max(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.record(z.string().regex(/^[a-z0-9-]+$/), epilogueEntrySchema),
});

/** What the GM did to the tapestry: panels dropped, panels renamed. */
export const tapestryEditsSchema = z.object({
  dropped: z.array(z.string().max(80)).max(200).default([]),
  titles: z.record(z.string().max(80), z.string().trim().min(1).max(80)).default({}),
});

export type TapestryEdits = z.infer<typeof tapestryEditsSchema>;
export const noEdits = (): TapestryEdits => ({ dropped: [], titles: {} });

/** A player may write only their own character's line and byline. */
export const playerEntryBody = z.object({
  characterId: z.string().regex(/^[a-z0-9-]+$/),
  entry: epilogueEntrySchema.pick({ line: true, playedBy: true }),
});

/** Anything worth binding into the chronicle? */
export const hasContent = (ep: z.infer<typeof epilogueSchema>) =>
  Boolean(ep.headline || ep.lead || Object.values(ep.entries).some((e) => e.fate || e.line));
