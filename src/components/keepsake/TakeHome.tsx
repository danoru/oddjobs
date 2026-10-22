import type { PublicAnyOneShot } from "@/lib/public";
import type { Epilogue } from "@/components/gazette/Gazette";
import { takeHome } from "@/lib/keepsakes";
import { KeepsakeArt, damageOf } from "./KeepsakeArt";
import s from "./Keepsake.module.css";

/**
 * The morning after's quiet strip: what the GM and each character who was
 * played take home (phase 13). Just the objects, no fanfare. They land in
 * each account's cabinet once the game is finished; a guest's waits until
 * their seat becomes an account.
 */
export function TakeHomeStrip({ os, ep }: { os: PublicAnyOneShot; ep: Epilogue }) {
  const items = takeHome(os, ep.entries);
  return (
    <section className={`${s.strip} no-print`} aria-labelledby="take-home" style={{ ["--keepsake-paper" as string]: "#1c140e" }}>
      <h2 id="take-home" className={s.stripTitle}>
        What everyone takes home
      </h2>
      <ul className={s.stripList}>
        {items.map((t) => (
          <li key={t.id} className={s.stripItem}>
            <KeepsakeArt art={t.keepsake.art} fallen={t.fallen} size={44} />
            <span>
              <span className={s.stripWho}>{t.who}</span>
              <span className={s.stripName}>
                {t.keepsake.name}
                {t.fallen ? `, ${damageOf(t.keepsake.art)}` : ""}
              </span>
              <span className={s.stripNote}>{t.keepsake.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
