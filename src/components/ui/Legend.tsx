/**
 * The legend is not decoration. The diff encoding is deliberately hue-free, which makes
 * it precise but not self-evident, so the key has to be on screen.
 */
export function Legend() {
  return (
    <div className="legend" aria-label="How differences are marked">
      <span className="legend-item">
        <span className="legend-bar thin" aria-hidden="true" />
        not in every column
      </span>
      <span className="legend-item">
        <span className="legend-bar mid" aria-hidden="true" />
        differs
      </span>
      <span className="legend-item">
        <span className="legend-bar" aria-hidden="true" />
        only here / conflict
      </span>
      <span className="legend-item">
        <span className="legend-ghost" aria-hidden="true" />
        not specified
      </span>
    </div>
  );
}
