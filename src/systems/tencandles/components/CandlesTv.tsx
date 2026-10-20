import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { PublicTcOneShot } from "@/lib/public";
import { useClaims } from "@/lib/storage";
import { useGame } from "@/lib/useGame";
import { SoundEngine } from "@/lib/sound/synth";
import { SYSTEMS } from "@/systems/registry";
import { litCount, STEPS, type TcView } from "../game";
import { CLOSING_LINE, OPENING_LINE } from "../rules";
import { Candles, outcome, RollDice, seatName } from "./Bits";
import { candlesLeft, useNow } from "./CandleKeeper";
import { FinalWords } from "./Recorder";
import { TvLive } from "@/components/tv/TvLive";
import s from "./Tc.module.css";

const STEP_LINE: Record<(typeof STEPS)[number], string> = {
  traits: "Write a Virtue and a Vice for your neighbours.",
  module: "Listen.",
  concept: "Who were you, before the dark?",
  moment: "Where will you find hope?",
  brink: "What have you seen them do?",
  stack: "Stack your cards.",
  record: "Leave your last words.",
};

/**
 * The candles on the TV: ten flames that go out as the night does, the
 * truths as they're spoken, and every roll. It asks for the table's public
 * view even in the GM's browser, so nothing private reaches the screen.
 */
export function CandlesTv({ os }: { os: PublicTcOneShot }) {
  const { table } = useClaims(os.slug);
  const { game, extras, error } = useGame<TcView, { intro: string | null }>(table, "table", null);
  const now = useNow();
  const [qr, setQr] = useState("");
  const [sound, setSound] = useState(false);
  const engine = useRef<SoundEngine | null>(null);
  const prevLit = useRef<number | null>(null);
  const joinUrl = table && typeof window !== "undefined" ? `${window.location.origin}/${os.slug}/play?table=${table}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    let alive = true;
    QRCode.toString(joinUrl, { type: "svg", margin: 0, color: { dark: "#efe4cf", light: "#0000" } }).then((svg) => alive && setQr(svg));
    return () => {
      alive = false;
    };
  }, [joinUrl]);

  // A candle going out is heard, once someone has turned the sound on.
  const lit = game ? litCount(game) : null;
  useEffect(() => {
    if (lit === null) return;
    if (sound && prevLit.current !== null && lit < prevLit.current) engine.current?.playStinger("snuff");
    prevLit.current = lit;
  }, [lit, sound]);
  useEffect(() => () => engine.current?.dispose(), []);

  // Keep the TV awake.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  const names = (i: number) => (game ? seatName(game.seats, i) : `seat ${i + 1}`);
  const last = game?.log.at(-1);

  return (
    <>
      <Head>
        <title>{`${os.title} · the candles`}</title>
      </Head>
      <main id="main" className={s.tv}>
        <div className={s.tvBar}>
          <span>
            {SYSTEMS.tencandles.label} · {os.title}
          </span>
          {table ? <span>Table {table}</span> : null}
        </div>
        <Candles
          lit={game?.candles ?? Array.from({ length: 10 }, () => false)}
          left={game ? candlesLeft(game, now) : undefined}
          sputter={game?.draft?.index ?? null}
          className={s.tvCandles}
        />
        {game?.draft && (
          <p className={s.tvLine} style={{ textAlign: "center", fontStyle: "italic" }} role="status">
            A draft stirs the candles…
          </p>
        )}

        {game?.phase !== "lobby" && <h1 className={s.srOnly}>{os.title}: the candles</h1>}
        <div className={s.tvStage} aria-live="polite">
          {!table && (
            <p className={s.tvLine}>
              No table open on this device. Open one from the{" "}
              <Link href={`/${os.slug}/gm`} style={{ color: "#f3c770" }}>
                GM page
              </Link>
              , then come back.
            </p>
          )}
          {game?.phase === "lobby" && (
            <>
              <h1 className={s.tvTitle}>{os.title}</h1>
              <p className={s.tvSmall}>Scan to take a seat · table {table}</p>
              <div
                style={{ width: "min(26vh, 300px)" }}
                role="img"
                aria-label="QR code to join this table on a phone"
                // SVG markup generated locally by the qrcode library.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className={s.tvLine}>{game.seats.map((x) => x.name).join(" · ") || "Nobody has sat down yet."}</p>
            </>
          )}
          {game?.phase === "creation" && game.step && (
            <>
              <p className={s.tvSmall}>Making characters</p>
              <p className={s.tvLine}>{STEP_LINE[game.step]}</p>
              {extras.intro && game.step === "concept" && (
                <p className={s.tvLine} style={{ fontSize: "clamp(16px, 1.6vw, 28px)", maxWidth: "60ch" }}>
                  {extras.intro.split("\n\n")[0]}
                </p>
              )}
              {game.waiting.length > 0 && game.step !== "module" && (
                <p className={s.tvSmall}>Waiting on {game.waiting.map((i) => game.seats[i].name).join(", ")}</p>
              )}
            </>
          )}
          {game?.phase === "truths" && game.truths && (
            <>
              <p className={s.tvSmall}>Before scene {game.truths.scene}</p>
              <p className={s.tvLine} style={{ fontStyle: "italic", color: "#f3c770" }}>
                {OPENING_LINE}
              </p>
              <ol className={s.tvTruths}>
                {game.truths.entries.map((e, i) => (
                  <li key={i}>{e.text}</li>
                ))}
              </ol>
              {game.truths.speaker === null ? (
                <p className={s.tvLine} style={{ fontStyle: "italic", color: "#f3c770" }}>
                  …{CLOSING_LINE}.
                </p>
              ) : (
                <p className={s.tvSmall}>{seatName(game.seats, game.truths.speaker)} speaks</p>
              )}
            </>
          )}
          {game?.phase === "scene" && (
            <>
              <p className={s.tvSmall}>{game.lastStand ? "The Last Stand" : `Scene ${game.scene}`}</p>
              {game.roll ? (
                <RollDice roll={game.roll} names={names} className={s.tvDice} />
              ) : last?.resolved && last.scene === game.scene ? (
                <>
                  <RollDice roll={last} names={names} className={s.tvDice} />
                  <p className={s.tvLine}>{outcome(last, names)}</p>
                </>
              ) : (
                <p className={s.tvLine}>
                  {game.pools.players} {game.pools.players === 1 ? "die" : "dice"} in the pool. The GM holds {game.pools.gm}.
                </p>
              )}
              <p className={s.tvSmall}>
                {game.seats
                  .filter((x) => x.alive)
                  .map((x) => `${names(x.index)}${x.hope ? " (Hope)" : ""}`)
                  .join(" · ")}
              </p>
            </>
          )}
          {game?.phase === "ended" && table && (
            <>
              <p className={s.tvLine} style={{ fontStyle: "italic", color: "#f3c770" }}>
                {OPENING_LINE}
              </p>
              <div style={{ width: "min(90vw, 760px)", textAlign: "left" }}>
                <FinalWords code={table} playerId={null} as="table" seats={game.seats} you={null} />
              </div>
            </>
          )}
        </div>

        <TvLive code={table} tray="log" icons={os.cast.map((c) => c.poster.icon)} sound={sound} />

        <div className={s.tvBar}>
          <span>{error ?? ""}</span>
          <span style={{ display: "flex", gap: 12 }}>
            {!sound && (
              <button
                type="button"
                className={s.quiet}
                onClick={() => {
                  if (SoundEngine.isSupported()) engine.current ??= new SoundEngine({ volume: 0.7 });
                  setSound(true);
                }}
              >
                Sound on
              </button>
            )}
            <button type="button" className={s.quiet} onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}>
              Full screen
            </button>
          </span>
        </div>
      </main>
    </>
  );
}
