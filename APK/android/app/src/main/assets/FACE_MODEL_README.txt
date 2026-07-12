FACE MODEL — REQUIRED BEFORE BUILD
====================================

Place the MobileFaceNet INT8 TFLite model in this directory:

  app/src/main/assets/mobilefacenet.tflite

Model specs:
  - Architecture : MobileFaceNet
  - Quantisation : INT8
  - File size    : ~4 MB
  - Input        : [1, 112, 112, 3] float32, normalised to [-1, 1]
  - Output       : [1, 128] float32, L2-normalised embedding

Download:
  https://github.com/sirius-id/mobilefacenet-tflite  (or equivalent)

The model is NOT committed to git because of its binary size.
Add mobilefacenet.tflite to .gitignore if not already present.
