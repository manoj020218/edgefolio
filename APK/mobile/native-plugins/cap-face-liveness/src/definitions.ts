export interface FaceLivenessOptions {
  /** Liveness detection timeout in ms. Default 5000, matches APK/android's LivenessDetector. */
  timeoutMs?: number;
}

export interface FaceCaptureResult {
  /** 192-dim MobileFaceNet embedding, L2-normalised. */
  embedding: number[];
}

/**
 * Native-only (Android). Opens a full-screen camera flow that runs the same
 * liveness check (2 blinks OR ≥5° head turn) and MobileFaceNet embedding
 * generation as APK/android's native attendance screen, then returns.
 *
 * Rejects with one of these `code`s on failure:
 *   PERMISSION_DENIED | LIVENESS_TIMEOUT | EMBEDDING_FAILED | MODEL_MISSING | CANCELLED
 *
 * Matching against a stored reference embedding is NOT done here — that's a
 * cheap dot-product, done in TS via `cosineSimilarity` (see index.ts), so the
 * caller can fetch the reference from `GET /apk/faces/:empId/embedding` first.
 */
export interface FaceLivenessPlugin {
  capture(options?: FaceLivenessOptions): Promise<FaceCaptureResult>;
}
