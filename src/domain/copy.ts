/** Domain data is JSON-compatible; return detached snapshots at repository boundaries. */
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
