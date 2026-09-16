import { useEffect, useMemo, useRef, useState } from "react";
import { api, SessionClosedError, vfsFileUrl, type GalleryItem, type GalleryResponse, type IndexStatus } from "../api";
import { EmptyState, ErrorState } from "../components/State";
import {
  TRUTH_ROWS,
  matchPlate,
  parseFilter,
  type Ast,
  type FilterQuery,
  type Gate,
} from "../galleryFilter";
import { useStudio } from "../studio";

const VIDEO_RE = /\.(webm|mp4)$/i;

function isVideoPath(file: string): boolean {
  return VIDEO_RE.test(file);
}

function shortPath(path: string | null): string {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  if (norm.length <= 42) return norm;
  const parts = norm.split("/");
  if (parts.length < 3) return `…${norm.slice(-40)}`;
  return `…/${parts.slice(-2).join("/")}`;
}

function PlateMedia({ file, name, live = false }: { file: string; name: string; live?: boolean }) {
  const src = vfsFileUrl(file);
  if (isVideoPath(file)) {
    if (!live) {
      return (
        <span className="plate-film" aria-hidden="true">
          <span>reel</span>
        </span>
      );
    }
    return <video src={src} muted loop playsInline preload="metadata" autoPlay />;
  }
  return <img src={src} alt={name} loading="lazy" />;
}

function walkBeads(ast: Ast): { key: string; kind: "term" | "gate"; text: string; gate?: Gate }[] {
  if (ast.type === "term") {
    const prefix = ast.field === "ext" ? "ext:" : ast.field === "path" ? "path:" : "";
    return [{ key: `t:${ast.field}:${ast.raw}`, kind: "term", text: `${prefix}${ast.raw.replace(/!/g, "")}` }];
  }
  if (ast.type === "not") {
    return [{ key: "not", kind: "gate", text: "NOT", gate: "not" }, ...walkBeads(ast.inner)];
  }
  return [
    ...walkBeads(ast.left),
    { key: `g:${ast.op}`, kind: "gate", text: ast.op.toUpperCase(), gate: ast.op },
    ...walkBeads(ast.right),
  ];
}

function IndexRibbon({ status }: { status: IndexStatus | null }) {
  if (!status) {
    return (
      <div className="index-ribbon" role="status">
        <span className="lamp" />
        <span className="index-ribbon-copy">Opening the folio…</span>
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className="index-ribbon is-error" role="alert">
        <span className="index-ribbon-copy">
          Index stalled{status.error ? ` — ${status.error}` : ""}. Heuristic plates are still shown.
        </span>
      </div>
    );
  }
  if (status.state === "ready") {
    const fault = status.faults
      ? ` · ${status.faults} script${status.faults === 1 ? "" : "s"} unread`
      : "";
    return (
      <div className="index-ribbon is-ready" role="status">
        <span className="index-ribbon-copy">
          Index bound · {status.total} script{status.total === 1 ? "" : "s"}
          {fault}
        </span>
      </div>
    );
  }
  const known = status.total > 0;
  const pct = known ? Math.round((100 * status.done) / status.total) : 0;
  const label = known ? `Indexing ${status.done} / ${status.total}` : "Counting scripts…";
  return (
    <div
      className={`index-ribbon is-running${known ? "" : " is-indet"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? pct : undefined}
      aria-label={label}
    >
      <div className="index-ribbon-track" aria-hidden="true">
        <div className="index-ribbon-fill" style={known ? { width: `${pct}%` } : undefined} />
      </div>
      <span className="lamp" />
      <span className="index-ribbon-copy">
        {label}
        {status.current ? ` · ${shortPath(status.current)}` : ""}
        {status.total > 0 ? ` · ${pct}%` : ""}
      </span>
    </div>
  );
}

function TruthLedger({ open, gates, onToggle }: { open: boolean; gates: Set<Gate>; onToggle: () => void }) {
  return (
    <div className={`truth-ledger${open ? " is-open" : ""}`}>
      <button type="button" className="truth-ledger-toggle" onClick={onToggle} aria-expanded={open}>
        <span>Logic ledger</span>
        <span className="truth-ledger-keys">AND OR XOR NAND NOR XNOR NOT</span>
        <span className="truth-ledger-caret">{open ? "fold" : "open"}</span>
      </button>
      {open ? (
        <div className="truth-ledger-body">
          <table>
            <caption>Cheat sheet — 0 is miss, 1 is hit. Prefix a gate with ? to search for the word itself.</caption>
            <thead>
              <tr>
                <th>Gate</th>
                <th>Write</th>
                <th>0,0</th>
                <th>0,1</th>
                <th>1,0</th>
                <th>1,1</th>
              </tr>
            </thead>
            <tbody>
              {TRUTH_ROWS.map((row) => {
                const unary = row.cells.length === 2;
                return (
                  <tr key={row.gate} className={gates.has(row.gate) ? "is-live" : undefined}>
                    <th>{row.label}</th>
                    <td>
                      <code>{row.hint}</code>
                    </td>
                    {unary ? (
                      <>
                        <td>{row.cells[0]}</td>
                        <td className="is-void">—</td>
                        <td className="is-void">—</td>
                        <td>{row.cells[1]}</td>
                      </>
                    ) : (
                      row.cells.map((c, i) => <td key={i}>{c}</td>)
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="truth-hints">
            <li>
              <code>kind:</code> <code>type:</code> <code>ext:</code> <code>extension:</code> <code>file:</code> — file
              type
            </li>
            <li>
              <code>path:ex/ah</code> or <code>ah\ex</code> — slashes are the same
            </li>
            <li>
              <code>!AH!</code> — those letters must match case; the rest of a token does not
            </li>
            <li>
              <code>?and</code> / <code>?or?</code> — the word is a search term, not a gate
            </li>
            <li>Commas join clauses with AND. Adjacent words become one phrase.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function GalleryPage() {
  const { game, onClosed } = useStudio();
  const [payload, setPayload] = useState<GalleryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [hotFile, setHotFile] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const lightboxFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let haveItems = false;

    const tick = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, ms);
    };

    async function run() {
      try {
        if (!haveItems) {
          const data = await api.gallery();
          if (cancelled) return;
          setPayload(data);
          setError(null);
          haveItems = true;
          const state = data.index?.state;
          if (state === "running" || state === "idle") tick(450);
          return;
        }
        const status = await api.indexStatus();
        if (cancelled) return;
        setPayload((prev) => (prev ? { ...prev, index: status } : prev));
        setError(null);
        if (status.state === "running" || status.state === "idle") {
          tick(450);
          return;
        }
        const data = await api.gallery();
        if (cancelled) return;
        setPayload(data);
        if (data.index?.state === "running" || data.index?.state === "idle") tick(450);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof SessionClosedError) {
          onClosed();
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        tick(2000);
      }
    }

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [game.opened_path, onClosed]);

  const items = useMemo(
    () => (payload?.items ?? []).filter((it): it is GalleryItem & { file: string } => Boolean(it.file)),
    [payload],
  );
  const query: FilterQuery = useMemo(() => parseFilter(filter), [filter]);
  const filtered = useMemo(() => items.filter((it) => matchPlate(query, it)), [items, query]);
  const beads = useMemo(() => (query.ast ? walkBeads(query.ast) : []), [query]);

  useEffect(() => {
    if (selected && !filtered.some((it) => it.file === selected)) {
      setSelected(null);
    }
  }, [filtered, selected]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (lightbox) {
        if (e.key === "Escape") {
          e.preventDefault();
          setLightbox(null);
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lightboxFocusRef.current = prev;
    return () => {
      lightboxFocusRef.current?.focus();
      lightboxFocusRef.current = null;
    };
  }, [lightbox]);

  if (error && !payload) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  const indexing = payload?.index.state === "running" || payload?.index.state === "idle" || !payload;
  const countLabel = query.empty
    ? `${items.length} plates`
    : `${filtered.length} of ${items.length} plates`;
  const sieveCopy = query.empty
    ? "Type a gate query — names, kinds, and paths. The ledger below is the cheat sheet."
    : query.ast
      ? query.description
      : "Incomplete gate — add a term on both sides.";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Plates</p>
          <h2>Gallery</h2>
          <p>
            Event art from image statements and heuristic folders such as images/, cg/, ev/, and
            scene/. Under images/, navigation/ and icons/ are left out. Items tagged heuristic were
            inferred from path, not from a Gallery() widget.
            {payload?.gallery_mentioned ? " A Gallery() construct is mentioned in script." : ""}
            {indexing ? " Script statements join the folio as the index binds." : ""}
          </p>
        </div>
        <span className="chip">{countLabel}</span>
      </div>

      <IndexRibbon status={payload?.index ?? null} />

      <div className="gallery-sieve" role="search">
        <label htmlFor="gallery-filter">Sieve</label>
        <input
          id="gallery-filter"
          ref={filterRef}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (filter) {
                e.preventDefault();
                setFilter("");
              } else {
                filterRef.current?.blur();
              }
            }
          }}
          placeholder="char1 OR char2, kind:png or webm"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          aria-label="Filter plates with logic gates"
          aria-describedby="gallery-sieve-readout"
        />
        {filter ? (
          <button type="button" className="btn-ghost" onClick={() => setFilter("")}>
            Clear
          </button>
        ) : (
          <kbd className="sieve-hint">/</kbd>
        )}

        <p id="gallery-sieve-readout" className={`sieve-readout${query.empty ? " is-idle" : ""}`}>
          {sieveCopy}
        </p>

        {beads.length > 0 ? (
          <div className="sieve-terms" aria-hidden="true">
            {beads.map((bead, i) => (
              <span
                className={`sieve-bead sieve-bead-${bead.kind}${bead.gate && query.gates.has(bead.gate) ? " is-live" : ""}`}
                key={`${bead.key}-${i}`}
              >
                {bead.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <TruthLedger open={ledgerOpen} gates={query.gates} onToggle={() => setLedgerOpen((v) => !v)} />

      {items.length === 0 ? (
        <EmptyState
          title={indexing ? "The folio is still being bound" : "No plates in the folio"}
          body={
            indexing
              ? "Heuristic folders are empty so far. Image statements from script will appear as indexing finishes."
              : "Nothing matched CG/event image names or heuristic folders such as images/, cg/, ev/, or scene/."
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No plates match"
          body="Nothing in this folio satisfies that gate. Try a looser clause, or clear the sieve."
        />
      ) : (
        <>
          <div className="filmstrip">
            <div className="sprockets top" />
            <div className="filmstrip-track">
              {filtered.slice(0, 40).map((item) => {
                const file = item.file as string;
                return (
                  <button
                    type="button"
                    className={`plate${selected === file ? " selected" : ""}`}
                    key={`strip-${file}-${item.name}`}
                    onClick={() => setSelected(file)}
                    onDoubleClick={() => setLightbox(file)}
                    onMouseEnter={() => setHotFile(file)}
                    onMouseLeave={() => setHotFile((cur) => (cur === file ? null : cur))}
                    title={file}
                  >
                    <PlateMedia file={file} name={item.name} live={hotFile === file} />
                    <span className="cap">{item.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="sprockets bot" />
          </div>

          <div className="gallery-grid">
            {filtered.map((item) => {
              const file = item.file as string;
              return (
                <button
                  type="button"
                  className="g-card"
                  key={`${file}-${item.name}`}
                  onClick={() => setLightbox(file)}
                  onMouseEnter={() => setHotFile(file)}
                  onMouseLeave={() => setHotFile((cur) => (cur === file ? null : cur))}
                >
                  <PlateMedia file={file} name={item.name} live={hotFile === file} />
                  <div className="cap">
                    <strong>{item.name}</strong>
                    <span>{file}</span>
                    {item.origin === "heuristic" ? (
                      <span className="badge-heuristic">heuristic</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {lightbox ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox}
          onClick={() => setLightbox(null)}
        >
          <button type="button" className="lightbox-dismiss" onClick={() => setLightbox(null)}>
            Close
          </button>
          {isVideoPath(lightbox) ? (
            <video
              src={vfsFileUrl(lightbox)}
              controls
              autoPlay
              preload="auto"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img src={vfsFileUrl(lightbox)} alt={lightbox} />
          )}
          <div className="lb-cap">{lightbox}</div>
        </div>
      ) : null}
    </div>
  );
}
