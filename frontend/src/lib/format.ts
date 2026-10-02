export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function sourceLocation(source: { page: number | null; section: string | null }): string | null {
  if (source.page != null) return `Page ${source.page}`;
  if (source.section) return source.section;
  return null;
}

/**
 * Turn inline citations like "[2]" into Markdown links "[2](#cite-2)" so the
 * Markdown renderer can show them as clickable badges. Only numbers that match
 * a known source are converted; existing links ("[2](...)") are left alone.
 */
export function linkCitations(markdown: string, sourceIds: number[]): string {
  const known = new Set(sourceIds);
  return markdown.replace(/\[(\d{1,2})\](?!\()/g, (match, n) =>
    known.has(Number(n)) ? `[${n}](#cite-${n})` : match,
  );
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}
