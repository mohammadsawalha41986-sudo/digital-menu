'use client';

/**
 * The one interactive element on the printable page, and it hides itself when
 * printing. Everything else is paper.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="print__action" onClick={() => window.print()}>
      {label}
    </button>
  );
}
