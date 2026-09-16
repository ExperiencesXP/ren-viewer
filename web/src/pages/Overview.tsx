import { FormEvent, useState } from "react";
import { api, formatBytes, formatInt, SessionClosedError } from "../api";
import { ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

export function OverviewPage() {
  const { game, refreshGame, onClosed } = useStudio();
  const extras = useAsync(() => api.extrasChr(), [game.opened_path], onClosed);
  const [dest, setDest] = useState(game.basedir || game.overlay || "");
  const [filename, setFilename] = useState("z_renviewer.rpa");
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function onExport(e: FormEvent) {
    e.preventDefault();
    setExporting(true);
    setExportErr(null);
    setExportMsg(null);
    try {
      const result = await api.exportRpa(dest.trim(), filename.trim() || "z_renviewer.rpa");
      setExportMsg(`Bound overlay to ${result.path}`);
      await refreshGame();
    } catch (err) {
      if (err instanceof SessionClosedError) {
        onClosed();
        return;
      }
      setExportErr(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  const counts = game.counts;
  const family = game.engine_family || "unknown";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Colophon</p>
          <h2>{game.name || "Untitled volume"}</h2>
          <p>
            {family}
            {game.engine_vc != null ? ` ${game.engine_vc}` : ""}
            {game.python_major != null ? ` · Python ${game.python_major}` : ""}
            {game.launcher ? " · launcher present" : ""}
            {game.is_lone_archive ? " · lone archive" : ""}
          </p>
        </div>
      </div>

      {game.is_lone_archive ? (
        <div className="banner">
          This session opened a single archive rather than a full game tree. Paths are those packed
          inside the volume.
        </div>
      ) : null}

      <div className="stats">
        {(
          [
            ["Files", counts.files],
            ["Images", counts.images],
            ["Audio", counts.audio],
            ["Video", counts.video],
            ["Scripts", counts.scripts],
            ["Fonts", counts.fonts],
            ["Other", counts.other],
          ] as const
        ).map(([label, n]) => (
          <div className="stat" key={label}>
            <div className="n">{formatInt(n)}</div>
            <div className="l">{label}</div>
          </div>
        ))}
      </div>

      <dl className="identity">
        <div>
          <dt>Opened</dt>
          <dd>{game.opened_path}</dd>
          <dt>Base directory</dt>
          <dd>{game.basedir}</dd>
          <dt>Game directory</dt>
          <dd>{game.gamedir}</dd>
        </div>
        <div>
          <dt>Overlay workspace</dt>
          <dd>{game.overlay}</dd>
          <dt>Languages</dt>
          <dd>{game.languages.length ? game.languages.join(", ") : "—"}</dd>
          <dt>Archives</dt>
          <dd>{formatInt(game.archives.length)} bound volume{game.archives.length === 1 ? "" : "s"}</dd>
        </div>
      </dl>

      <div className="section">
        <h3>Archives</h3>
        {game.archives.length === 0 ? (
          <p className="muted">No packed archives in this layout — loose files only.</p>
        ) : (
          <table className="catalog">
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Key</th>
                <th>Files</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {game.archives.map((arch) => (
                <tr key={arch.path ?? arch.name}>
                  <td className="mono">{arch.name}</td>
                  <td>{arch.version}</td>
                  <td className="mono">{arch.key ?? "—"}</td>
                  <td>{formatInt(arch.file_count)}</td>
                  <td>{formatBytes(arch.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {extras.loading ? <LoadingState text="Checking extras…" /> : null}
      {extras.error ? <ErrorState error={extras.error} /> : null}
      {extras.data && extras.data.items.length > 0 ? (
        <div className="section">
          <h3>Character extras</h3>
          <p className="muted">
            Loose <span className="mono">.chr</span> files beside the game (not part of the engine
            VFS). Shown only when present.
          </p>
          <div className="chr-list" style={{ marginTop: 12 }}>
            {extras.data.items.map((item) => (
              <div className="chr-item" key={item.path}>
                <div className="nm">{item.name}</div>
                <div className="muted">{item.note}</div>
                <div className="faint mono">
                  {item.sniffed} · {item.mime}
                </div>
                {item.decoded_text ? <pre className="preview-text">{item.decoded_text}</pre> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section">
        <h3>Export overlay</h3>
        <p className="muted">
          Bind the current overlay workspace into an RPA the engine will load last (name it so it
          sorts after other archives).
        </p>
        <form className="export-row" onSubmit={(e) => void onExport(e)} style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="export-dest">Destination</label>
            <input
              id="export-dest"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              spellCheck={false}
              placeholder="Folder or full file path"
            />
          </div>
          <div className="field" style={{ flex: "0 0 200px" }}>
            <label htmlFor="export-name">Filename</label>
            <input
              id="export-name"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              spellCheck={false}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={exporting || !dest.trim()}>
            {exporting ? "Binding…" : "Export RPA"}
          </button>
        </form>
        {exportMsg ? <p className="muted" style={{ marginTop: 10 }}>{exportMsg}</p> : null}
        {exportErr ? <ErrorState error={exportErr} /> : null}
      </div>
    </div>
  );
}
