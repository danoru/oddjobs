import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePrefs } from "./storage";

/**
 * Shake to roll: DeviceMotion, with iOS's permission prompt behind a button.
 * The detector is a pure function over acceleration samples so it can be
 * tested without a phone.
 */

export interface MotionSample {
  /** Acceleration including gravity, m/s². */
  x: number;
  y: number;
  z: number;
  /** ms */
  t: number;
}

/**
 * A shake is a few sharp jolts close together: the change in acceleration
 * between samples tops `threshold` at least `jolts` times within `windowMs`,
 * and then nothing fires again for `quietMs` (one shake, one roll).
 */
export function shakeDetector({ threshold = 14, jolts = 3, windowMs = 700, quietMs = 1500 } = {}) {
  let prev: MotionSample | null = null;
  let hits: number[] = [];
  let lastFired = -Infinity;
  return (s: MotionSample): boolean => {
    const p = prev;
    prev = s;
    if (!p) return false;
    const delta = Math.abs(s.x - p.x) + Math.abs(s.y - p.y) + Math.abs(s.z - p.z);
    if (delta < threshold) return false;
    hits = [...hits.filter((t) => s.t - t <= windowMs), s.t];
    if (hits.length < jolts || s.t - lastFired < quietMs) return false;
    hits = [];
    lastFired = s.t;
    return true;
  };
}

type MotionPermission = "granted" | "denied" | "prompt" | "unsupported";

type IosMotion = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

const noSubscribe = () => () => undefined;
function motionSupport(): MotionPermission {
  if (typeof DeviceMotionEvent === "undefined") return "unsupported";
  return typeof (DeviceMotionEvent as IosMotion).requestPermission === "function" ? "prompt" : "granted";
}

/**
 * Calls `onShake` when the phone is shaken, while `armed`. On iOS motion
 * needs permission, asked from a tap: call `enable()` from a button. Where
 * no asking is needed, it starts on if the viewer's dice default says so
 * (src/lib/prefs.ts).
 */
export function useShake(onShake: () => void, armed: boolean) {
  // What the browser offers (iOS asks first); the server render assumes "prompt".
  const offered = useSyncExternalStore(noSubscribe, motionSupport, (): MotionPermission => "prompt");
  const [answer, setPermission] = useState<MotionPermission | null>(null);
  const permission = answer ?? offered;
  const [on, setOn] = useState(false);
  const wanted = usePrefs().prefs.dice.shake;
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !wanted || permission !== "granted") return;
    started.current = true;
    setOn(true);
  }, [wanted, permission]);
  const cb = useRef(onShake);
  useEffect(() => {
    cb.current = onShake;
  });

  const enable = useCallback(async () => {
    if (typeof DeviceMotionEvent === "undefined") return setPermission("unsupported");
    const ask = (DeviceMotionEvent as IosMotion).requestPermission;
    if (typeof ask === "function") {
      try {
        const answer = await ask.call(DeviceMotionEvent);
        setPermission(answer);
        if (answer !== "granted") return;
      } catch {
        return setPermission("denied");
      }
    }
    setOn(true);
  }, []);

  useEffect(() => {
    if (!on || !armed || permission !== "granted") return;
    const detect = shakeDetector();
    const listen = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      if (detect({ x: a.x, y: a.y, z: a.z, t: e.timeStamp })) cb.current();
    };
    window.addEventListener("devicemotion", listen);
    return () => window.removeEventListener("devicemotion", listen);
  }, [on, armed, permission]);

  return { on, permission, enable, disable: () => setOn(false) };
}

/** A short buzz, where phones allow it (not iOS Safari). */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration motor, no problem */
  }
}
