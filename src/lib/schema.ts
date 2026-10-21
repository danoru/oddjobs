import { z } from "zod";
import * as dnd5e from "@/systems/dnd5e/schema";
import * as tencandles from "@/systems/tencandles/schema";
import * as daggerheart from "@/systems/daggerheart/schema";
import * as paranoia from "@/systems/paranoia/schema";

/**
 * A one-shot is a union on `system`. Shared code reads the core fields
 * (src/lib/coreSchema.ts); anything system-specific narrows on `os.system`
 * first. Character files don't carry `system`: the loader parses them with
 * the schema of the one-shot they belong to.
 */

export * from "./coreSchema";

export const SYSTEM_IDS = ["dnd5e", "tencandles", "daggerheart", "paranoia"] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

export const oneShotSchema = z.discriminatedUnion("system", [dnd5e.oneShotSchema, tencandles.oneShotSchema, daggerheart.oneShotSchema, paranoia.oneShotSchema]);

export type OneShot = z.infer<typeof oneShotSchema>;
export type OneShotWithCast = dnd5e.OneShotWithCast | tencandles.OneShotWithCast | daggerheart.OneShotWithCast | paranoia.OneShotWithCast;
export type AnyCharacter = OneShotWithCast["cast"][number];
