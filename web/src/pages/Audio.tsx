import { useMemo, useState } from "react";
import { api, formatBytes, vfsFileUrl } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

export function AudioPage() {
  const { game, onClosed } = useStudio();
  const audio = useAsync(() => api.audio(), [game.opened_path], onClosed);
  const [filter, setFilter] = useState("");
  const [current, setCurrent] = useState<string | null>(null);

  const items = audio.data?.items ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.path.toLowerCase().includes(q));
  }, [items, filter]);

  if (audio.loading) {
    return (
      <div className="page">
        <LoadingState text="Listening through the folio…" />
      </div>
    );
  }
  if (audio.error) {
    return (
      <div className="page">
        <ErrorState error={audio.error} />
      </div>
    );
  }

  const playing = items.find((it) => it.path === current) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Score</p>
          <h2>Audio</h2>
          <p>Music, sound, and voice leaves packed or loose in the virtual filesystem.</p>
        </div>
        <span className="chip">{items.length} leaves</span>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Silence" body="No audio files were found in the virtual folio." />
      ) : (
        <div className="audio-layout">
          <div>
            <div className="filter-row">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter paths…"
                spellCheck={false}
              />
            </div>
            <div className="audio-list">
              {filtered.map((item) => (
                <button
                  type="button"
                  key={item.path}
                  className={item.path === current ? "active" : ""}
                  onClick={() => setCurrent(item.path)}
                >
                  <span className="p" title={item.path}>
                    {item.path}
                  </span>
                  <span className="faint">{item.source}</span>
                  <span className="faint">{formatBytes(item.size)}</span>
                </button>
              ))}
            </div>
          </div>
          <aside className="player">
            {playing ? (
              <>
                <p className="kicker">Now playing</p>
                <h3>{leafName(playing.path)}</h3>
                <p className="mono muted">{playing.path}</p>
                <p className="muted">
                  {playing.source} · {formatBytes(playing.size)}
                </p>
                <audio key={playing.path} controls autoPlay src={vfsFileUrl(playing.path)} />
              </>
            ) : (
              <p className="muted">Choose a leaf from the list. Playback stays in this browser.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function leafName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
