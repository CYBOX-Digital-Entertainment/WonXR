export function parseFiniteNumber(value: string | null, fallback: number) {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readNumberParam(params: URLSearchParams, name: string, fallback: number) {
  return parseFiniteNumber(params.get(name), fallback);
}

export function readUnitNumberParam(params: URLSearchParams, name: string, fallback: number) {
  const value = readNumberParam(params, name, fallback);
  return Math.min(Math.max(value, 0), 1);
}

export function readNonNegativeNumberParam(params: URLSearchParams, name: string, fallback: number) {
  return Math.max(readNumberParam(params, name, fallback), 0);
}
