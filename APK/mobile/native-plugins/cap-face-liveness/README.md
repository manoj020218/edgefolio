# @jenix/cap-face-liveness

**EdgeFolio-only.** Not a FieldForce plugin — do not move this into `EMS/Plugins`.
Consumed only by `APK/mobile` (this repo's field-attendance app).

Native camera liveness check (2 blinks, or ≥5° head turn — whichever first) followed
by one MobileFaceNet embedding capture. Ported from `APK/android`'s already-validated
`LivenessDetector.kt` / `CameraXManager.kt` / `FaceEmbeddingEngine.kt` (native Kotlin
attendance app) — same thresholds, same TFLite model contract.

Public API:

- `capture(options?: { timeoutMs?: number })` → `Promise<{ embedding: number[] }>`
  (128-dim, L2-normalised). Rejects with `code` one of: `PERMISSION_DENIED`,
  `LIVENESS_TIMEOUT`, `EMBEDDING_FAILED`, `MODEL_MISSING`, `CANCELLED`.
- `cosineSimilarity(a, b)`, `matchesFace(embedding, reference)`, `FACE_MATCH_THRESHOLD`
  (0.6) — pure TS, no native call. Compare a fresh `capture()` embedding against the
  reference from `GET /apk/faces/:empId/embedding` client-side; this is a cheap
  dot-product on already-normalised vectors, not worth a bridge round-trip.

## Required before the host app can build

Place the MobileFaceNet INT8 TFLite model at
`APK/mobile/android/app/src/main/assets/mobilefacenet.tflite` (same file
`APK/android` needs — see that project's `FACE_MODEL_README.txt` for specs/source).
**Not committed to git** (binary size) — add it to `APK/mobile/android/app/.gitignore`
if not already there. Without it, `capture()` rejects immediately with `MODEL_MISSING`
(checked before the camera even opens).

## Known simplification vs. the native app

No face-bounding-box overlay is drawn during capture (native app draws one in
Compose) — only a text hint at the bottom of the screen. Functionally equivalent,
just less visual feedback. Port `AttendanceCameraScreen.kt`'s overlay drawing into
`FaceCaptureActivity.kt` if that polish is wanted later.

## Not yet done

- Real device test (no Android SDK in the environment this was written in — verify
  with `cd APK/mobile && npx cap sync android && cd android && ./gradlew assembleDebug`
  on a machine with Android Studio, then run on a real phone).
- EMA reference-embedding update after a successful match (native app does this
  server-optional via `emaUpdate` — decide whether that belongs client-side here or
  server-side in `EDGE/backend`, then wire it into `APK/mobile`'s attendance screen).
