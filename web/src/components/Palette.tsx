import { useEffect, useMemo, useRef, useState } from "react";
import { api, SessionClosedError, type SearchHit } from "../api";
import type { PaletteMode } from "../studio";
import { useStudio } from "../studio";

type Props = {
  mode: PaletteMode;
  onClose: () => void;
};

export function Palette({ mode, onClose }: Props) {
  const studio = useStudio();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      api
        .search(query)
        .then((res) => {
          if (cancelled) return;
          const next =
            mode === "files" ? res.hits.filter((h) => h.kind === "file") : res.hits;
          setHits(next);
          setActive(0);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof SessionClosedError) {
            studio.onClosed();
            return;
          }
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, mode, studio]);

  const title = mode === "files" ? "Open a leaf" : "Search the folio";
  const hint = mode === "files" ? "Ctrl+P · paths" : "Ctrl+K · files, labels, lines";

  const shown = useMemo(() => hits.slice(0, 60), [hits]);

  function go(hit: SearchHit) {
    if (hit.kind === "script") {
      studio.setSelectedScript(hit.path);
      studio.setPage("scripts");
    } else if (hit.kind === "label") {
      studio.setHighlightLabel(hit.preview);
      studio.setSelectedScript(hit.path);
      studio.setPage("story");
    } else {
      studio.setSelectedFile(hit.path);
      studio.setPage("files");
    }
    onClose();
  }

  return (
    <div
      className="palette-back"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header>
          <p>
            {title} · {hint}
          </p>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "files" ? "Path fragment…" : "Search…"}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(0, shown.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && shown[active]) {
                e.preventDefault();
                go(shown[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </header>
        <ul>
          {loading ? <li className="muted" style={{ padding: "8px 14px" }}>Searching…</li> : null}
          {error ? <li className="state error">{error}</li> : null}
          {!loading && q.trim() && shown.length === 0 ? (
            <li className="muted" style={{ padding: "8px 14px" }}>
              No matches.
            </li>
          ) : null}
          {shown.map((hit, i) => (
            <li key={`${hit.kind}-${hit.path}-${hit.line ?? i}`}>
              <button
                type="button"
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
              >
                <span className="hit-kind">{hit.kind}</span>
                <span className="hit-path">
                  {hit.path}
                  {hit.line ? `:${hit.line}` : ""}
                </span>
                <span className="hit-preview">{hit.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
