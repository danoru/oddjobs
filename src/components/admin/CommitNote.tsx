import { Button } from "@mui/material";
import { useChangedFiles } from "./changedFiles";
import s from "./Admin.module.css";

/** "These files changed: remember to commit them." The builder never runs git for you. */
export function CommitNote() {
  const { files, clear } = useChangedFiles();
  if (!files.length) return null;
  return (
    <aside className={s.commitNote} aria-label="Files to commit" role="status">
      <strong>
        {files.length} content file{files.length === 1 ? "" : "s"} changed. Remember to commit {files.length === 1 ? "it" : "them"}
      </strong>
      : the builder writes files in <code>content/</code>, and the deployed site only gets them once they&apos;re committed and pushed.
      <ul className={s.fileList}>
        {files.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Button size="small" onClick={clear} sx={{ mt: 1 }}>
        Done, I&apos;ve committed them
      </Button>
    </aside>
  );
}
