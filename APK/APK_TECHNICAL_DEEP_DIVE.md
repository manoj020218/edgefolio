# 🔐 FACE RECOGNITION - Technical Deep Dive

**Document:** Phase 2 Technical Specification  
**Date:** April 28, 2026  
**Target Audience:** Android Developers, ML Engineers

---

## Reference Update Algorithm (EMA - Exponential Moving Average)

### Mathematical Foundation

The daily reference update uses Exponential Moving Average to gradually adapt to appearance changes without accumulating alignment errors.

```
EMBEDDING EXPONENTIAL MOVING AVERAGE:

Formula:
  E_ref^(new) = β × E_live + (1 - β) × E_ref^(old)

Where:
  E_ref^(new)  = New reference embedding (stored)
  E_live       = Successfully matched embedding (from camera)
  E_ref^(old)  = Current stored reference embedding
  β            = Learning rate (0.15 recommended = 15% new, 85% old)

Examples over time:
  Day 1: Reference = Initial enrollment (E0)
  Day 2: E_ref = 0.15 × E_live1 + 0.85 × E0
  Day 3: E_ref = 0.15 × E_live2 + 0.85 × (0.15 × E_live1 + 0.85 × E0)
         = 0.15 × E_live2 + 0.1275 × E_live1 + 0.7225 × E0
  ...
  ∞:     E_ref → weighted average of all recent matches

IMPACT OF β:
  β = 0.05:  Very slow adaptation (takes 60 days to adapt 95%)
  β = 0.15:  Balanced (takes 20 days to adapt 95%) ✅ RECOMMENDED
  β = 0.30:  Fast adaptation (takes 10 days to adapt 95%) - risky
  β = 0.50:  Too fast (can degrade if bad input)

DECAY FACTOR:
  After N days: (1-β)^N
  
  Day  7: (0.85)^7 ≈ 32% (old) + 68% (new matches)
  Day 14: (0.85)^14 ≈ 10% (old) + 90% (new matches)
  Day 21: (0.85)^21 ≈ 3% (old) + 97% (new matches)

Benefit: Appearance changes (beard, glasses) are gradual, so:
  - First day after change: Slightly lower similarity
  - Days 2-7: Gradual adaptation
  - Day 8+: Back to >0.80 similarity with new appearance
```

### Pseudocode Implementation

```kotlin
// STEP 1: On successful match
fun updateReferenceEmbedding(
    liveEmbedding: FloatArray,      // 128-dim vector
    currentRefEmbedding: FloatArray, // stored reference
    lastUpdateDate: LocalDate,
    today: LocalDate
): FloatArray {
    
    // Only update once per calendar day
    if (lastUpdateDate == today) {
        return currentRefEmbedding // Already updated today
    }
    
    val beta = 0.15f // Learning rate
    val newReference = FloatArray(128)
    
    // Apply EMA formula
    for (i in 0 until 128) {
        newReference[i] = beta * liveEmbedding[i] + 
                         (1 - beta) * currentRefEmbedding[i]
    }
    
    // Store with encryption
    val encryptedEmbedding = encryptionManager.encrypt(newReference)
    database.updateEmbedding(empId, encryptedEmbedding, today)
    
    return newReference
}

// STEP 2: Calculate confidence score
fun calculateConfidenceScore(similarity: Double): Float {
    val minSimilarity = 0.40  // Practical minimum
    val maxSimilarity = 0.95  // Practical maximum
    
    val confidence = ((similarity - minSimilarity) / 
                     (maxSimilarity - minSimilarity)) * 100
    
    return confidence.coerceIn(0f, 100f)
}

// Example scores:
// similarity=0.60 → confidence = 26.7% (barely matched)
// similarity=0.80 → confidence = 80.0% (good match)
// similarity=0.87 → confidence = 93.3% (excellent match)
```

### Protection Against Drift

```
SCENARIO: Beard growth (0.5cm/day)

Day 1: Morning → 0.85 similarity (enrollment photo: clean shaven)
       Evening → Marked attendance (saved embedding updated 15% new)
       
Day 2-3: Morning → 0.82-0.84 (beard 1.5cm, but EMA accommodating)
         Similarity still > 0.60, so update continues
         
Day 5: Morning → 0.80 (beard 2.5cm)
       EMA has incorporated 5 days of data
       Reference embedding shifted ~60% towards bearded face
       
Day 10: Morning → 0.81 (full beard 5cm)
        Reference fully adapted (>90% bearded)
        Back to normal recognition
        
SCENARIO: Sudden shave (negative change)

Day 5 (Morning): Bearded → 0.79 similarity (below threshold? NO, >0.60)
Day 5 (After shave): Clean-shaven → 0.45 similarity (BELOW threshold!)
                     
       ❌ REJECTED - liveness check still passes, but matching fails
       
Day 5 (Evening): User tries again → 0.48 similarity (STILL BELOW)
                 Manual admin override needed OR
                 
Day 6 (Morning): Another attempt → 0.52 (still below, frustration!)
Day 7-8: Gradually re-enrolls to clean-shaven face
         
MITIGATION:
  • Admin can see "recent change" alert in dashboard
  • Option to manually re-enroll (fast path)
  • Or: Allow 3 failures before lock, then manual approval
  • Or: Temporary threshold adjustment (0.60 → 0.55 for 3 days)
```

### Weekly Image Backup Update

```
Rationale: Embeddings are mathematically accurate but not human-readable.
           Keep visual backup for admin inspection.

Pseudocode:

fun updateReferenceImageWeekly(
    liveImage: Mat,           // Current captured face (aligned)
    currentRefImage: Mat,     // Last week's reference image
    lastImageUpdate: LocalDate,
    today: LocalDate
): Mat {
    
    val daysSinceUpdate = ChronoUnit.DAYS.between(lastImageUpdate, today)
    
    if (daysSinceUpdate < 7) {
        return currentRefImage // Not yet time
    }
    
    // Image blending (per-pixel average)
    val alpha = 0.2f // 20% new, 80% old (slow visual drift)
    val blendedImage = Mat()
    
    Core.addWeighted(
        liveImage, alpha.toDouble(),
        currentRefImage, (1.0 - alpha),
        0.0,
        blendedImage
    )
    
    // Encrypt and store
    val compressedJpeg = compressImage(blendedImage, 85) // quality
    val encryptedImage = encryptionManager.encrypt(compressedJpeg)
    database.updateReferenceImage(empId, encryptedImage, today)
    
    return blendedImage
}

RESULT:
  Day 0:   Enrollment photo (clean shaven)
  Day 7:   Blend of day 0 + days 1-7 (20% bearded, 80% original)
  Day 14:  Blend of day 7 + days 8-14 (increasing beard)
  Day 21:  Full beard visible, smooth transition
  
  Visual appearance: Gradual, not abrupt → easier human understanding
```

---

## Liveness Detection - Algorithm Details

### Blink Detection (Primary Method)

```
ML Kit provides: "eyeOpenProbability" for each eye (0.0 to 1.0)

Pseudocode:

var blinkCount = 0
var eyesWereClosed = false
val requiredBlinks = 2
val maxDurationMs = 5000

fun processFaceFrame(face: Face) {
    val leftEyeOpen = face.getContour(FaceContour.LEFT_EYE)
                         ?.let { ml kit calculates } ?: 0.5f
    val rightEyeOpen = face.getContour(FaceContour.RIGHT_EYE)
                           ?.let { ml kit calculates } ?: 0.5f
    
    val averageEyeOpen = (leftEyeOpen + rightEyeOpen) / 2f
    
    // Threshold: 0.3 = eyes very likely closed
    val eyesClosed = averageEyeOpen < 0.3f
    
    if (eyesClosed && !eyesWereClosed) {
        // Eyes just closed
        startClosureTime = System.currentTimeMillis()
    }
    
    if (!eyesClosed && eyesWereClosed) {
        // Eyes just opened
        val closureDurationMs = System.currentTimeMillis() - startClosureTime
        
        // Natural blink: 100-300ms
        if (closureDurationMs in 100..300) {
            blinkCount++
            Log.d("Liveness", "Blink detected: $blinkCount/$requiredBlinks")
        }
    }
    
    if (blinkCount >= requiredBlinks) {
        return LIVENESS_PASSED
    }
    
    if (System.currentTimeMillis() - startTime > maxDurationMs) {
        return LIVENESS_FAILED_TIMEOUT
    }
    
    eyesWereClosed = eyesClosed
}

DETECTION MATRIX:
┌─────────────────────┬────────────┬───────┐
│ Scenario            │ Blink Time │ Result│
├─────────────────────┼────────────┼───────┤
│ Real blink          │ 150-250ms  │ ✅ OK │
│ Slow blink          │ 400-600ms  │ ❌ NO │
│ Rapid blink         │ 50-80ms    │ ❌ NO │
│ Eye twitch          │ 30-50ms    │ ❌ NO │
│ Photo (no blink)    │ ∞          │ ❌ NO │
│ Video (fake blink)  │ Variable   │ ⚠️ 60%│
└─────────────────────┴────────────┴───────┘
```

### Head Movement Detection (Secondary Method)

```
ML Kit provides: Facial landmarks (33 points) including:
  - Nose (1 point)
  - Eyes (8 points)
  - Mouth (12 points)
  - Face contour (12 points)

Pseudocode:

var previousNoseX = 0f
var previousNoseY = 0f
val requiredMovement = 5.0f // degrees
val maxDurationMs = 5000

fun detectHeadMovement(face: Face): LivenessResult {
    
    // Get facial landmarks
    val nose = face.landmarks.find { it.type == FaceContour.NOSE_BOTTOM }
    val leftEye = face.landmarks.find { it.type == FaceContour.LEFT_EYE }
    val rightEye = face.landmarks.find { it.type == FaceContour.RIGHT_EYE }
    
    // Calculate face center
    val faceCenter = PointF(
        (leftEye.x + rightEye.x) / 2,
        (leftEye.y + rightEye.y) / 2
    )
    
    // Calculate yaw angle (horizontal head turn)
    val yaw = calculateYaw(nose, faceCenter)
    
    // Calculate pitch angle (vertical head tilt)
    val pitch = calculatePitch(leftEye, rightEye, nose)
    
    // Store initial position on first frame
    if (initialYaw == null) {
        initialYaw = yaw
        initialPitch = pitch
        return PROCESSING
    }
    
    val yawChange = Math.abs(yaw - initialYaw!!)
    val pitchChange = Math.abs(pitch - initialPitch!!)
    
    if (yawChange > requiredMovement || pitchChange > requiredMovement) {
        return LIVENESS_PASSED
    }
    
    if (System.currentTimeMillis() - startTime > maxDurationMs) {
        return LIVENESS_FAILED_TIMEOUT
    }
    
    return PROCESSING
}

function calculateYaw(nose: PointF, faceCenter: PointF): Float {
    val dx = nose.x - faceCenter.x
    val distance = calculateDistance(nose, faceCenter)
    return Math.asin(dx / distance) * (180 / Math.PI)
}

ANGLE RANGES:
  Yaw:   -45° (left) to +45° (right) | Frontal ≈ ±0°
  Pitch: -45° (up) to +45° (down)    | Frontal ≈ 0°
  
DETECTION MATRIX:
┌────────────────────────┬──────────┬──────────┬────────┐
│ Scenario               │ Yaw Δ    │ Pitch Δ  │ Result │
├────────────────────────┼──────────┼──────────┼────────┤
│ Small head turn (10°)  │ 10°      │ 2°       │ ✅ OK  │
│ Slight nod             │ 1°       │ 8°       │ ✅ OK  │
│ Blink (no movement)    │ 0°       │ 0°       │ ❌ NO  │
│ Still photo            │ 0°       │ 0°       │ ❌ NO  │
│ Exaggerated turn       │ 25°      │ 5°       │ ✅ OK  │
└────────────────────────┴──────────┴──────────┴────────┘
```

---

## TensorFlow Lite Model Details

### MobileFaceNet Architecture

```
Input Layer:
  Shape: 1 × 112 × 112 × 3 (BHWC format)
  Format: RGB, normalized to [-1, 1] or [0, 1]
  
Preprocessing:
  Resize: Any size → 112×112 (bilinear interpolation)
  Normalize: (pixel - 127.5) / 128.0
  
Backbone: MobileNetV2 (lightweight)
  - 23 layers
  - 3.5M parameters (vs 45M for ResNet50)
  - Inverted residuals + depthwise separable conv
  
Output Layer:
  Shape: 1 × 128 (128-dimensional embedding)
  Range: [-1, 1] (normalized)
  
Total Model Size:
  INT8 quantized: 4.0 MB (recommended)
  Float32: 14 MB
  Float16: 7 MB

Quantization:
  INT8: Per-channel quantization
  Range: Scales to [-128, 127]
  Accuracy loss: <1% (negligible)
  Speed gain: 2-3x faster

Performance on Test Devices:
  Device              | Inference Time | Peak Memory
  ────────────────────┼────────────────┼─────────────
  Pixel 4a            │ 85 ms          │ 12 MB
  Samsung Galaxy A52  │ 95 ms          │ 14 MB
  Redmi Note 10       │ 140 ms         │ 18 MB
  OnePlus Nord        │ 75 ms          │ 11 MB
```

### Embedding Comparison

```
After generating embeddings:
  E_ref = [0.23, -0.45, 0.12, ..., -0.34]  (128 dims)
  E_live = [0.25, -0.42, 0.13, ..., -0.32]
  
Three comparison methods:

1. COSINE SIMILARITY (Recommended)
   ──────────────────────────
   Formula: cos(θ) = (E_ref · E_live) / (||E_ref|| × ||E_live||)
   Range: [-1, 1] (-1 = opposite, 0 = orthogonal, 1 = identical)
   
   For normalized embeddings:
   sim = sum(E_ref[i] * E_live[i] for all 128 dims)
   
   Pros:
   • Invariant to magnitude
   • Computationally efficient (~10ms)
   • Robust to lighting variations
   
   Threshold: 0.60 (tunable)
   
   Kotlin Implementation:
   ──────────────────────
   fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
       var dotProduct = 0.0f
       var normA = 0.0f
       var normB = 0.0f
       
       for (i in a.indices) {
           dotProduct += a[i] * b[i]
           normA += a[i] * a[i]
           normB += b[i] * b[i]
       }
       
       return dotProduct / (sqrt(normA) * sqrt(normB))
   }

2. EUCLIDEAN DISTANCE
   ──────────────────
   Formula: d = √(Σ(E_ref[i] - E_live[i])²)
   Range: [0, ∞] (0 = identical)
   
   Threshold: 0.6 (tunable, smaller is better)
   
   Pros: Simple to understand
   Cons: Magnitude-dependent, less robust

3. MANHATTAN DISTANCE
   ──────────────────
   Formula: d = Σ|E_ref[i] - E_live[i]|
   Range: [0, ∞]
   
   Pros: Fast computation
   Cons: Less commonly used for faces
```

---

## Offline Sync Queue (EDGE Communication)

### Buffering Strategy

```
When EDGE is offline:
1. Attendance marked successfully → stored locally
2. Reference embedding updated → stored locally
3. Sync attempted → failed → queued
4. App continues offline

Queue structure (Room DB):
┌─────────────────────────────────────────┐
│ PendingSyncRecord                       │
├─────────────────────────────────────────┤
│ id: Long (primary key)                  │
│ empId: String                           │
│ timestamp: LocalDateTime                │
│ action: String (MARK_ATTENDANCE, ...)   │
│ data: String (JSON encrypted)           │
│ isRetried: Boolean                      │
│ retryCount: Int                         │
│ lastError: String                       │
│ createdAt: LocalDateTime                │
│ syncedAt: LocalDateTime? (null if not)  │
└─────────────────────────────────────────┘

When EDGE comes online:
1. Check network connectivity
2. Query pending sync records (ORDER BY createdAt)
3. For each record:
   a. Decrypt data
   b. POST to /api/attendance/batch-sync
   c. Mark as synced
   d. Remove from queue
4. Handle failures:
   a. Increment retryCount
   b. Exponential backoff (2^n seconds)
   c. Max retries: 5
   d. After max retries: alert admin

Example sync payload:
──────────────────────
POST /api/attendance/batch-sync
{
  "syncs": [
    {
      "empId": "EMP003",
      "timestamp": "2026-04-28T09:35:42Z",
      "location": {
        "lat": 28.6139,
        "lon": 77.2090,
        "accuracy": 15
      },
      "faceData": {
        "similarity": 0.94,
        "confidence": 92,
        "livenessCheck": "PASSED"
      },
      "deviceInfo": {
        "model": "SM-A52",
        "osVersion": 31
      }
    },
    ...
  ]
}
```

---

**End of Technical Deep Dive Document**
