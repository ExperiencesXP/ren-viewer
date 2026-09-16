export function LoadingState({ text = "Gathering pages…" }: { text?: string }) {
  return (
    <div className="progress" role="status">
      <span className="lamp" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorState({ error }: { error: string }) {
  return (
    <div className="state error" role="alert">
      {error}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="state empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
