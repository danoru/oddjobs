import { useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/live";
import type { PublicPaCharacter } from "@/lib/public";
import type { HouseRules } from "@/systems/paranoia/schema";
import { cloneName } from "@/systems/paranoia/derive";
import { CLONES, WOUND_NAMES, treasonNames } from "@/systems/paranoia/rules";
import type { PMarks, PTallyData } from "@/systems/paranoia/live";
import p from "./Pa.module.css";

/**
 * Paranoia on the TV, over the poster board: Friend Computer's latest words
 * across the top (large while they're new), a folded treason report when one
 * is filed (never who or what), and a clone decanted when one dies. It reads
 * the TV's own view of the log, so nothing the table may not see gets here.
 */
export function PaTvOverlay({ events, baseline, cast }: { events: LiveEvent[]; baseline: number | null; cast: readonly PublicPaCharacter[] }) {
  const last = [...events].reverse().find((e) => e.kind === "computer");
  const fresh = (e: LiveEvent) => baseline !== null && e.id > baseline;
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  // A new line has the middle of the screen for a while, then shrinks to a corner strip.
  const [quiet, setQuiet] = useState<number | null>(null);
  const loudId = last && fresh(last) && quiet !== last.id ? last.id : null;
  useEffect(() => {
    if (loudId === null) return;
    const timer = window.setTimeout(() => setQuiet(loudId), 12000);
    return () => window.clearTimeout(timer);
  }, [loudId]);
  const played = useRef(0);
  useEffect(() => {
    if (baseline === null) return;
    const news = events.filter((e) => e.id > Math.max(baseline, played.current));
    if (!news.length) return;
    played.current = Math.max(...news.map((e) => e.id));
    const report = news.filter((e) => e.kind === "accuse").at(-1);
    const clone = news.filter((e) => e.kind === "tally" && (e.data as PTallyData).track === "clone" && (e.data as PTallyData).delta > 0).at(-1);
    if (clone) {
      const d = clone.data as PTallyData;
      const c = cast.find((x) => x.id === d.characterId);
      const n = events.filter((e) => e.kind === "tally" && e.id <= clone.id && (e.data as PTallyData).characterId === d.characterId && (e.data as PTallyData).track === "clone").reduce((sum, e) => sum + (e.data as PTallyData).delta, c?.mech.clone.number ?? 1);
      setFlash({ id: clone.id, text: c ? (n > CLONES ? `${c.name} is out of clones. Friend Computer regrets nothing.` : `${cloneName(c.mech, n)} has been decanted. Welcome back, citizen.`) : "A clone has been decanted." });
    } else if (report) setFlash({ id: report.id, text: "A treason report has been filed. Friend Computer thanks the anonymous citizen." });
  }, [events, baseline, cast]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <>
      {last && (
        <div
          className={p.computer}
          role="status"
          aria-live="polite"
          data-testid="tv-computer"
          data-loud={loudId === last.id}
          style={
            loudId === last.id
              ? { position: "fixed", left: "50%", top: "32%", transform: "translateX(-50%)", width: "min(90vw, 1100px)", zIndex: 30, fontSize: "clamp(20px, 2.6vw, 42px)" }
              : { position: "fixed", right: 24, bottom: 60, width: "min(40vw, 520px)", zIndex: 30, fontSize: "clamp(12px, 1.1vw, 17px)" }
          }
        >
          <div className={p.computerHead}>FRIEND COMPUTER SAYS</div>
          <div className={p.computerText}>{(last.data as { text: string }).text}</div>
        </div>
      )}
      {flash && (
        <div key={flash.id} className={p.computer} role="status" data-testid="tv-flash" style={{ position: "fixed", right: 24, top: 24, maxWidth: 460, zIndex: 31 }}>
          {flash.text}
        </div>
      )}
    </>
  );
}

/** Under a claimed Troubleshooter's poster: clone, wounds and Flags. */
export function PaPosterRecord({ c, marks, h }: { c: PublicPaCharacter; marks: PMarks; h: HouseRules }) {
  return (
    <div
      data-testid={`tv-record-${c.id}`}
      data-treason={marks.treason}
      data-clone={marks.clone}
      style={{ fontFamily: "var(--font-typewriter)", fontSize: "clamp(11px, 0.95vw, 15px)", textAlign: "center", marginTop: 4 }}
    >
      <div>{marks.clone > CLONES ? "OUT OF CLONES" : cloneName(c.mech, marks.clone)}</div>
      <div>
        {WOUND_NAMES[marks.wounds]} · <b style={{ color: marks.treason ? "var(--wax)" : undefined }}>{treasonNames(h)[marks.treason]}</b>
      </div>
    </div>
  );
}
