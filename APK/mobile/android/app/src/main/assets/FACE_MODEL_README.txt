FACE MODEL — REQUIRED BEFORE BUILD
====================================

Place the MobileFaceNet INT8 TFLite model in this directory:

  app/src/main/assets/mobilefacenet.tflite

Same file APK/android needs — see that project's FACE_MODEL_README.txt for specs
and where to get it. Read by @jenix/cap-face-liveness's FaceEmbeddingEngine.kt
(native-plugins/cap-face-liveness/android). Without it, FaceLiveness.capture()
rejects immediately with code MODEL_MISSING.

Model specs:
  - Architecture : MobileFaceNet
  - Quantisation : INT8
  - File size    : ~4 MB
  - Input        : [1, 112, 112, 3] float32, normalised to [-1, 1]
  - Output       : [1, 128] float32, L2-normalised embedding

The model is NOT committed to git because of its binary size.
Add mobilefacenet.tflite to android/app/.gitignore if not already present.
