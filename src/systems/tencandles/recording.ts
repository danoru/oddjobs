import { z } from "zod";

/**
 * Final recordings. Each phone records with MediaRecorder and keeps the clip
 * on the device; it only reaches the server when the GM chose to keep
 * recordings at this table, and then as one small clip per player.
 */

/** Longest clip a phone records, in seconds. */
export const MAX_SECONDS = 45;
/** Biggest clip the server keeps (45 s of Opus at 64 kbps is ~360 KB). */
export const MAX_AUDIO_BYTES = 450 * 1024;
export const MAX_TEXT = 600;

export const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"] as const;

export const uploadBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("audio"),
    /** e.g. "audio/webm;codecs=opus"; the base type must be one we play back. */
    mime: z
      .string()
      .max(60)
      .refine((m) => (AUDIO_TYPES as readonly string[]).includes(m.split(";")[0].trim()), "unsupported audio type"),
    /** Base64 of the clip. */
    data: z.string().max(Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 8),
  }),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(MAX_TEXT) }),
]);
export type UploadBody = z.infer<typeof uploadBody>;

/** What a phone or the GM sees about the kept recordings. */
export type RecordingInfo = {
  seat: number;
  kind: "audio" | "text";
  mime: string;
  size: number;
  /** The written message, when it's text and this viewer may read it. */
  text?: string;
};
