import { api } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

export function CharactersPage() {
  const { game, onClosed, setPage, setSelectedScript } = useStudio();
  const idx = useAsync(() => api.index(), [game.opened_path], onClosed);

  if (idx.loading) {
    return (
      <div className="page">
        <LoadingState text="Indexing scripts — this can take a while on large volumes…" />
      </div>
    );
  }
  if (idx.error) {
    return (
      <div className="page">
        <ErrorState error={idx.error} />
      </div>
    );
  }

  const characters = idx.data?.characters ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Dramatis personae</p>
          <h2>Characters</h2>
          <p>
            Definitions gathered from <span className="mono">Character()</span> and{" "}
            <span className="mono">DynamicCharacter()</span> in the decompiled scripts.
          </p>
        </div>
        <span className="chip">{characters.length} indexed</span>
      </div>

      {characters.length === 0 ? (
        <EmptyState
          title="An empty cast list"
          body="No Character() definitions were found in the index. They may be constructed at runtime, or decompile may have failed."
        />
      ) : (
        <div className="card-grid">
          {characters.map((ch, i) => (
            <article className="char-card" key={`${ch.store_name}-${ch.file ?? i}`}>
              <div className="who">{ch.display_name || ch.store_name}</div>
              <div className="store">{ch.store_name}</div>
              <div className="meta">
                {ch.kind}
                {ch.image_tag ? ` · image ${ch.image_tag}` : ""}
                {ch.file ? (
                  <>
                    <br />
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: 0 }}
                      onClick={() => {
                        const file = ch.file;
                        if (!file) return;
                        setSelectedScript(file);
                        setPage("scripts");
                      }}
                    >
                      {ch.file}
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
