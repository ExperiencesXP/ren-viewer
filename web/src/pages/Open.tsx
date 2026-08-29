import { type DragEvent, type FormEvent, useCallback, useState } from "react";
import { api, loadRecent, pushRecent, removeRecent, SessionClosedError } from "../api";
import type { GameInfo } from "../api";

type Props = {
  onOpened: (game: GameInfo) => void;
  bootError?: string | null;
};

export function OpenPage({ onOpened, bootError }: Props) {
  const [path, setPath] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(bootError ?? null);
  const [dropActive, setDropActive] = useState(false);

  const openPath = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setError("Enter a folder or archive path.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const game = await api.open(trimmed);
        pushRecent(trimmed);
        setRecent(loadRecent());
        onOpened(game);
      } catch (err) {
        if (err instanceof SessionClosedError) {
          setError("Session closed unexpectedly.");
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setBusy(false);
      }
    },
    [onOpened],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await openPath(path);
  }

  async function browse() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.dialogFolder();
      if (result.path) {
        setPath(result.path);
        await openPath(result.path);
      }
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : String(err)} — paste the folder path instead.`,
      );
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    const text = e.dataTransfer.getData("text/plain").trim();
    if (text && (text.includes("\\") || text.includes("/") || text.includes(":"))) {
      const cleaned = text.replace(/^file:\/\//, "").replace(/^["']|["']$/g, "");
      setPath(cleaned);
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file) {
      setError(
        "Browsers do not reveal filesystem paths on drop. Paste the full folder path, or use Browse.",
      );
    }
  }

  return (
    <div className="open-page">
      <div
        className={`open-card${dropActive ? " drop-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={onDrop}
      >
        <div className="open-mark">
          <span className="kicker">Local manuscript archive</span>
          <span>nothing leaves this machine</span>
        </div>
        <h1>Ren-Viewer</h1>
        <p className="lede">
          Open a Ren&apos;Py game folder or a lone archive. Browse the unified folio — loose files
          and packed volumes in engine load order — then decompile, map the story, and bind a
          patch overlay.
        </p>

        <form className="open-form" onSubmit={onSubmit}>
          <div className="open-row">
            <div className="field">
              <label htmlFor="game-path">Volume path</label>
              <input
                id="game-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="D:\Games\Some Visual Novel"
                autoFocus
                spellCheck={false}
              />
            </div>
            <button type="button" className="btn" onClick={() => void browse()} disabled={busy}>
              Browse
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Opening…" : "Open"}
            </button>
          </div>
        </form>

        {error ? <div className="open-error">{error}</div> : null}

        <div
          className="drop-hint"
          onDragOver={(e) => e.preventDefault()}
        >
          Drop a path from Explorer, or keep the catalog card focused and paste.
        </div>

        {recent.length > 0 ? (
          <div className="recent">
            <h2>Recent volumes</h2>
            <ul className="recent-list">
              {recent.map((item) => (
                <li key={item}>
                  <button type="button" className="path" onClick={() => void openPath(item)} title={item}>
                    {item}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      removeRecent(item);
                      setRecent(loadRecent());
                    }}
                    aria-label="Remove from recent"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
