import { useState } from "react";
import { playRip } from "@/lib/rip";
import { useFlashbacks, useLetters } from "@/lib/tableExtras";
import s from "./Table.module.css";

/**
 * What a player at a table sees under their poster once it's theirs: the
 * session-zero question, and any sealed letters the GM has sent them.
 */
export function PlayerExtras({
  code,
  characterId,
  flashback,
}: {
  code: string;
  characterId: string;
  flashback?: string;
}) {
  const { letters, open } = useLetters(code);
  const mine = letters.filter((l) => l.to === characterId);
  return (
    <div className="no-print">
      {flashback && <FlashbackCard code={code} characterId={characterId} prompt={flashback} />}
      {mine.map((l) => (
        <div key={l.id} className={s.card}>
          <p className={s.title}>{l.openedAt ? "A LETTER, OPENED" : "A SEALED LETTER FOR YOU"}</p>
          {l.openedAt && l.text ? (
            <div className={s.letter}>{l.text}</div>
          ) : (
            <button
              type="button"
              className={s.envelope}
              aria-label="Break the seal and read the letter"
              onClick={() => {
                playRip();
                void open(l.id);
              }}
            >
              <span className={s.seal}>break seal</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FlashbackCard({
  code,
  characterId,
  prompt,
}: {
  code: string;
  characterId: string;
  prompt: string;
}) {
  const { flashbacks, answer, error } = useFlashbacks(code);
  const saved = flashbacks.find((f) => f.characterId === characterId && f.mine)?.answer;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return setProblem("Write a line first.");
    if (await answer(characterId, text)) {
      setEditing(false);
      setProblem(null);
    }
  }

  return (
    <form className={s.card} onSubmit={submit}>
      <p className={s.title}>BEFORE WE BEGIN</p>
      <p className={s.prompt}>{prompt}</p>
      {saved && !editing ? (
        <>
          <p className={s.answer}>&ldquo;{saved}&rdquo;</p>
          <div className={s.row}>
            <button
              type="button"
              className={s.btn}
              onClick={() => {
                setDraft(saved);
                setEditing(true);
              }}
            >
              Change it
            </button>
            <span>The GM will read it out before play.</span>
          </div>
        </>
      ) : (
        <>
          <textarea
            className={s.textarea}
            value={draft}
            maxLength={400}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
            }}
            aria-label={prompt}
            placeholder="One sentence is plenty."
          />
          <div className={s.row}>
            <button type="submit" className={s.btn}>
              Answer
            </button>
            {(problem || error) && <span className={s.error}>{problem ?? error}</span>}
          </div>
        </>
      )}
    </form>
  );
}
