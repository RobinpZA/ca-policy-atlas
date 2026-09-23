import { useMemo } from 'react';
import { diffSelection } from '../../domain/diff/diffSelection.ts';
import {
  exportCsv,
  exportFileName,
  exportMarkdown,
  type ExportFormat,
} from '../../domain/diff/exportDiff.ts';
import { useSelectedPolicies } from '../../state/appState.tsx';

/** Byte-order mark, so Excel opens the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/**
 * Save the current comparison as a file.
 *
 * A Blob and an object URL: the file is built and saved entirely in this browser, like
 * everything else here. Loaded tenant policies ARE included - the person exporting is
 * the person who loaded them, and the file goes nowhere but their own disk.
 */
export function ExportButtons() {
  const selected = useSelectedPolicies();
  const diff = useMemo(() => diffSelection(selected), [selected]);
  const disabled = selected.length === 0;

  function save(format: ExportFormat) {
    const now = new Date();
    // The BOM is for Excel, which otherwise reads UTF-8 CSV as ANSI and mangles ⟨any⟩.
    const text =
      format === 'csv' ? BOM + exportCsv(selected, diff) : exportMarkdown(selected, diff, now);
    const blob = new Blob([text], {
      type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(format, now);
    a.click();
    // Revoked a tick later: some browsers start the download asynchronously.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="header-group">
      <span className="filter-legend" aria-hidden="true">
        Export
      </span>
      <div className="toggle-group" role="group" aria-label="Export this comparison">
        <button
          type="button"
          className="btn"
          disabled={disabled}
          title="Save this comparison as CSV"
          onClick={() => save('csv')}
        >
          CSV
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled}
          title="Save this comparison as Markdown"
          onClick={() => save('md')}
        >
          Markdown
        </button>
      </div>
    </div>
  );
}
