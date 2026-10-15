import fs from "node:fs";
import path from "node:path";
import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requestRole } from "@/lib/auth";
import { draftSchema, draftToContent, type DraftRequest } from "@/lib/draft";

/**
 * POST — GM only. Draft a whole one-shot cast from a pitch with Claude, then
 * convert and validate it exactly as the build would. One repair round if the
 * first draft breaks a rule. Returns the content plus any remaining problems;
 * nothing is saved — the GM downloads the bundle and imports it into git.
 */

export const config = { maxDuration: 300 };

const MODEL = "claude-opus-5-5";

const body = z.object({
  pitch: z.string().trim().min(10).max(1200),
  ruleset: z.enum(["2014", "2024"]),
  level: z.number().int().min(1).max(20),
  players: z.object({ min: z.number().int().min(1).max(8), max: z.number().int().min(1).max(8) }),
  castSize: z.number().int().min(3).max(7),
  tone: z.string().max(200).default(""),
  setting: z.string().max(300).default(""),
});

// The reference cast shows the house style; read once per server instance.
let reference: string | null = null;
function referenceContent(): string {
  if (reference) return reference;
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "oneshots", "the-drowned-bell");
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  reference = [
    "<reference_oneshot>",
    read("oneshot.json"),
    "</reference_oneshot>",
    "<reference_character>",
    read("characters/rook.json"),
    "</reference_character>",
  ].join("\n");
  return reference;
}

const SYSTEM = `You design casts for D&D 5e one-shots on Tear-Off, a site of ready-made pregenerated characters shown as posters on a tavern notice board.

The site exists because random character generators produce characters disconnected from the story. A Tear-Off cast is the opposite:
- The premise explains why exactly these people are together tonight.
- Every character has a stake in this specific adventure, a secret that makes for a great reveal or divided loyalty without forcing player-vs-player conflict, and ties to at least two other cast members that interlock (A owes B, B suspects C).
- Tie "text" is private to that player and may touch secrets; tie "public" is a board-safe line everyone sees and must reveal nothing secret.
- Sealed letters are mid-session handouts to one character each, timed to the act outline, 60-120 words, in-world, deepening or twisting that character's secret.
- ifUnclaimed tells the GM how to run each character as an NPC if nobody plays them, which story beats move to whom (ordered fallbacks), and what gets cut.
- The poster hook is one line in notice-board voice, 90 characters at most. Vary poster headers, icons and party roles so any three core roles make a working party.

Mechanics must be exactly right for the requested ruleset and level: legal ability scores (standard array or point buy plus the correct ability score increases for the ruleset), hit points from the class hit die and Constitution, armor class from the actual armor, saves from the first class, correct skill counts, every class and subclass feature for the level and nothing higher, correct use counts, spell slots and prepared or known counts, cantrip scaling, weapon masteries only for 2024 classes that get them. For 2014 leave originFeat empty and weaponMasteries empty. Total class levels must equal the one-shot level. Feature text is a short paraphrase in your own words, never book text. Use ids in lowercase-kebab-case, and make every tie, letter, coreRole and reassignment point at a character id in the cast.

The reference one-shot and character below show the house style and quality bar; match their voice, not their content.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if ((await requestRole(req)) !== "gm") return res.status(403).json({ error: "Only the GM can draft casts" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Set ANTHROPIC_API_KEY on the server to draft casts." });
  }
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Give a pitch (10+ characters) and sensible numbers." });
  const r: DraftRequest = parsed.data;
  if (r.players.min > r.players.max || r.castSize < r.players.min) {
    return res.status(400).json({ error: "Check the player counts and cast size." });
  }

  const client = new Anthropic();
  const ask = [
    `Pitch: ${r.pitch}`,
    `Ruleset: ${r.ruleset} rules`,
    `Level: ${r.level}`,
    `Players: ${r.players.min}-${r.players.max}; write exactly ${r.castSize} characters; coreRoles must be at most ${r.players.min} ids.`,
    r.tone ? `Tone: ${r.tone}` : "",
    r.setting ? `Setting: ${r.setting}` : "Setting: setting-agnostic, easy to drop into any campaign.",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: zodOutputFormat(draftSchema) },
        system: [
          { type: "text", text: SYSTEM },
          { type: "text", text: referenceContent(), cache_control: { type: "ephemeral" } },
        ],
        messages,
      });
      const msg = await stream.finalMessage();

      if (msg.stop_reason === "refusal") {
        return res.status(422).json({ error: "Claude declined this pitch. Try rewording it." });
      }
      if (msg.stop_reason === "max_tokens") {
        return res.status(422).json({ error: "The draft ran too long. Try a smaller cast." });
      }
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      let draft;
      try {
        draft = draftSchema.parse(JSON.parse(text));
      } catch {
        return res.status(502).json({ error: "Claude's draft wasn't valid JSON. Try again." });
      }
      const out = draftToContent(draft, r);
      if (out.errors.length === 0 || attempt === 1) {
        return res.status(200).json({ ...out, model: msg.model });
      }
      // One repair round: show Claude what the validator rejected.
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: `The site's validator rejected this draft:\n${out.errors.map((e) => `- ${e}`).join("\n")}\n\nReturn the complete corrected draft, fixing every problem and changing nothing else.`,
      });
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "The ANTHROPIC_API_KEY on the server was rejected." });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Claude is busy. Try again in a minute." });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${e.status ?? ""}. Try again.` });
    throw e;
  }
  return res.status(500).json({ error: "Unexpected draft state" });
}
