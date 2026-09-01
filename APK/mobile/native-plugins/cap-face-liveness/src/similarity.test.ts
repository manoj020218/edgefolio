import { describe, expect, it } from 'vitest';
import { cosineSimilarity, matchesFace, FACE_MATCH_THRESHOLD } from './similarity';

describe('cosineSimilarity', () => {
  it('returns 1 for identical normalised vectors', () => {
    const v = [0.6, 0.8];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });
});

describe('matchesFace', () => {
  it('matches at/above threshold', () => {
    expect(matchesFace([1, 0], [1, 0])).toBe(true);
  });

  it('rejects below threshold', () => {
    // cos(60°) = 0.5, below the 0.6 threshold
    expect(matchesFace([1, 0], [0.5, Math.sqrt(0.75)])).toBe(false);
  });

  it('threshold matches the native FaceEmbeddingEngine value', () => {
    expect(FACE_MATCH_THRESHOLD).toBe(0.6);
  });
});
