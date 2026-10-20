import { PosterIcon } from "@/components/PosterIcon";
import type { Poster } from "@/lib/coreSchema";
import type { Panel, PanelKind } from "@/lib/tapestry";
import w from "./Tapestry.module.css";

/** The engraving for a panel that isn't about one character (or whose character has no icon). */
const ENGRAVING: Record<PanelKind, Poster["icon"]> = {
  claim: "sword",
  letter: "book",
  nat20: "star",
  nat1: "skull",
  darkened: "candle",
  death: "skull",
  act: "crown",
  notes: "eye",
  coins: "star",
  fate: "moon",
};

export type Layout = "strip" | "poster";

/**
 * The frieze itself: one woodcut panel per moment, as a long strip (to tape
 * end to end along a shelf) or a poster. With `onRename`/`onToggle`, the GM
 * can rename a panel or drop it.
 */
export function Frieze({
  title,
  label,
  panels,
  icons,
  layout,
  onRename,
  onToggle,
}: {
  title: string;
  /** The region's name for screen readers, when a page holds several friezes. */
  label?: string;
  panels: (Panel & { dropped?: boolean })[];
  icons: Record<string, Poster["icon"]>;
  layout: Layout;
  onRename?: (id: string, title: string) => void;
  onToggle?: (id: string) => void;
}) {
  return (
    <section className={w.frieze} data-layout={layout} aria-label={label ?? `The tapestry of ${title}`} data-testid="tapestry">
      <div className={w.banner}>
        <span className={w.bannerTail} aria-hidden="true" />
        {title}
        <span className={w.bannerTail} aria-hidden="true" />
      </div>
      <ol className={w.panels}>
        {panels.map((p, i) => (
          <li key={p.id} className={w.panel} data-dropped={p.dropped ? "" : undefined} data-kind={p.kind} data-testid="tapestry-panel">
            <div className={w.picture} aria-hidden="true">
              <PosterIcon icon={(p.characterId && icons[p.characterId]) || ENGRAVING[p.kind]} size={54} />
            </div>
            <div className={w.number}>{i + 1}</div>
            {onRename && !p.dropped ? (
              <textarea
                className={w.titleInput}
                defaultValue={p.title}
                rows={2}
                maxLength={80}
                aria-label={`Panel ${i + 1} title`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && onRename(p.id, e.target.value.trim())}
              />
            ) : (
              <div className={w.title}>{p.title}</div>
            )}
            {p.caption && <div className={w.caption}>{p.caption}</div>}
            {onToggle && (
              <button type="button" className={`${w.toggle} no-print`} onClick={() => onToggle(p.id)}>
                {p.dropped ? "Put it back" : "Drop this panel"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
