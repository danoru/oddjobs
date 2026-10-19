import type { CoreCharacter as Character } from "@/lib/schema";
import { planTonight } from "@/lib/tonight";
import s from "@/components/board/Board.module.css";

/**
 * The GM's "what changes tonight" card. `present` is who's at the table —
 * usually the claimed posters. GM-only: it reads `ifUnclaimed`.
 */
export function TonightCard({ cast, present }: { cast: Character[]; present: string[] }) {
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const plan = planTonight(cast, present);
  const text = { fontFamily: "var(--font-print)", fontSize: 15, lineHeight: 1.4 } as const;
  const tag = (bg: string, fg: string) =>
    ({
      fontFamily: "var(--font-label)",
      fontSize: 12,
      letterSpacing: "0.06em",
      padding: "1px 7px",
      background: bg,
      color: fg,
      whiteSpace: "nowrap",
      alignSelf: "start",
    }) as const;

  return (
    <div className={s.note} style={{ ["--tilt" as string]: "0.5deg" }}>
      <span className={s.pin} aria-hidden="true" />
      <p className={s.noteTitle}>What changes tonight</p>
      {present.length === 0 ? (
        <p style={text}>Once posters are torn down, this shows who becomes an NPC and which story beats move.</p>
      ) : plan.npcs.length === 0 ? (
        <p style={text}>Full cast tonight. Nothing changes.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 10px", ...text }}>
          {plan.npcs.map((n) => (
            <Row key={`npc-${n.id}`} tag={<span style={tag("#e2cfa4", "#5b4426")}>NPC</span>}>
              <b>{n.name}:</b> {n.note}
            </Row>
          ))}
          {plan.moves.map((m) => (
            <Row key={`mv-${m.from}-${m.beat}`} tag={<span style={tag("#2f5d7c", "#f3e7cb")}>MOVED</span>}>
              <b>{m.beat}</b> ({name(m.from)} → {name(m.to)}): <i>{m.text}</i>
            </Row>
          ))}
          {plan.orphaned.map((o) => (
            <Row key={`or-${o.from}-${o.beat}`} tag={<span style={tag("#9e2f22", "#f3e7cb")}>YOURS</span>}>
              <b>{o.beat}</b> ({name(o.from)}): nobody listed is here, so hand it to whoever fits, or drop it.
            </Row>
          ))}
          {plan.cuts.map((c) => (
            <Row key={`cut-${c.from}-${c.text}`} tag={<span style={tag("#5b4426", "#f3e7cb")}>CUT</span>}>
              {c.text}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ tag, children }: { tag: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {tag}
      <span>{children}</span>
    </>
  );
}
