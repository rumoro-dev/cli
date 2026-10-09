type Row = Record<string, unknown>;
const isScalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);
const cell = (value: unknown) => {
  if (value === null) return "";
  if (typeof value === "string") return value.length > 48 ? `${value.slice(0, 47)}…` : value.replace(/\s+/g, " ");
  return String(value);
};

/** Up to eight scalar columns of the first row; other values as JSON. */
export function renderTable(rows: Row[]) {
  const first = rows[0];
  if (!first) return "(no rows)";
  const columns = Object.keys(first).filter((key) => isScalar(first[key])).slice(0, 8);
  if (columns.length === 0) return JSON.stringify(rows, null, 2);
  const lines = rows.map((row) => columns.map((column) => cell(isScalar(row[column]) ? row[column] : JSON.stringify(row[column]))));
  const widths = columns.map((column, i) => Math.max(column.length, ...lines.map((line) => line[i]?.length ?? 0)));
  const header = columns.map((column, i) => column.padEnd(widths[i] ?? column.length)).join("  ");
  const rule = widths.map((width) => "-".repeat(width)).join("  ");
  return [header, rule, ...lines.map((line) => line.map((text, i) => text.padEnd(widths[i] ?? text.length)).join("  "))].join("\n");
}

export function formatOutput(value: unknown, options: { pretty: boolean; table: boolean }) {
  if (options.table) {
    const rows = Array.isArray(value) ? value
      : value !== null && typeof value === "object" && Array.isArray((value as Row).data) ? (value as { data: unknown[] }).data : null;
    if (rows && rows.every((row) => row !== null && typeof row === "object")) return renderTable(rows as Row[]);
  }
  return options.pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
