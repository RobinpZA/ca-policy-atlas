/** First-visit pointer to Learn. Neutral rule, not the accent - the accent budget is spent. */
export function LearnIntro({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="notice notice-intro" role="status">
      <span>
        New to Conditional Access? Learn walks through each part of a policy, then lets you build
        one.
      </span>
      <button
        type="button"
        className="btn"
        style={{ marginLeft: 'auto', height: 24 }}
        onClick={onOpen}
      >
        Open Learn
      </button>
      <button type="button" className="btn btn-quiet" style={{ height: 24 }} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
