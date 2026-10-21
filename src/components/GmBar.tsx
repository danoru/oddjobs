import Link from "next/link";
import { useRouter } from "next/router";
import { useSyncExternalStore } from "react";
import { useWhoami } from "@/lib/useWhoami";
import g from "./GmBar.module.css";

/**
 * The GM's bar across the top of every page, for the admins (the GM pages
 * are theirs until games arrive): the builder, the spell book, the people,
 * the chronicle and, on a one-shot's
 * pages, its GM page, TV, printed box (or kit), tapestry and builder entry.
 * "Hide" folds it into a small tab, to see a page as players do. It's only
 * navigation: every GM page and API checks the role itself.
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
  const role = useWhoami(router.pathname)?.role;
  const [hidden, setHidden] = useHidden();

  if (role !== "gm" || QUIET.includes(router.pathname)) return null;

  const slug = os?.slug ?? (typeof router.query.oneshot === "string" ? router.query.oneshot : typeof router.query.slug === "string" ? router.query.slug : null);
  const title = os?.title ?? slug;
  const tc = os?.system === "tencandles";
  const here = router.asPath.split(/[?#]/)[0];
  // No prefetching: most of these render on the server per request (the box, the builder, the people page),
  // and prefetching would run every one of them on each page load.
  const link = (href: string, label: string) => (
    <Link key={href} href={href} prefetch={false} className={g.link} aria-current={here === href ? "page" : undefined}>
      {label}
    </Link>
  );

  if (hidden)
    return (
      <div className={`${g.tabWrap} no-print`}>
        <button type="button" className={g.tab} onClick={() => setHidden(false)} aria-label="Show the GM bar">
          GM
        </button>
      </div>
    );

  return (
    <nav className={`${g.bar} no-print`} aria-label="GM">
      <div className={g.inner}>
        <span className={g.seal} aria-hidden="true">
          GM
        </span>
        {slug && (
          <span className={g.group} aria-label={`This one-shot: ${title}`}>
            <span className={g.label}>{title}</span>
            {link(`/${slug}/gm`, "GM page")}
            {link(`/${slug}/tv`, "TV")}
            {link(`/${slug}/box`, "Print the box")}
            {tc && link(`/${slug}/kit`, "Kit")}
            {link(`/${slug}/tapestry`, "Tapestry")}
            {link(`/admin/${slug}`, "Edit")}
          </span>
        )}
        <span className={g.group}>
          {link("/admin", "Builder")}
          {link("/admin/spells", "Spell book")}
          {link("/admin/people", "People")}
          {link("/chronicle", "Chronicle")}
        </span>
        <button type="button" className={g.hide} onClick={() => setHidden(true)} title="See the page as players do">
          Hide
        </button>
      </div>
    </nav>
  );
}
