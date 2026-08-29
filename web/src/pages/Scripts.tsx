import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { api, SessionClosedError } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

export function ScriptsPage() {
  const { selectedScript, setSelectedScript, onClosed, game } = useStudio();
  const list = useAsync(() => api.scripts(), [game.opened_path], onClosed);
  const [filter, setFilter] = useState("");
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [decompErr, setDecompErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const scripts = list.data?.scripts ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((p) => p.toLowerCase().includes(q));
  }, [scripts, filter]);

  useEffect(() => {
    if (!selectedScript && scripts.length) {
      setSelectedScript(scripts[0]);
    }
  }, [scripts, selectedScript, setSelectedScript]);

  useEffect(() => {
    if (!selectedScript) return;
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    setDecompErr(null);
    setSaveMsg(null);
    api
      .scriptContent(selectedScript)
      .then((res) => {
        if (cancelled) return;
        setText(res.text);
        setOriginal(res.text);
        setDecompErr(res.error ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SessionClosedError) {
          onClosed();
          return;
        }
        setLoadErr(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedScript, onClosed]);

  const dirty = text !== original;

  async function save() {
    if (!selectedScript) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.overlay(selectedScript, text);
      setOriginal(text);
      setSaveMsg("Written to overlay.");
    } catch (err) {
      if (err instanceof SessionClosedError) {
        onClosed();
        return;
      }
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="split-2">
      <div className="pane">
        <div className="pane-head">
          <h3>Manuscripts</h3>
          <span className="faint">{scripts.length}</span>
        </div>
        <div className="filter-row">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter paths…"
            spellCheck={false}
          />
        </div>
        {list.loading ? <LoadingState text="Listing scripts…" /> : null}
        {list.error ? <ErrorState error={list.error} /> : null}
        {!list.loading && scripts.length === 0 ? (
          <EmptyState
            title="No scripts"
            body="Nothing with a Ren'Py script extension (or _ren.py) is in the virtual folio."
          />
        ) : (
          <ul className="script-list">
            {filtered.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className={path === selectedScript ? "active" : ""}
                  onClick={() => {
                    if (dirty && !window.confirm("Discard unsaved overlay edits?")) return;
                    setSelectedScript(path);
                  }}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="editor-wrap">
        {!selectedScript ? (
          <EmptyState title="Choose a script" body="Decompiled text appears here. Save writes an overlay leaf, never the original archive." />
        ) : (
          <>
            <div className="editor-toolbar">
              <span className="path">
                {selectedScript}
                {dirty ? " · unsaved" : ""}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {saveMsg ? <span className="muted">{saveMsg}</span> : null}
                <button className="btn btn-primary" type="button" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save overlay"}
                </button>
              </div>
            </div>
            {decompErr ? (
              <div className="decompile-warn">Decompile note: {decompErr}</div>
            ) : null}
            {loadErr ? <ErrorState error={loadErr} /> : null}
            {loading ? (
              <div style={{ padding: 16 }}>
                <LoadingState text="Unsealing the script…" />
              </div>
            ) : (
              <div className="editor-body">
                <Editor
                  height="100%"
                  theme="folio"
                  language="python"
                  value={text}
                  onChange={(value) => setText(value ?? "")}
                  options={{
                    fontFamily: '"IBM Plex Mono", ui-monospace, Consolas, monospace',
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    renderLineHighlight: "line",
                    padding: { top: 8 },
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
