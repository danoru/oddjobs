import { useCallback, useEffect, useRef, useState } from "react";
import { deleteBlob, getBlob, putBlob } from "@/lib/localBlobs";
import { MAX_AUDIO_BYTES, MAX_SECONDS, MAX_TEXT, type RecordingInfo } from "../recording";
import { RuleMark, seatName } from "./Bits";
import type { SeatView } from "../game";
import s from "./Tc.module.css";

const audioKey = (code: string) => `tc:recording:${code}`;
const textKey = (code: string) => `tearoff:lastwords:${code}`;

function readText(code: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(textKey(code)) ?? "";
  } catch {
    return "";
  }
}

function writeText(code: string, text: string | null) {
  try {
    if (text === null) window.localStorage.removeItem(textKey(code));
    else window.localStorage.setItem(textKey(code), text);
  } catch {
    /* storage unavailable */
  }
}

/** Microphones need a secure page: https, or localhost. Phones on a LAN address over http get none. */
function micAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window.MediaRecorder === "function"
  );
}

function pickMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"])
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const extFor = (mime: string) => (mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm");

/**
 * A player's final recording. It's made and kept on this phone; it only
 * goes to the server when the GM has chosen to keep recordings at this table.
 * No microphone (or no secure connection)? Write it instead.
 */
export function Recorder({
  code,
  kept,
  recorded,
  onRecorded,
}: {
  code: string;
  /** The GM keeps recordings on the server at this table. */
  kept: boolean;
  /** What the table has been told we left. */
  recorded: boolean;
  onRecorded: (kind: "audio" | "text" | null) => Promise<string | null>;
}) {
  // This only mounts in the browser (the phone shows "Finding the table…" until the game loads).
  const [mic] = useState(micAvailable);
  const [mode, setMode] = useState<"audio" | "text">(() => (micAvailable() ? "audio" : "text"));
  const [clip, setClip] = useState<{ url: string; blob: Blob; mime: string } | null>(null);
  const [text, setText] = useState(() => readText(code));
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(MAX_SECONDS);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<"phone" | "table" | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  // What's already on this phone.
  useEffect(() => {
    let url = "";
    void getBlob(audioKey(code)).then((v) => {
      if (!v) return;
      url = URL.createObjectURL(v.blob);
      setClip({ url, blob: v.blob, mime: v.mime });
      setSaved("phone");
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [code]);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    if (rec.current?.state === "recording") rec.current.stop();
    setRecording(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        await putBlob(audioKey(code), { blob, mime: type, savedAt: Date.now() });
        setClip((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(blob), blob, mime: type };
        });
        setSaved(null);
      };
      rec.current = r;
      r.start(500);
      setRecording(true);
      setLeft(MAX_SECONDS);
      const began = Date.now();
      timer.current = window.setInterval(() => {
        const remaining = MAX_SECONDS - Math.floor((Date.now() - began) / 1000);
        setLeft(remaining);
        if (remaining <= 0) stop();
      }, 250);
    } catch {
      setProblem("Your phone wouldn't share its microphone. Write your last words instead.");
      setMode("text");
    }
  }

  async function keepAudio() {
    if (!clip) return;
    setProblem(null);
    if (kept) {
      if (clip.blob.size > MAX_AUDIO_BYTES) return setProblem("That's too long to keep at the table. Record something shorter.");
      const res = await fetch(`/api/tables/${code}/recordings?as=player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "audio", mime: clip.mime, data: await toBase64(clip.blob) }),
      }).catch(() => null);
      if (!res?.ok) return setProblem((await res?.json().catch(() => null))?.error ?? "Couldn't reach the table — it's still on your phone.");
    }
    const err = await onRecorded("audio");
    if (err) return setProblem(err);
    setSaved(kept ? "table" : "phone");
  }

  async function keepText() {
    const t = text.trim();
    if (!t) return setProblem("Write something first.");
    writeText(code, t);
    if (kept) {
      const res = await fetch(`/api/tables/${code}/recordings?as=player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", text: t }),
      }).catch(() => null);
      if (!res?.ok) return setProblem((await res?.json().catch(() => null))?.error ?? "Couldn't reach the table — it's still on your phone.");
    }
    const err = await onRecorded("text");
    if (err) return setProblem(err);
    setSaved(kept ? "table" : "phone");
  }

  async function forget() {
    stop();
    await deleteBlob(audioKey(code));
    writeText(code, null);
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setText("");
    setSaved(null);
    if (kept)
      await fetch(`/api/tables/${code}/recordings?as=player`, { method: "DELETE" }).catch(
        () => null,
      );
    await onRecorded(null);
  }

  return (
    <div>
      <p className={s.prose}>
        Leave a message, in your character&apos;s voice, for whoever finds it after. Keep it short.
        <RuleMark id="recording" />
      </p>
      <p className={s.hint}>
        {kept
          ? "The GM keeps recordings at this table, so it goes to the table (small, and only for this game)."
          : "It stays on this phone. Nothing is uploaded; you'll play it yourself at the end."}
      </p>

      {mode === "audio" && mic ? (
        <>
          <div className={s.row}>
            {recording ? (
              <button type="button" className={`${s.btn} ${s.danger}`} onClick={stop}>
                ■ Stop ({left}s left)
              </button>
            ) : (
              <button type="button" className={s.btn} onClick={() => void start()}>
                ● {clip ? "Record again" : "Record"}
              </button>
            )}
            <button type="button" className={s.quiet} onClick={() => setMode("text")}>
              Write it instead
            </button>
          </div>
          <p aria-live="polite" className={s.hint}>
            {recording ? "Recording… speak as your character." : ""}
          </p>
          {clip && !recording && (
            <>
              <audio controls src={clip.url} style={{ width: "100%", marginTop: 8 }} />
              <div className={s.row}>
                <button type="button" className={s.btn} onClick={() => void keepAudio()}>
                  {kept ? "Give it to the table" : "Keep it on my phone"}
                </button>
                <a className={s.quiet} href={clip.url} download={`last-words.${extFor(clip.mime)}`}>
                  Download
                </a>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {mic === false && (
            <p className={s.hint}>
              No microphone here: phones only share one over a secure connection (https, or this computer&apos;s own
              localhost). Write your last words; someone can read them aloud at the end.
            </p>
          )}
          <label className={s.label} htmlFor="last-words">
            Your last words
          </label>
          <textarea
            id="last-words"
            className={s.field}
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="If anyone finds this…"
          />
          <div className={s.row}>
            <button type="button" className={s.btn} onClick={() => void keepText()}>
              {kept ? "Give it to the table" : "Keep it on my phone"}
            </button>
            {mic && (
              <button type="button" className={s.quiet} onClick={() => setMode("audio")}>
                Record it instead
              </button>
            )}
          </div>
        </>
      )}

      {(recorded || saved) && (
        <div className={s.row}>
          <span className={s.badge}>{saved === "table" || (recorded && kept) ? "With the table" : "Kept on this phone"}</span>
          <button type="button" className={s.quiet} onClick={() => void forget()}>
            Forget it
          </button>
        </div>
      )}
      {problem && (
        <p className={s.error} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The end, in the dark: play the final words this viewer may hear. Kept
 * recordings come from the table; this phone's own (if it was never given to
 * the table) plays from the phone.
 */
export function FinalWords({
  code,
  as,
  seats,
  you,
}: {
  code: string;
  as: "player" | "table" | "gm";
  seats: SeatView[];
  you: number | null;
}) {
  const [list, setList] = useState<RecordingInfo[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [own, setOwn] = useState<{ url: string; mime: string } | null>(null);
  const [ownText] = useState(() => (as === "player" ? readText(code) : ""));
  const q = as === "gm" ? "" : `as=${as}`;

  useEffect(() => {
    let alive = true;
    void fetch(`/api/tables/${code}/recordings${q ? `?${q}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { recordings?: RecordingInfo[] }) => alive && setList(j.recordings ?? []))
      .catch(() => undefined);
    let url = "";
    if (as === "player")
      void getBlob(audioKey(code)).then((v) => {
        if (!v || !alive) return;
        url = URL.createObjectURL(v.blob);
        setOwn({ url, mime: v.mime });
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [code, q, as]);

  async function load(seat: number) {
    const res = await fetch(`/api/tables/${code}/recordings?seat=${seat}${q ? `&${q}` : ""}`).catch(() => null);
    if (!res?.ok) return;
    const url = URL.createObjectURL(await res.blob());
    setUrls((u) => ({ ...u, [seat]: url }));
    window.setTimeout(() => document.querySelector<HTMLAudioElement>(`#words-${seat}`)?.play().catch(() => undefined), 50);
  }

  const kept = new Set(list.map((r) => r.seat));
  return (
    <div>
      <ul className={s.truths}>
        {list.map((r) => (
          <li key={r.seat}>
            <span className={s.truthBy}>{seatName(seats, r.seat)}</span>
            {r.kind === "text" ? (
              <span>&ldquo;{r.text}&rdquo;</span>
            ) : urls[r.seat] ? (
              <audio id={`words-${r.seat}`} controls src={urls[r.seat]} style={{ width: "100%" }} />
            ) : (
              <button type="button" className={s.btn} onClick={() => void load(r.seat)}>
                ▶ Play
              </button>
            )}
          </li>
        ))}
        {you !== null && !kept.has(you) && (own || ownText) && (
          <li>
            <span className={s.truthBy}>Yours (on this phone)</span>
            {own ? (
              <>
                <audio controls src={own.url} style={{ width: "100%" }} />
                <a className={s.quiet} href={own.url} download={`last-words.${extFor(own.mime)}`}>
                  Download
                </a>
              </>
            ) : (
              <span>&ldquo;{ownText}&rdquo;</span>
            )}
          </li>
        )}
      </ul>
      {list.length === 0 && !own && !ownText && <p className={s.hint}>No final words were kept at the table.</p>}
    </div>
  );
}
