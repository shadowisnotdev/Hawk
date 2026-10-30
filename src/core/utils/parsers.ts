/**
 * Universal Parsing Helpers for Time, Durations, and Currency
 */

const TIME_UNIT_FACTORS: Record<string, number> = {
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  mo: 2_592_000_000,
  month: 2_592_000_000,
  months: 2_592_000_000,
  y: 31_536_000_000,
  year: 31_536_000_000,
  years: 31_536_000_000,
};

/**
 * Parses compact time strings like "10s", "15m", "1h30m", "2d12h", "1w" into milliseconds.
 * Returns null if the format is invalid or non-positive.
 */
export function parseTime(input: string): number | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) return null;

  // Ensure entire string consists only of valid (number + unit) segments
  if (!/^(\d+(?:\.\d+)?\s*[a-z]+\s*)+$/.test(trimmed)) {
    return null;
  }

  // Match composite tokens like "1h30m", "2d", "45s", "10m30s"
  const regex = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let match: RegExpExecArray | null;
  let totalMs = 0;
  let matchedAny = false;

  while ((match = regex.exec(trimmed)) !== null) {
    matchedAny = true;
    const value = parseFloat(match[1]);
    const unit = match[2];
    const factor = TIME_UNIT_FACTORS[unit];

    if (!factor || isNaN(value) || value < 0) {
      return null;
    }

    totalMs += value * factor;
  }

  if (!matchedAny || totalMs <= 0 || !isFinite(totalMs)) {
    return null;
  }

  return Math.round(totalMs);
}

/**
 * Formats a duration in milliseconds into a concise readable string (e.g. "1h 30m", "2d 4h").
 */
export function formatTime(ms: number): string {
  if (ms <= 0) return '0s';

  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && days === 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Parses scientific, shorthand, and standard numeric currency inputs.
 * Supports:
 * - Direct numbers: "500", "1000.5"
 * - Scientific notation: "1e6" -> 1,000,000, "2.5e4" -> 25,000
 * - Suffixes: "k" / "K" (1,000), "m" / "M" (1,000,000), "b" / "B" (1,000,000,000), "t" / "T" (1,000,000,000,000)
 * - Comma formatting: "1,000,000"
 */
export function parseCurrency(input: string): number | null {
  if (!input || typeof input !== 'string') return null;

  const cleaned = input.trim().replace(/,/g, '');
  if (!cleaned) return null;

  // 1. Scientific notation check (e.g., "1e6", "2.5e3")
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(cleaned)) {
    const num = Number(cleaned);
    return isFinite(num) && !isNaN(num) && num >= 0 ? num : null;
  }

  // 2. Shorthand suffix check (e.g., "5k", "2.5m", "1b", "10t")
  const suffixMatch = /^([+-]?\d+(?:\.\d+)?)\s*([kmbt])$/i.exec(cleaned);
  if (suffixMatch) {
    const base = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2].toLowerCase();
    let multiplier = 1;
    switch (suffix) {
      case 'k':
        multiplier = 1_000;
        break;
      case 'm':
        multiplier = 1_000_000;
        break;
      case 'b':
        multiplier = 1_000_000_000;
        break;
      case 't':
        multiplier = 1_000_000_000_000;
        break;
    }
    const val = base * multiplier;
    return isFinite(val) && !isNaN(val) && val >= 0 ? val : null;
  }

  // 3. Plain floating-point or integer number
  if (/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
    const val = parseFloat(cleaned);
    return isFinite(val) && !isNaN(val) && val >= 0 ? val : null;
  }

  return null;
}

