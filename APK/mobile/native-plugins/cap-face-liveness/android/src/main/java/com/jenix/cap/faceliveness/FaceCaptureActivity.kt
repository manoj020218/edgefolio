package com.jenix.cap.faceliveness

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import android.widget.LinearLayout
import java.util.concurrent.Executors

// Mirrors FACE_MATCH_THRESHOLD in similarity.ts — used only to color the
// display bar green/red here; the actual pass/fail decision stays in JS.
private const val MATCH_THRESHOLD = 0.6f

// A single camera frame can land mid-blink, slightly motion-blurred, or at an
// off angle — any of which knocks a genuine match down to a random-looking
// score (users reported the same person occasionally scoring ~45%). Averaging
// several consecutive frames' embeddings (post L2-normalize, then
// re-normalize) smooths that per-frame noise out, for both enrollment (a
// steadier reference) and attendance (a steadier sample to compare it
// against) — a few hundred ms of extra "hold still" time, not a visible
// slowdown.
private const val BURST_SIZE = 3

// Low-match retries (attendance only): instead of closing on the first low score (which the app
// used to show as a red "try again"), the screen stays open, coaches the user (closer / straighter /
// blink) and re-checks. The best embedding is returned if time or attempts run out.
private const val MAX_MATCH_ATTEMPTS = 6
private const val RETRY_GAP_MS = 900L        // let the user react to the hint before re-capturing
private const val FORCE_RETRY_MS = 2_200L    // re-capture even if framing still looks off

// Enrollment (no reference yet): take several well-framed captures and average them into one
// steady reference. Each round is itself a BURST_SIZE average. A round that disagrees with the
// others (similarity to the rest below ENROLL_CONSISTENCY) is dropped and retaken.
private const val ENROLL_ROUNDS = 3
private const val ENROLL_CONSISTENCY = 0.75f
private const val ENROLL_FORCE_MS = 4_000L   // enrollment waits longer for good framing

/**
 * Full-screen native camera flow: liveness check (blink/head-turn), then one
 * MobileFaceNet embedding capture. Started by FaceLivenessPlugin via
 * startActivityForResult; the plugin already verified CAMERA permission before
 * launching this, but it's re-checked here defensively.
 *
 * Result extras:
 *   RESULT_OK       -> "embedding" (JSON array string, 192 floats)
 *   RESULT_CANCELED -> "reason" (LIVENESS_TIMEOUT | EMBEDDING_FAILED | MODEL_MISSING |
 *                                PERMISSION_DENIED | CANCELLED)
 *
 * Deliberately minimal UI (hint text only, no face-bounding-box overlay) — see
 * this plugin's README for the note on porting APK/android's Compose overlay if
 * that polish is wanted later.
 */
class FaceCaptureActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TIMEOUT_MS           = "timeoutMs"
        const val EXTRA_EMBEDDING            = "embedding"
        const val EXTRA_REASON               = "reason"
        const val EXTRA_REFERENCE_EMBEDDING  = "referenceEmbedding"
    }

    private lateinit var cameraManager: CameraXManager
    private lateinit var embeddingEngine: FaceEmbeddingEngine
    private lateinit var livenessDetector: LivenessDetector
    private lateinit var hintView: TextView
    private lateinit var previewView: PreviewView
    private lateinit var scoreView: TextView
    private lateinit var scoreBar: MatchScoreBarView
    private var referenceEmbedding: FloatArray? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val embeddingExecutor = Executors.newSingleThreadExecutor()
    private var timeoutRunnable: Runnable? = null
    private var finished = false
    private var capturing = false
    private lateinit var guideView: FaceGuideOverlayView
    private var livenessPassed = false
    private var matchAttempts = 0
    private var nextAttemptAt = 0L
    private var bestEmbedding: FloatArray? = null
    private var bestScore = -1f
    private var lastGuidance: String? = null
    private val enrollRounds = mutableListOf<FloatArray>()
    private var livenessStartedAt = 0L
    private var lastBlinkCount = 0
    private var lastBlinkAt = 0L
    private val retryTips = listOf(
        "Come a little closer to the camera",
        "Blink once and hold still",
        "Hold the phone at eye level",
        "Face the light, avoid bright light behind you",
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            finishWith(reason = "PERMISSION_DENIED")
            return
        }

        val timeoutMs = intent.getLongExtra(EXTRA_TIMEOUT_MS, 5_000L)
        referenceEmbedding = intent.getStringExtra(EXTRA_REFERENCE_EMBEDDING)?.let { json ->
            try {
                val arr = org.json.JSONArray(json)
                FloatArray(arr.length()) { arr.getDouble(it).toFloat() }
            } catch (e: Exception) {
                null
            }
        }

        embeddingEngine = FaceEmbeddingEngine(applicationContext)
        if (!embeddingEngine.isModelAvailable()) {
            finishWith(reason = "MODEL_MISSING")
            return
        }

        livenessDetector = LivenessDetector(Long.MAX_VALUE / 4)
        livenessStartedAt = System.currentTimeMillis()
        setContentView(buildLayout())

        cameraManager = CameraXManager(applicationContext, ::onFrame)
        cameraManager.bind(this, previewView)

        // Out of time: if liveness passed and we have a capture, hand the best one to JS (it makes the
        // final call); otherwise it is a genuine liveness timeout.
        timeoutRunnable = Runnable {
            val best = bestEmbedding
            when {
                best != null -> finishWith(embedding = best)
                enrollRounds.size >= 2 -> finishWith(embedding = averageEmbeddings(enrollRounds))
                else -> finishWith(reason = "LIVENESS_TIMEOUT")
            }
        }
        mainHandler.postDelayed(timeoutRunnable!!, timeoutMs)
    }

    private fun buildLayout(): ViewGroup {
        val root = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        root.addView(previewView)

        // Guides the user to a consistent face size/position/distance every capture —
        // both at enrollment and at attendance time. Wildly different framing between
        // the two is the single biggest cause of a same-person capture still scoring
        // low on cosineSimilarity against the enrolled reference (the embedding model
        // is sensitive to scale/crop, not just identity).
        guideView = FaceGuideOverlayView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        root.addView(guideView)

        // Stacked bottom bar: match score (number + colored bar, only shown once a
        // reference embedding was provided and a capture has actually happened —
        // i.e. attendance only, never enrollment) sits above the running hint text.
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            )
        }

        scoreView = TextView(this).apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#99000000"))
            setPadding(32, 12, 32, 4)
            textSize = 14f
            visibility = View.GONE
        }
        bottomBar.addView(scoreView)

        scoreBar = MatchScoreBarView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (resources.displayMetrics.density * 8).toInt(),
            )
            setBackgroundColor(Color.parseColor("#99000000"))
            visibility = View.GONE
        }
        bottomBar.addView(scoreBar)

        hintView = TextView(this).apply {
            text = "Look at the oval and blink your eyes, please 👀"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#99000000"))
            setPadding(32, 28, 32, 36)
            textSize = 19f
            gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }
        bottomBar.addView(hintView)

        root.addView(bottomBar)

        return root
    }

    /** Framing advice from the face box (normalised 0..1 to the analysed frame), or null if it looks fine. */
    private fun guidanceFor(face: com.google.mlkit.vision.face.Face, b: android.graphics.RectF?): String? {
        if (b == null) return null
        val w = b.width()
        return when {
            w < 0.38f -> "Come closer to the camera"
            w > 0.85f -> "Move the phone a little away"
            kotlin.math.abs(b.centerX() - 0.5f) > 0.16f || b.centerY() < 0.22f || b.centerY() > 0.68f ->
                "Keep your face inside the oval"
            kotlin.math.abs(face.headEulerAngleY) > 12f || kotlin.math.abs(face.headEulerAngleX) > 14f ->
                "Look straight at the camera"
            (face.leftEyeOpenProbability ?: 1f) < 0.4f && (face.rightEyeOpenProbability ?: 1f) < 0.4f ->
                "Keep your eyes open"
            else -> null
        }
    }

    private fun onFrame(face: com.google.mlkit.vision.face.Face?, bounds: android.graphics.RectF?, @Suppress("UNUSED_PARAMETER") bitmap: Bitmap) {
        if (finished) return
        if (face == null) {
            if (!capturing) mainHandler.post { hintView.text = "No face detected — look at the camera" }
            return
        }

        // Retry phase: liveness already proven, the last capture scored low. Coach, then re-capture.
        if (livenessPassed) {
            if (capturing) return
            val now = System.currentTimeMillis()
            val guidance = guidanceFor(face, bounds)
            lastGuidance = guidance
            if (now < nextAttemptAt) {
                if (guidance != null) mainHandler.post { hintView.text = guidance }
                return
            }
            val forceAfter = if (referenceEmbedding == null) ENROLL_FORCE_MS else FORCE_RETRY_MS
            if (guidance != null && now < nextAttemptAt + forceAfter) {
                mainHandler.post { hintView.text = guidance }
                return
            }
            startBurst("Checking… hold still")
            return
        }

        when (livenessDetector.process(face)) {
            LivenessState.CHECKING -> {
                val now = System.currentTimeMillis()
                val blinks = livenessDetector.blinkCount
                if (blinks != lastBlinkCount) { lastBlinkCount = blinks; lastBlinkAt = now }
                val sinceBlink = now - maxOf(lastBlinkAt, livenessStartedAt)
                val hint = when {
                    blinks >= 1 -> "Great! One more blink 😊"
                    sinceBlink > 12_000L -> "Face the light so we can see your eyes, then blink"
                    sinceBlink > 6_000L -> "Close your eyes fully, then open them"
                    else -> "Look at the oval and blink your eyes, please 👀"
                }
                mainHandler.post {
                    guideView.blinks = blinks
                    hintView.text = hint
                }
            }
            LivenessState.PASSED -> {
                // blinkCount/head-turn stay "passed" on every subsequent frame once
                // triggered — without this guard, onFrame would call requestCapture
                // again on every frame during the score-display delay below,
                // stacking up concurrent captures.
                if (capturing) return
                livenessPassed = true
                mainHandler.post { guideView.blinks = 2 }
                // Enrollment: the first round also waits for good framing (the retry branch above).
                if (referenceEmbedding == null) {
                    nextAttemptAt = System.currentTimeMillis()
                    mainHandler.post { hintView.text = "Great. Look straight at the camera and hold still" }
                    return
                }
                startBurst("Hold still…")
            }
            LivenessState.TIMEOUT -> finishWith(reason = "LIVENESS_TIMEOUT")
        }
    }

    private val burstBitmaps = mutableListOf<Bitmap>()

    private fun startBurst(hint: String) {
        capturing = true
        mainHandler.post { hintView.text = hint }
        burstBitmaps.clear()
        captureNextBurstFrame()
    }

    private fun captureNextBurstFrame() {
        cameraManager.requestCapture { bitmap ->
            burstBitmaps.add(bitmap)
            if (burstBitmaps.size < BURST_SIZE) {
                captureNextBurstFrame()
            } else {
                onCaptured(burstBitmaps.toList())
            }
        }
    }

    private fun onCaptured(faceBitmaps: List<Bitmap>) {
        embeddingExecutor.execute {
            val embeddings = faceBitmaps.mapNotNull { embeddingEngine.generate(it) }
            val embedding = if (embeddings.isEmpty()) null else averageEmbeddings(embeddings)
            mainHandler.post {
                if (embedding == null) {
                    finishWith(reason = "EMBEDDING_FAILED")
                    return@post
                }
                val reference = referenceEmbedding
                if (reference == null) {
                    onEnrollRound(embedding)
                    return@post
                }
                // JS still makes the final pass/fail call on the returned embedding.
                val score = cosineSimilarity(embedding, reference)
                if (score > bestScore) { bestScore = score; bestEmbedding = embedding }
                // The oval's border fills like a progress ring: a closed ring = matched.
                guideView.animateProgress((score / MATCH_THRESHOLD).coerceIn(0f, 1f))
                if (score >= MATCH_THRESHOLD) {
                    hintView.text = "Face matched ✓"
                    mainHandler.postDelayed({ finishWith(embedding = embedding) }, 800L)
                    return@post
                }
                matchAttempts++
                if (matchAttempts >= MAX_MATCH_ATTEMPTS) {
                    finishWith(embedding = bestEmbedding ?: embedding)
                    return@post
                }
                // Low match: no red, no closing. Coach and try again on the same screen.
                hintView.text = lastGuidance ?: retryTips[(matchAttempts - 1) % retryTips.size]
                nextAttemptAt = System.currentTimeMillis() + RETRY_GAP_MS
                capturing = false
            }
        }
    }

    /** One enrollment capture done: fill the ring a step, then take the next or finish. */
    private fun onEnrollRound(embedding: FloatArray) {
        enrollRounds.add(embedding)
        if (enrollRounds.size >= ENROLL_ROUNDS) {
            // Drop a round that does not agree with the others (blink, blur, turned head) and retake it.
            val worst = enrollRounds.indices.minByOrNull { i ->
                val others = enrollRounds.filterIndexed { j, _ -> j != i }
                cosineSimilarity(enrollRounds[i], averageEmbeddings(others))
            }!!
            val others = enrollRounds.filterIndexed { j, _ -> j != worst }
            if (cosineSimilarity(enrollRounds[worst], averageEmbeddings(others)) < ENROLL_CONSISTENCY) {
                enrollRounds.removeAt(worst)
                guideView.animateProgress(enrollRounds.size.toFloat() / ENROLL_ROUNDS)
                hintView.text = "One more, please. Look straight at the camera"
                nextAttemptAt = System.currentTimeMillis() + RETRY_GAP_MS
                capturing = false
                return
            }
            guideView.animateProgress(1f)
            hintView.text = "Face ID captured ✓"
            val reference = averageEmbeddings(enrollRounds)
            mainHandler.postDelayed({ finishWith(embedding = reference) }, 800L)
            return
        }
        guideView.animateProgress(enrollRounds.size.toFloat() / ENROLL_ROUNDS)
        hintView.text = "Good, ${enrollRounds.size} of $ENROLL_ROUNDS. Hold still…"
        nextAttemptAt = System.currentTimeMillis() + RETRY_GAP_MS
        capturing = false
    }

    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return 0f
        var dot = 0f
        for (i in a.indices) dot += a[i] * b[i]
        return dot.coerceIn(-1f, 1f)
    }

    // Each input is already L2-normalized (FaceEmbeddingEngine.generate) — mean
    // + re-normalize is the standard "template averaging" combination for face
    // embeddings, smoothing out per-frame noise from any single capture.
    private fun averageEmbeddings(list: List<FloatArray>): FloatArray {
        val dim = list[0].size
        val sum = FloatArray(dim)
        for (e in list) for (i in 0 until dim) sum[i] += e[i]
        val norm = kotlin.math.sqrt(sum.fold(0.0) { acc, x -> acc + x * x }.toFloat()).coerceAtLeast(1e-10f)
        return FloatArray(dim) { sum[it] / norm }
    }

    private fun finishWith(embedding: FloatArray? = null, reason: String? = null) {
        if (finished) return
        finished = true
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }

        if (embedding != null) {
            val json = embedding.joinToString(prefix = "[", postfix = "]") { it.toString() }
            setResult(RESULT_OK, android.content.Intent().putExtra(EXTRA_EMBEDDING, json))
        } else {
            setResult(RESULT_CANCELED, android.content.Intent().putExtra(EXTRA_REASON, reason ?: "CANCELLED"))
        }
        finish()
    }

    override fun onBackPressed() {
        finishWith(reason = "CANCELLED")
    }

    override fun onDestroy() {
        super.onDestroy()
        timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        embeddingExecutor.shutdown()
        if (::cameraManager.isInitialized) cameraManager.release()
    }
}

// Draws a dark scrim over the whole preview with an oval "cutout" in the
// center where the user should position their face — a consistent target
// framing (position/size/distance) is the cheapest fix for a same-person
// capture otherwise scoring low on cosineSimilarity purely from a different
// crop/scale than the enrolled reference.
private class FaceGuideOverlayView(context: Context) : View(context) {
    private val scrimPaint = Paint().apply { color = Color.parseColor("#99000000") }
    private val ovalStrokePaint = Paint().apply {
        color = Color.parseColor("#66FFFFFF")       // dim base ring
        style = Paint.Style.STROKE
        strokeWidth = 8f
        isAntiAlias = true
    }
    private val progressPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 14f
        strokeCap = Paint.Cap.ROUND
        isAntiAlias = true
    }

    /** Blinks seen so far (0..2), drawn as two dots under the oval during the liveness step. */
    var blinks: Int = 0
        set(value) { if (field != value) { field = value; invalidate() } }
    private val dotPaint = Paint().apply { isAntiAlias = true }
    private val dotRingPaint = Paint().apply {
        isAntiAlias = true; style = Paint.Style.STROKE; strokeWidth = 4f; color = Color.WHITE
    }
    private val breathe = android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1400L
        repeatMode = android.animation.ValueAnimator.REVERSE
        repeatCount = android.animation.ValueAnimator.INFINITE
        addUpdateListener { if (progress < 0.001f) invalidate() }
        start()
    }

    override fun onDetachedFromWindow() { breathe.cancel(); animator?.cancel(); super.onDetachedFromWindow() }

    /** 0..1 share of the perimeter painted; 1 = full ring = matched. */
    private var progress = 0f
    private var animator: android.animation.ValueAnimator? = null

    fun animateProgress(target: Float) {
        animator?.cancel()
        animator = android.animation.ValueAnimator.ofFloat(progress, target).apply {
            duration = 650L
            interpolator = android.view.animation.DecelerateInterpolator()
            addUpdateListener { progress = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    // amber (low) -> light green -> green -> dark green (full match)
    private fun colorFor(p: Float): Int {
        val stops = intArrayOf(
            Color.parseColor("#FBBF24"), Color.parseColor("#A3E635"),
            Color.parseColor("#22C55E"), Color.parseColor("#15803D"),
        )
        val x = p.coerceIn(0f, 1f) * (stops.size - 1)
        val i = x.toInt().coerceAtMost(stops.size - 2)
        val f = x - i
        val a = stops[i]; val b = stops[i + 1]
        fun ch(sh: Int) = (((a shr sh) and 0xFF) + (((b shr sh) and 0xFF) - ((a shr sh) and 0xFF)) * f).toInt()
        return Color.rgb(ch(16), ch(8), ch(0))
    }
    private val clearPaint = Paint().apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
        isAntiAlias = true
    }

    init {
        setLayerType(LAYER_TYPE_SOFTWARE, null) // PorterDuff.Mode.CLEAR needs a software layer
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val ovalWidth = w * 0.62f
        val ovalHeight = ovalWidth * 1.35f
        val cx = w / 2f
        val cy = h * 0.42f
        val rect = RectF(cx - ovalWidth / 2f, cy - ovalHeight / 2f, cx + ovalWidth / 2f, cy + ovalHeight / 2f)

        val layerId = canvas.saveLayer(0f, 0f, w, h, null)
        canvas.drawRect(0f, 0f, w, h, scrimPaint)
        canvas.drawOval(rect, clearPaint)
        canvas.restoreToCount(layerId)

        if (progress < 0.001f) {
            // Waiting for blinks: soft breathing glow around the oval so the screen feels alive.
            val t = breathe.animatedValue as Float
            ovalStrokePaint.color = Color.argb((90 + 120 * t).toInt(), 255, 255, 255)
            ovalStrokePaint.strokeWidth = 6f + 6f * t
        } else {
            ovalStrokePaint.color = Color.parseColor("#66FFFFFF")
            ovalStrokePaint.strokeWidth = 8f
        }
        canvas.drawOval(rect, ovalStrokePaint)
        if (progress < 0.001f) {
            val r = w * 0.022f
            val y = rect.bottom + r * 3.2f
            for (i in 0 until 2) {
                val x = cx + (if (i == 0) -1 else 1) * r * 1.9f
                if (i < blinks) {
                    dotPaint.color = Color.parseColor("#34D399")
                    canvas.drawCircle(x, y, r, dotPaint)
                } else {
                    canvas.drawCircle(x, y, r, dotRingPaint)
                }
            }
        }
        if (progress > 0.001f) {
            progressPaint.color = colorFor(progress)
            // Start at the top of the oval and fill clockwise.
            canvas.drawArc(rect, -90f, 360f * progress, false, progressPaint)
        }
    }
}

// Simple horizontal fill bar for the match score — green at/above threshold,
// red below it. Paired with the numeric percentage in scoreView.
private class MatchScoreBarView(context: Context) : View(context) {
    var score: Float = 0f
        set(value) { field = value; invalidate() }

    private val trackPaint = Paint().apply { color = Color.parseColor("#33FFFFFF") }
    private val fillPaint = Paint().apply { isAntiAlias = true }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawRect(0f, 0f, w, h, trackPaint)
        fillPaint.color = if (score >= MATCH_THRESHOLD) Color.parseColor("#4CAF50") else Color.parseColor("#F44336")
        canvas.drawRect(0f, 0f, w * score.coerceIn(0f, 1f), h, fillPaint)
    }
}
