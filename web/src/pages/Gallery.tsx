import { useMemo, useState } from "react";
import { api, vfsFileUrl } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

export function GalleryPage() {
  const { game, onClosed } = useStudio();
  const gallery = useAsync(() => api.gallery(), [game.opened_path], onClosed);
  const [selected, setSelected] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const items = useMemo(
    () => (gallery.data?.items ?? []).filter((it) => it.file),
    [gallery.data],
  );

  if (gallery.loading) {
    return (
      <div className="page">
        <LoadingState text="Hunting plates — the index may run first…" />
      </div>
    );
  }
  if (gallery.error) {
    return (
      <div className="page">
        <ErrorState error={gallery.error} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Plates</p>
          <h2>Gallery</h2>
          <p>
            Event art from image statements and heuristic folders. Items tagged heuristic were
            inferred from path, not from a Gallery() widget.
            {gallery.data?.gallery_mentioned ? " A Gallery() construct is mentioned in script." : ""}
          </p>
        </div>
        <span className="chip">{items.length} plates</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No plates in the folio"
          body="Nothing matched CG/event image names or heuristic folders such as cg/, ev/, or scene/."
        />
      ) : (
        <>
          <div className="filmstrip">
            <div className="sprockets top" />
            <div className="filmstrip-track">
              {items.slice(0, 40).map((item) => {
                const file = item.file as string;
                return (
                  <button
                    type="button"
                    className={`plate${selected === file ? " selected" : ""}`}
                    key={`strip-${file}-${item.name}`}
                    onClick={() => setSelected(file)}
                    onDoubleClick={() => setLightbox(file)}
                    title={file}
                  >
                    <img src={vfsFileUrl(file)} alt={item.name} loading="lazy" />
                    <span className="cap">{item.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="sprockets bot" />
          </div>

          <div className="gallery-grid">
            {items.map((item) => {
              const file = item.file as string;
              return (
                <button
                  type="button"
                  className="g-card"
                  key={`${file}-${item.name}`}
                  onClick={() => setLightbox(file)}
                >
                  <img src={vfsFileUrl(file)} alt={item.name} loading="lazy" />
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
        <button type="button" className="lightbox" onClick={() => setLightbox(null)}>
          <img src={vfsFileUrl(lightbox)} alt={lightbox} />
          <div className="lb-cap">{lightbox}</div>
        </button>
      ) : null}
    </div>
  );
}
