import type { OneShotWithCast, SystemId } from "./schema";

/**
 * What the public landing page (`/`) may show of the one-shots: our own
 * original 5e and Ten Candles casts only (Daggerheart and Paranoia stay
 * behind the door, for licensing), and of those only the posting and the
 * poster lines. It's an allowlist: each field is copied by name, so a new
 * field in a one-shot (a secret, GM notes, letters, if-unclaimed notes) can
 * never reach the page, or its `_next/data` JSON, by accident.
 */

export const LANDING_SYSTEMS: readonly SystemId[] = ["dnd5e", "tencandles"];

/** How many one-shots, and posters from each, the strip shows. */
const MAX_JOBS = 6;
const POSTERS_PER_JOB = 3;

export interface LandingPoster {
  header: string;
  /** The board's alias when there is one (a mystery character), else the name. */
  name: string;
  epithet: string;
  hook: string;
  icon: string;
}

export interface LandingJob {
  title: string;
  system: "dnd5e" | "tencandles";
  pitch: string;
  postingHeader: string;
  players: { min: number; max: number };
  durationHrs: number;
  posters: LandingPoster[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function toLandingJob(os: OneShotWithCast): LandingJob | null {
  if (!LANDING_SYSTEMS.includes(os.system)) return null;
  return {
    title: str(os.title),
    system: os.system as LandingJob["system"],
    pitch: str(os.pitch),
    postingHeader: str(os.posting?.header),
    players: { min: Number(os.players?.min) || 0, max: Number(os.players?.max) || 0 },
    durationHrs: Number(os.durationHrs) || 0,
    posters: [...os.cast]
      .sort((a, b) => a.order - b.order)
      .slice(0, POSTERS_PER_JOB)
      .map((c) => ({
        header: str(c.poster.header),
        name: str(c.poster.alias) || str(c.name),
        epithet: str(c.poster.epithet),
        hook: str(c.poster.hook),
        icon: str(c.poster.icon),
      })),
  };
}

export function toLanding(oneshots: OneShotWithCast[]): LandingJob[] {
  return oneshots
    .map(toLandingJob)
    .filter((j): j is LandingJob => j !== null)
    .slice(0, MAX_JOBS);
}
