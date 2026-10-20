import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useSyncExternalStore } from "react";
import g from "./GmBar.module.css";

/**
 * The GM's bar across the top of every page, for whoever came in with the GM
 * password: the builder, the spell book, the chronicle and, on a one-shot's
 * pages, its GM page, TV, printed box (or kit), tapestry and builder entry.
 * "Hide" folds it into a small tab, to see a page as players do. It's only
 * navigation: every GM page and API checks the role itself.
 */

const HIDDEN_KEY = "tearoff:gmbar";
const EVENT = "tearoff:gmbar";
let cachedRole: string | null | undefined;

/** Routes where the bar stays out of the way: the TV is cast to the table, and the door is the door. */
const QUIET = ["/login", "/[oneshot]/tv"];

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
  const [role, setRole] = useState<string | null | undefined>(cachedRole);
  const [hidden, setHidden] = useHidden();

  // Ask once per page load; until a role comes back (say, on the door), ask again on each navigation.
  useEffect(() => {
    if (cachedRole) return;
    let alive = true;
    fetch("/api/whoami", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ role: string | null }>) : { role: null }))
      .catch(() => ({ role: null }))
      .then((j) => {
        if (j.role) cachedRole = j.role;
        if (alive) setRole(j.role);
      });
    return () => {
      alive = false;
    };
  }, [router.pathname]);

  if (role !== "gm" || QUIET.includes(router.pathname)) return null;

  const slug = os?.slug ?? (typeof router.query.oneshot === "string" ? router.query.oneshot : typeof router.query.slug === "string" ? router.query.slug : null);
  const title = os?.title ?? slug;
  const tc = os?.system === "tencandles";
  const here = router.asPath.split(/[?#]/)[0];
  const link = (href: string, label: string) => (
    <Link key={href} href={href} className={g.link} aria-current={here === href ? "page" : undefined}>
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
          {link("/chronicle", "Chronicle")}
        </span>
        <button type="button" className={g.hide} onClick={() => setHidden(true)} title="See the page as players do">
          Hide
        </button>
      </div>
    </nav>
  );
}
