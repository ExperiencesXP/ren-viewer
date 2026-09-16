import { useCallback, useEffect, useMemo, useState } from "react";
import { api, SessionClosedError, type GameInfo } from "./api";
import { Palette } from "./components/Palette";
import { LoadingState } from "./components/State";
import { AudioPage } from "./pages/Audio";
import { CharactersPage } from "./pages/Characters";
import { FilesPage } from "./pages/Files";
import { GalleryPage } from "./pages/Gallery";
import { OpenPage } from "./pages/Open";
import { OverviewPage } from "./pages/Overview";
import { ScriptsPage } from "./pages/Scripts";
import { StoryPage } from "./pages/Story";
import { PAGES, StudioContext, type PageId, type PaletteMode, type Studio } from "./studio";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [page, setPage] = useState<PageId>("overview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [highlightLabel, setHighlightLabel] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteMode | null>(null);

  const onClosed = useCallback(() => {
    setGame(null);
    setPage("overview");
    setSelectedFile(null);
    setSelectedScript(null);
    setHighlightLabel(null);
    setPalette(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then(async (h) => {
        if (cancelled) return;
        if (h.open) {
          const info = await api.game();
          if (!cancelled) setGame(info);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshGame = useCallback(async () => {
    try {
      const info = await api.game();
      setGame(info);
    } catch (err) {
      if (err instanceof SessionClosedError) onClosed();
      else throw err;
    }
  }, [onClosed]);

  const closeGame = useCallback(async () => {
    try {
      await api.close();
    } catch {
      /* still return to the catalog */
    }
    onClosed();
  }, [onClosed]);

  const studio: Studio | null = useMemo(() => {
    if (!game) return null;
    return {
      game,
      page,
      setPage,
      selectedFile,
      setSelectedFile,
      selectedScript,
      setSelectedScript,
      highlightLabel,
      setHighlightLabel,
      refreshGame,
      closeGame,
      onClosed,
      openPalette: (mode) => setPalette(mode),
    };
  }, [
    game,
    page,
    selectedFile,
    selectedScript,
    highlightLabel,
    refreshGame,
    closeGame,
    onClosed,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!game) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette("search");
      } else if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette("files");
      } else if (e.key === "Escape") {
        setPalette(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  if (booting) {
    return (
      <>
        <div className="grain" />
        <div className="vignette" />
        <div className="open-page">
          <LoadingState text="Lighting the lamp…" />
        </div>
      </>
    );
  }

  if (!game || !studio) {
    return (
      <>
        <div className="grain" />
        <div className="vignette" />
        <OpenPage onOpened={(info) => setGame(info)} bootError={bootError} />
      </>
    );
  }

  return (
    <StudioContext.Provider value={studio}>
      <div className="grain" />
      <div className="vignette" />
      <div className="shell">
        <nav className="nav">
          <div className="nav-brand">
            <h1>Ren-Viewer</h1>
            <p>Reading room</p>
          </div>
          <ul className="nav-list">
            {PAGES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={page === item.id ? "active" : ""}
                  onClick={() => setPage(item.id)}
                >
                  <span className="nav-num">{item.numeral}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="nav-foot">Local folio</div>
        </nav>
        <header className="topbar">
          <div className="topbar-title">
            <h2>{game.name}</h2>
            <p>{game.opened_path}</p>
          </div>
          <div className="topbar-meta">
            <span className="chip chip-gold">
              {game.engine_family}
              {game.engine_vc != null ? ` ${game.engine_vc}` : ""}
            </span>
            {game.python_major != null ? (
              <span className="chip">py{game.python_major}</span>
            ) : null}
            <button type="button" className="search-btn" onClick={() => setPalette("search")}>
              <span>Search the folio</span>
              <kbd>Ctrl+K</kbd>
            </button>
            <button type="button" className="btn" onClick={() => void closeGame()}>
              Close
            </button>
          </div>
        </header>
        <main className="main">{renderPage(page)}</main>
        <footer className="status">
          <span>{game.gamedir}</span>
          <span>overlay {game.overlay}</span>
        </footer>
      </div>
      {palette ? <Palette mode={palette} onClose={() => setPalette(null)} /> : null}
    </StudioContext.Provider>
  );
}

function renderPage(page: PageId) {
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "files":
      return <FilesPage />;
    case "scripts":
      return <ScriptsPage />;
    case "story":
      return <StoryPage />;
    case "characters":
      return <CharactersPage />;
    case "gallery":
      return <GalleryPage />;
    case "audio":
      return <AudioPage />;
  }
}
