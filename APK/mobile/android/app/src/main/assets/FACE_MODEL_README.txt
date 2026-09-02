FACE MODEL — REQUIRED BEFORE BUILD
====================================

Place the MobileFaceNet TFLite model in this directory:

  app/src/main/assets/mobilefacenet.tflite

Sourced and verified 2026-09-02: "MobileFaceNet.tflite" from
syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing (sirius-ai lineage,
widely mirrored under this filename). Verified directly against the actual
file's flatbuffer tensor shapes — do not trust older specs written before this
was checked, they were wrong (a previous version of this doc assumed
[1,112,112,3] -> [1,128] INT8, which does not match any real file found).

Real, verified model specs:
  - Architecture : MobileFaceNet
  - Quantisation : float32 (not INT8)
  - File size    : ~5 MB
  - Input        : [2, 112, 112, 3] float32, normalised to [-1, 1] — PAIRWISE
                   export, batch=2 is required by the graph. We only need one
                   embedding at a time, so FaceEmbeddingEngine.kt fills both
                   batch slots with the same image.
  - Output       : "embeddings", [2, 192] float32 — use row 0, L2-normalise it.
                   192-dim, not the more common 128.

Read by @jenix/cap-face-liveness's FaceEmbeddingEngine.kt
(native-plugins/cap-face-liveness/android). Without it, FaceLiveness.capture()
rejects immediately with code MODEL_MISSING.

The model is NOT committed to git because of its binary size — add
mobilefacenet.tflite to android/app/.gitignore if not already present.
