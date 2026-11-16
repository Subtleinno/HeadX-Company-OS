export type ProjectRoute =
  | { kind: 'list' }
  | { kind: 'detail'; projectId: string }
  | { kind: 'invalid' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DesignApp 收到的是去掉 `/design` 之後的 hash 段。 */
export function parseProjectRoute(path: readonly string[]): ProjectRoute | null {
  if (path[0] !== 'create' || path[1] !== 'projects') return null;
  if (path.length === 2) return { kind: 'list' };

  const id = path[2];
  if (
    id === undefined ||
    !UUID.test(id) ||
    path.length > 4 ||
    (path.length === 4 && path[3] !== 'brief')
  ) {
    return { kind: 'invalid' };
  }

  return { kind: 'detail', projectId: id };
}
