import Fuse from 'fuse.js';

/**
 * Layered name matcher — priority order:
 *  1. Exact case-insensitive
 *  2. Full-name starts-with query
 *  3. All query words each start a word in the target name (word-prefix)
 *  4. All query words appear anywhere in the target name (word-contains)
 *  5. Fuse.js fuzzy (last resort, tight threshold + ambiguity check)
 *
 * When a layer returns multiple candidates, the one with the shortest name
 * wins (most specific match). This correctly handles:
 *  "mod"     → Moderator  (not Trial Moderator or Senior Moderator)
 *  "t mod"   → Trial Moderator
 *  "hangout5" → Hangout 5  (via normalized matching injected before fuzzy)
 */

export interface MatchItem {
  id: string;
  name: string;
}

export type MatchResult<T extends MatchItem> =
  | { outcome: 'resolved'; item: T }
  | { outcome: 'not_found' }
  | { outcome: 'ambiguous'; candidates: T[] };

const WORD_SPLIT_RE = /[\s\-_]+/;

function getName(item: MatchItem): string {
  return item.name.toLowerCase();
}

function wordSplit(str: string): string[] {
  return str.split(WORD_SPLIT_RE).filter(Boolean);
}

/** Strips everything except lowercase alphanumeric. "Hangout 5" → "hangout5" */
function normalizeCompact(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickShortest<T extends MatchItem>(items: T[]): T {
  return items.sort((a, b) => a.name.length - b.name.length)[0];
}

/**
 * 3-Tier Progressive Character-by-Character Match Evaluator.
 * Dynamically tests whether each character in query appears in sequence in the target name.
 * Characters match progressively; candidates failing sequential character checks are eliminated.
 *
 * Example:
 *  - Searching "hangout" and "hana" with query "hng":
 *    'h' matches both.
 *    'n' matches both.
 *    'g' matches 'hangout' but fails on 'hana'.
 *    Returns highest-scoring matching candidate.
 */
export function progressiveCharMatchScore(targetName: string, query: string): number {
  const target = targetName.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return -1;

  let targetIdx = 0;
  let score = 0;
  let consecutive = 0;
  let prevPos = -1;

  for (let i = 0; i < q.length; i++) {
    const char = q[i];
    const foundPos = target.indexOf(char, targetIdx);
    if (foundPos === -1) {
      return -1; // Sequential character match failed
    }

    // Word start bonus
    const isWordStart = foundPos === 0 || WORD_SPLIT_RE.test(target[foundPos - 1]);
    if (isWordStart) {
      score += 20;
    }

    // Consecutive character match bonus
    if (prevPos !== -1 && foundPos === prevPos + 1) {
      consecutive++;
      score += 10 * consecutive;
    } else {
      consecutive = 0;
    }

    // Proximity / distance penalty
    if (prevPos !== -1) {
      const distance = foundPos - prevPos;
      score -= Math.min(distance, 5);
    }

    score += 10;
    prevPos = foundPos;
    targetIdx = foundPos + 1;
  }

  // Bonus for closer length to query
  score -= (target.length - q.length) * 0.5;

  return score;
}

/**
 * Layered name matching with 3-tier progressive resolution:
 *  Tier 1: Exact / Snowflake / Mention (handled in caller resolvers)
 *  Tier 2: Initial starts-with / Word-prefix matching
 *  Tier 3: Sequential progressive character filtering & scoring
 */
export function layeredMatch<T extends MatchItem>(
  items: T[],
  query: string,
  maxFuzzyResults = 5,
): MatchResult<T> {
  if (!query || items.length === 0) return { outcome: 'not_found' };

  const q = query.toLowerCase().trim();
  if (!q) return { outcome: 'not_found' };

  const qWords = q.split(/\s+/).filter(Boolean);

  // 1. Exact case-insensitive name
  const exact = items.filter(i => getName(i) === q);
  if (exact.length === 1) return { outcome: 'resolved', item: exact[0] };
  if (exact.length > 1) return { outcome: 'resolved', item: pickShortest(exact) };

  // 2. Tier 2: Initial Starts-with Matching (e.g. "hang 4" for "hangout 4")
  const sw = items.filter(i => getName(i).startsWith(q));
  if (sw.length === 1) return { outcome: 'resolved', item: sw[0] };
  if (sw.length > 1) return { outcome: 'resolved', item: pickShortest(sw) };

  // 3. Word-prefix: every query word starts at least one word in the target name
  const wp = items.filter(i => {
    const nWords = wordSplit(getName(i));
    return qWords.every(qw => nWords.some(nw => nw.startsWith(qw)));
  });
  if (wp.length === 1) return { outcome: 'resolved', item: wp[0] };
  if (wp.length > 1) return { outcome: 'resolved', item: pickShortest(wp) };

  // 4. Tier 3: Sequential Progressive Character Filtering
  // Progressively evaluates characters; filters out candidates that do not match the character sequence
  const scoredItems: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = progressiveCharMatchScore(item.name, q);
    if (score >= 0) {
      scoredItems.push({ item, score });
    }
  }

  if (scoredItems.length === 1) {
    return { outcome: 'resolved', item: scoredItems[0].item };
  } else if (scoredItems.length > 1) {
    scoredItems.sort((a, b) => b.score - a.score);
    // If top score clearly beats second score (by at least 8 points), resolve it
    if (scoredItems[0].score - scoredItems[1].score >= 8) {
      return { outcome: 'resolved', item: scoredItems[0].item };
    }
    // If scores are equal or very close, pick shortest name
    const topScore = scoredItems[0].score;
    const topCandidates = scoredItems.filter(s => s.score >= topScore - 5).map(s => s.item);
    if (topCandidates.length === 1) {
      return { outcome: 'resolved', item: topCandidates[0] };
    }
    return { outcome: 'resolved', item: pickShortest(topCandidates) };
  }

  // 5. Word-contains: every query word is a substring of the full target name
  const wc = items.filter(i => qWords.every(qw => getName(i).includes(qw)));
  if (wc.length === 1) return { outcome: 'resolved', item: wc[0] };
  if (wc.length > 1) return { outcome: 'resolved', item: pickShortest(wc) };

  // 6. Normalized compact match: "hangout5" matches "Hangout 5"
  const qNorm = normalizeCompact(query);
  if (qNorm) {
    const normMatches = items.filter(i => normalizeCompact(i.name) === qNorm);
    if (normMatches.length === 1) return { outcome: 'resolved', item: normMatches[0] };
    if (normMatches.length > 1) return { outcome: 'resolved', item: pickShortest(normMatches) };
  }

  // 7. Fuse.js fuzzy fallback with tight threshold + ambiguity detection
  const fuse = new Fuse(items, {
    keys: ['name'],
    threshold: 0.3,
    distance: 80,
    ignoreLocation: true,
    isCaseSensitive: false,
    includeScore: true,
  });

  const results = fuse.search(query, { limit: maxFuzzyResults });
  if (results.length === 0) return { outcome: 'not_found' };

  const best = results[0];
  const bestScore = best.score ?? 1;

  // Reject weak matches
  if (bestScore > 0.35) return { outcome: 'not_found' };

  // Check for ambiguity: if second-best is too close to best
  if (results.length >= 2) {
    const secondScore = results[1].score ?? 1;
    const gap = secondScore - bestScore;
    if (gap < 0.15) {
      // Multiple results with similar scores — ambiguous
      const ambiguousCandidates = results
        .filter(r => (r.score ?? 1) <= bestScore + 0.15)
        .map(r => r.item);
      return { outcome: 'ambiguous', candidates: ambiguousCandidates };
    }
  }

  return { outcome: 'resolved', item: best.item };
}
