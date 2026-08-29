import { useEffect, useState } from "react";
import {
  api,
  formatBytes,
  hexDump,
  SessionClosedError,
  vfsFileUrl,
  type StatResponse,
  type VfsNode,
} from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useStudio } from "../studio";

type Branch = {
  nodes: VfsNode[];
  loading: boolean;
  error: string | null;
  open: boolean;
};

export function FilesPage() {
  const { selectedFile, setSelectedFile, setPage, setSelectedScript, onClosed, game } = useStudio();
  const [root, setRoot] = useState<Branch>({ nodes: [], loading: true, error: null, open: true });
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [stat, setStat] = useState<StatResponse | null>(null);
  const [statErr, setStatErr] = useState<string | null>(null);
  const [statLoading, setStatLoading] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [hexPreview, setHexPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .tree("")
      .then((res) => {
        if (!cancelled) setRoot({ nodes: res.nodes, loading: false, error: null, open: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionClosedError) {
          onClosed();
          return;
        }
        setRoot({
          nodes: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          open: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [game.opened_path, onClosed]);

  useEffect(() => {
    if (!selectedFile) {
      setStat(null);
      setTextPreview(null);
      setHexPreview(null);
      return;
    }
    let cancelled = false;
    setStatLoading(true);
    setStatErr(null);
    setTextPreview(null);
    setHexPreview(null);
    api
      .stat(selectedFile)
      .then(async (info) => {
        if (cancelled) return;
        setStat(info);
        const kind = info.kind;
        const compiled = /\.(rpyc|rpymc)$/i.test(selectedFile);
        const previewableText =
          !compiled && (kind === "text" || kind === "script" || info.mime.startsWith("text/"));
        if (previewableText && info.size <= 750_000) {
          const res = await fetch(vfsFileUrl(selectedFile));
          if (res.status === 409) throw new SessionClosedError();
          if (!res.ok) throw new Error(`Preview failed (${res.status})`);
          const text = await res.text();
          if (!cancelled) setTextPreview(text.slice(0, 80_000));
        } else if (
          (kind === "binary" || kind === "script" || kind === "archive" || kind === "cache") &&
          info.size <= 2_000_000
        ) {
          const res = await fetch(vfsFileUrl(selectedFile));
          if (res.status === 409) throw new SessionClosedError();
          if (!res.ok) throw new Error(`Preview failed (${res.status})`);
          const buf = new Uint8Array(await res.arrayBuffer());
          if (!cancelled) setHexPreview(hexDump(buf, 2048));
        }
        if (!cancelled) setStatLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionClosedError) {
          onClosed();
          return;
        }
        setStatErr(err instanceof Error ? err.message : String(err));
        setStatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFile, onClosed]);

  async function toggleDir(path: string) {
    const existing = branches[path];
    if (existing) {
      setBranches((prev) => ({ ...prev, [path]: { ...existing, open: !existing.open } }));
      if (existing.nodes.length || existing.loading) return;
    } else {
      setBranches((prev) => ({
        ...prev,
        [path]: { nodes: [], loading: true, error: null, open: true },
      }));
    }
    try {
      const res = await api.tree(path);
      setBranches((prev) => ({
        ...prev,
        [path]: { nodes: res.nodes, loading: false, error: null, open: true },
      }));
    } catch (err) {
      if (err instanceof SessionClosedError) {
        onClosed();
        return;
      }
      setBranches((prev) => ({
        ...prev,
        [path]: {
          nodes: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          open: true,
        },
      }));
    }
  }

  const q = filter.trim().toLowerCase();

  function renderNodes(nodes: VfsNode[], depth: number) {
    const visible = q
      ? nodes.filter((n) => n.is_dir || n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
      : nodes;
    return visible.map((node) => {
      const branch = branches[node.path];
      return (
        <div key={node.path}>
          <button
            type="button"
            className={`tree-row${selectedFile === node.path ? " selected" : ""}`}
            style={{ paddingLeft: 6 + depth * 8 }}
            onClick={() => {
              if (node.is_dir) void toggleDir(node.path);
              else setSelectedFile(node.path);
            }}
            title={node.path}
          >
            <span className="tree-twisty">
              {node.is_dir ? (branch?.open ? "▾" : "▸") : "·"}
            </span>
            <span className="tree-kind">{iconFor(node)}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
            {!node.is_dir ? <span className="faint">{formatBytes(node.size)}</span> : null}
          </button>
          {node.is_dir && branch?.open ? (
            <div className="tree-children">
              {branch.loading ? <div className="muted" style={{ padding: "4px 8px" }}>…</div> : null}
              {branch.error ? <ErrorState error={branch.error} /> : null}
              {branch.nodes.length ? renderNodes(branch.nodes, depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div className="split-3">
      <div className="pane">
        <div className="pane-head">
          <h3>Folio</h3>
          <span className="faint">{formatIntSafe(root.nodes.length)} roots</span>
        </div>
        <div className="filter-row">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter this pane…"
            spellCheck={false}
          />
        </div>
        {root.loading ? <LoadingState text="Reading the tree…" /> : null}
        {root.error ? <ErrorState error={root.error} /> : null}
        <div className="tree">{renderNodes(root.nodes, 0)}</div>
      </div>
      <div className="pane preview">
        {!selectedFile ? (
          <EmptyState
            title="Select a leaf"
            body="The center pane shows pictures, sound, motion, text, or a hex plate depending on what the file actually is — extensions often lie."
          />
        ) : (
          <>
            <div className="editor-toolbar">
              <span className="path">{selectedFile}</span>
              {stat && (stat.kind === "script" || selectedFile.match(/\.rpy/i)) ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSelectedScript(selectedFile);
                    setPage("scripts");
                  }}
                >
                  Open in Scripts
                </button>
              ) : null}
            </div>
            {statLoading ? (
              <div className="preview-stage">
                <LoadingState text="Sniffing the leaf…" />
              </div>
            ) : null}
            {statErr ? <ErrorState error={statErr} /> : null}
            {stat && !statLoading ? <Preview stat={stat} text={textPreview} hex={hexPreview} /> : null}
          </>
        )}
      </div>
      <div className="pane inspector">
        <div className="pane-head">
          <h3>Inspector</h3>
        </div>
        {!stat ? (
          <p className="muted">Layer, archive, offset and size appear once a file is chosen.</p>
        ) : (
          <dl>
            <dt>Path</dt>
            <dd>{stat.path}</dd>
            <dt>Kind</dt>
            <dd>
              {stat.kind}
              {stat.sniffed ? ` · ${stat.sniffed}` : ""}
            </dd>
            <dt>MIME</dt>
            <dd>{stat.mime}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(stat.size)}</dd>
            <dt>Layer</dt>
            <dd>{stat.source.layer}</dd>
            <dt>Archive</dt>
            <dd>{stat.source.archive ?? "—"}</dd>
            <dt>Offset</dt>
            <dd>
              {stat.source.offset != null ? `0x${stat.source.offset.toString(16)} (${stat.source.offset})` : "—"}
            </dd>
            <dt>Stored path</dt>
            <dd>{stat.source.path || "—"}</dd>
            <dt>Disk</dt>
            <dd>{stat.source.disk_path ?? "—"}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function formatIntSafe(n: number): string {
  return n.toLocaleString();
}

function iconFor(node: VfsNode): string {
  if (node.is_dir) return "▣";
  switch (node.kind) {
    case "image":
      return "◈";
    case "audio":
      return "♪";
    case "video":
      return "▷";
    case "script":
      return "¶";
    case "font":
      return "Aa";
    default:
      return "·";
  }
}

function Preview({
  stat,
  text,
  hex,
}: {
  stat: StatResponse;
  text: string | null;
  hex: string | null;
}) {
  const url = vfsFileUrl(stat.path);
  if (stat.kind === "image" || stat.mime.startsWith("image/")) {
    return (
      <div className="preview-stage">
        <img src={url} alt={stat.path} />
      </div>
    );
  }
  if (stat.kind === "audio" || stat.mime.startsWith("audio/")) {
    return (
      <div className="preview-stage">
        <audio key={url} controls src={url} />
      </div>
    );
  }
  if (stat.kind === "video" || stat.mime.startsWith("video/")) {
    return (
      <div className="preview-stage">
        <video key={url} controls src={url} />
      </div>
    );
  }
  if (text != null) {
    return (
      <div className="preview-stage" style={{ placeItems: "stretch", display: "block" }}>
        <pre className="preview-text">{text}</pre>
      </div>
    );
  }
  if (hex != null) {
    return (
      <div className="preview-stage" style={{ placeItems: "stretch", display: "block" }}>
        <pre className="hex">{hex}</pre>
      </div>
    );
  }
  return (
    <div className="preview-stage">
      <p className="muted">
        {formatBytes(stat.size)} · {stat.kind}
        {stat.sniffed ? ` · ${stat.sniffed}` : ""} — too large or unsuitable for an inline plate.
      </p>
    </div>
  );
}
