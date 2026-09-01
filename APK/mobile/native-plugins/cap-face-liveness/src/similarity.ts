// Mirrors APK/android's FaceEmbeddingEngine.cosine/matches (kept in TS since it's
// a trivial dot-product on two already-normalised 128-dim vectors — no need to
// cross the JS↔native bridge for this).
export const FACE_MATCH_THRESHOLD = 0.6;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function matchesFace(embedding: number[], reference: number[]): boolean {
  return cosineSimilarity(embedding, reference) >= FACE_MATCH_THRESHOLD;
}
