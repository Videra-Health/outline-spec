import { reqName, writeOutline, type Node, type Spec } from './outline.js';
import { writeTable } from './table.js';

export type FoundItem = { node: Node; depth: number; row?: string[] };

/** Finds an item by `Requirement name[.label...][.row-id]` or `label[.label...][.row-id]`; names may contain dots, so the longest match wins. */
export function findItem(spec: Spec, itemPath: string): FoundItem {
  const named = spec.items
    .filter((n) => itemPath === reqName(n.text) || itemPath.startsWith(`${reqName(n.text)}.`))
    .sort((a, b) => reqName(b.text).length - reqName(a.text).length)[0];
  let node: Node | undefined = named;
  let rest = named ? itemPath.slice(reqName(named.text).length + 1) : itemPath;
  if (!node) {
    const [first, ...more] = itemPath.split('.');
    node = spec.items.find((n) => n.label === first);
    rest = more.join('.');
  }
  if (!node) throw new Error(`No requirement or label "${itemPath.split('.')[0]}" in ${spec.name}`);
  let depth = 0;
  const labels = rest ? rest.split('.') : [];
  for (let i = 0; i < labels.length; i++) {
    const child: Node | undefined = node.children.find((c) => c.label === labels[i]);
    if (!child) {
      // Ids may contain dots, so the rest of the path is one row id.
      const id = labels.slice(i).join('.');
      const row = node.table?.rows.find((r) => r[0] === id);
      if (row) return { node, depth, row };
      throw new Error(`No item "${labels[i]}" under ${node.label}. in ${spec.name} (looking for ${itemPath})`);
    }
    node = child;
    depth++;
  }
  return { node, depth };
}

/** A row as `{ column: cell }`. */
export function rowObject(found: FoundItem): Record<string, string> {
  const columns = found.node.table?.columns ?? [];
  return Object.fromEntries(columns.map((c, i) => [c, found.row?.[i] ?? '']));
}

export function writeItem(found: FoundItem): string {
  if (found.row) return writeTable({ columns: found.node.table!.columns, rows: [found.row] }, '').join('\n');
  return writeOutline([found.node], found.depth).join('\n');
}
