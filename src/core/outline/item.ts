import { reqName, writeOutline, type Node, type Spec } from './outline.js';

/** Finds an item by `Requirement name[.label...]` or `label[.label...]`; names may contain dots, so the longest match wins. */
export function findItem(spec: Spec, itemPath: string): { node: Node; depth: number } {
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
  for (const label of rest ? rest.split('.') : []) {
    const child: Node | undefined = node.children.find((c) => c.label === label);
    if (!child) throw new Error(`No item "${label}" under ${node.label}. in ${spec.name} (looking for ${itemPath})`);
    node = child;
    depth++;
  }
  return { node, depth };
}

export function writeItem(found: { node: Node; depth: number }): string {
  return writeOutline([found.node], found.depth).join('\n');
}
