export function getString(value: unknown): string {
  if (typeof value === 'string') return value;

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  throw new Error('Expected string parameter');
}

export function getOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

export function getNumber(value: unknown, fallback = 0): number {
  const str = getOptionalString(value);

  if (!str) return fallback;

  const n = Number(str);

  return Number.isFinite(n) ? n : fallback;
}