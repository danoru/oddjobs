import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PublicAnyOneShot } from "@/lib/public";
import { posterTag, SYSTEMS } from "@/systems/registry";
import f from "./Flyer.module.css";

/**
 * The physical version of the board: a flyer with one tear-off strip per
 * character, each with a QR code to that character's page. `os` is at the
 * chosen level; `base` is as written (strips off the written level carry it).
 */
export function FlyerSheet({ os, level, base, id }: { os: PublicAnyOneShot; level: number; base: PublicAnyOneShot; id?: string }) {
  const [qrs, setQrs] = useState<Record<string, string>>({});

  // QR targets depend on where the site is deployed, so build them in the browser.
  useEffect(() => {
    let alive = true;
    Promise.all(
      os.cast.map(async (c) => {
        // Off the written level, the strip carries the level so the sheet opens at it.
        const url = `${window.location.origin}/${os.slug}/${c.id}${base.system !== "dnd5e" || level === base.level ? "" : `?level=${level}`}`;
        const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1b1209", light: "#0000" } });
        return [c.id, svg] as const;
      }),
    ).then((pairs) => alive && setQrs(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [os, level, base]);

  return (
    <article className={f.flyer} id={id}>
      <div className={f.header}>{os.posting.header}</div>
      <h1 className={f.title}>{os.title}</h1>
      <p className={f.premise}>{os.premise}</p>
      <div className={f.details}>
        {"level" in os && <span>Level {os.level}</span>}
        <span>
          {os.players.min}–{os.players.max} players
        </span>
        <span>About {os.durationHrs} hours</span>
        <span>{os.system === "dnd5e" ? `${os.ruleset} rules` : SYSTEMS[os.system].label}</span>
      </div>
      <p className={f.reward}>Reward: {os.posting.reward}</p>
      <div className={f.instructions}>Tear one off. Scan it. That&apos;s you.</div>
      <div className={f.strips}>
        {os.cast.map((c, i) => (
          <div key={c.id} className={f.strip}>
            {i === 0 && (
              <span className={f.scissors} aria-hidden="true">
                ✂
              </span>
            )}
            <div className={f.stripText}>
              <span className={f.stripName}>{c.poster.alias ?? c.name}</span>
              <span className={f.stripEpithet}>{c.poster.epithet}</span>
              <span className={f.stripClass}>{posterTag(c)}</span>
            </div>
            <div
              className={f.qr}
              role="img"
              aria-label={`QR code for ${c.poster.alias ?? c.name}`}
              // SVG markup generated locally by the qrcode library.
              dangerouslySetInnerHTML={{ __html: qrs[c.id] ?? "" }}
            />
          </div>
        ))}
      </div>
    </article>
  );
}
