"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { RealisticDice } from "@/components/realistic-dice";
import type { RollOutcome } from "@/lib/game";

const ROLL_SPIN_MS = 3_900;
const SETTLE_MS = 620;
const REQUEST_TIMEOUT_MS = 12_000;

type DicePhase = "rolling" | "waiting" | "settled" | "error";

function playRollSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const hits = [0, .17, .36, .58, .83, 1.1, 1.4, 1.72, 2.03, 2.34, 2.63, 2.9, 3.14, 3.35, 3.54, 3.7];
    hits.forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 3 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = 120 + ((index * 43) % 135);
      gain.gain.setValueAtTime(.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(index > 12 ? .13 : .065, context.currentTime + delay + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + .07);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + .085);
    });
    window.setTimeout(() => void context.close(), ROLL_SPIN_MS + 900);
  } catch {
    // Sound is decorative; game logic never depends on browser audio support.
  }
}

declare global {
  interface Window { webkitAudioContext: typeof AudioContext }
}

export function DiceOverlay({
  onCancel,
  onOutcome,
}: {
  onCancel: () => void;
  onOutcome: (outcome: RollOutcome) => void;
}) {
  const [phase, setPhase] = useState<DicePhase>("rolling");
  const [targetValue, setTargetValue] = useState<number | null>(null);
  const [error, setError] = useState("");
  const requestIdRef = useRef(crypto.randomUUID());
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let animationDone = false;
    let revealed = false;
    let serverOutcome: RollOutcome | null = null;
    let resultTimer = 0;
    const controller = new AbortController();

    function reveal(nextOutcome: RollOutcome) {
      if (!active || revealed) return;
      revealed = true;
      setTargetValue(nextOutcome.diceValue);
      setPhase("settled");
      resultTimer = window.setTimeout(() => onOutcome(nextOutcome), SETTLE_MS);
    }

    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playRollSound();
    }
    const animationTimer = window.setTimeout(() => {
      animationDone = true;
      if (serverOutcome) reveal(serverOutcome);
      else setPhase("waiting");
    }, ROLL_SPIN_MS);
    const requestTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    fetch("/api/game/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: requestIdRef.current }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Бросок не состоялся.");
        if (!active) return;
        serverOutcome = body as RollOutcome;
        setTargetValue(serverOutcome.diceValue);
        if (animationDone) reveal(serverOutcome);
      })
      .catch((reason) => {
        if (!active) return;
        window.clearTimeout(animationTimer);
        setError(reason instanceof DOMException && reason.name === "AbortError"
          ? "Сервер долго не отвечает. Попробуй бросить ещё раз."
          : reason instanceof Error ? reason.message : String(reason));
        setPhase("error");
      })
      .finally(() => window.clearTimeout(requestTimer));

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(animationTimer);
      window.clearTimeout(requestTimer);
      window.clearTimeout(resultTimer);
    };
  }, [onOutcome]);

  const statusText = phase === "rolling"
    ? "Кубик вращается"
    : phase === "waiting"
      ? "Получаем результат броска"
      : phase === "settled"
        ? `Выпало ${targetValue}`
        : "Бросок не состоялся";

  return (
    <div className={`dice-overlay dice-${phase}`} role="status" aria-live="polite" aria-label={statusText}>
      {phase !== "error" && <span className="dice-aura" />}
      {phase !== "error" && <RealisticDice targetValue={targetValue} phase={phase} />}
      <span className="sr-only">{statusText}</span>
      {phase === "waiting" && <span className="dice-waiting-label">Определяем результат…</span>}
      {error && (
        <div className="dice-error-card">
          <button onClick={onCancel} aria-label="Закрыть"><X /></button>
          <AlertTriangle />
          <div><b>Бросок недоступен</b><p>{error}</p></div>
        </div>
      )}
    </div>
  );
}
