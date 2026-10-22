import Link from "next/link";
import { useRouter } from "next/router";
import { useSyncExternalStore } from "react";
import { useWhoami } from "@/lib/useWhoami";
import b from "./GmBar.module.css";

/**
 * The GM's bar across the top of every page. On a one-shot's pages, for
 * whoever runs a game of it (and the admins): that game's GM page, the TV,
 * the printed box (or kit) and the tapestry. Everywhere, for the admins and
 * authors: the builder, the spell book, the people (admins) and the
 * chronicle. "Hide" folds it into a small tab, to see a page as players do.
 * It's only navigation: every GM page and API checks the game itself.
 */

const HIDDEN_KEY = "tearoff:gmbar";
const EVENT = "tearoff:gmbar";

/** Routes where the bar stays out of the way: the TV is cast to the table, and the door is the door. */
const QUIET = ["/", "/login", "/join/[code]", "/reset/[token]", "/[oneshot]/tv"];

type OneShotLike = { slug?: string; title?: string; system?: string };

function readHidden() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function useHidden(): [boolean, (v: boolean) => void] {
  const hidden = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    readHidden,
    () => false,
  );
  const set = (v: boolean) => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable: it just won't stick */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [hidden, set];
}

export function GmBar({ os }: { os?: OneShotLike }) {
  const router = useRouter();
  // Until someone is signed in (say, on the door), ask again on each navigation.
  const who = useWhoami(router.pathname);
  const [hidden, setHidden] = useHidden();
  const user = who?.user;
  const slug = os?.slug ?? (typeof router.query.oneshot === "string" ? router.query.oneshot : typeof router.query.slug === "string" ? router.query.slug : null);
  // The game this bar is for: the one the page is about, else the newest one of this one-shot the user runs.
  const wanted = typeof router.query.game === "string" ? router.query.game : null;
  const game = who?.running.find((x) => x.oneshot === slug && (!wanted || x.code === wanted)) ?? who?.running.find((x) => x.oneshot === slug) ?? null;
  const admin = user?.role === "admin";
  const staff = admin || !!user?.author;

  if (!user || QUIET.includes(router.pathname) || !(staff || game)) return null;

  const title = os?.title ?? slug;
  const tc = os?.system === "tencandles";
  const g = game ? `?game=${game.code}` : "";
  const here = router.asPath.split(/[?#]/)[0];
  // No prefetching: most of these render on the server per request (the box, the builder, the people page),
  // and prefetching would run every one of them on each page load.
  const link = (href: string, label: string) => (
    <Link key={href} href={href} prefetch={false} className={b.link} aria-current={here === href ? "page" : undefined}>
      {label}
    </Link>
  );

  if (hidden)
    return (
      <div className={`${b.tabWrap} no-print`}>
        <button type="button" className={b.tab} onClick={() => setHidden(false)} aria-label="Show the GM bar">
          GM
        </button>
      </div>
    );

  return (
    <nav className={`${b.bar} no-print`} aria-label="GM">
      <div className={b.inner}>
        <span className={b.seal} aria-hidden="true">
          GM
        </span>
        {slug && (game || admin) && (
          <span className={b.group} aria-label={`This one-shot: ${title}`}>
            <span className={b.label}>{game ? `${title} · ${game.code}` : title}</span>
            {link(`/${slug}/gm${g}`, "GM page")}
            {link(`/${slug}/tv`, "TV")}
            {link(`/${slug}/box${g}`, "Print the box")}
            {tc && link(`/${slug}/kit${g}`, "Kit")}
            {link(`/${slug}/tapestry`, "Tapestry")}
            {staff && link(`/admin/${slug}`, "Edit")}
          </span>
        )}
        {staff && (
          <span className={b.group}>
            {link("/admin", "Builder")}
            {link("/admin/spells", "Spell book")}
            {admin && link("/admin/people", "People")}
            {link("/chronicle", "Chronicle")}
          </span>
        )}
        <button type="button" className={b.hide} onClick={() => setHidden(true)} title="See the page as players do">
          Hide
        </button>
      </div>
    </nav>
  );
}
