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

        livenessDetector = LivenessDetector(timeoutMs)
        setContentView(buildLayout())

        cameraManager = CameraXManager(applicationContext, ::onFrame)
        cameraManager.bind(this, previewView)

        timeoutRunnable = Runnable { finishWith(reason = "LIVENESS_TIMEOUT") }
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
        root.addView(FaceGuideOverlayView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        })

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
            text = "Position your face in the oval, then blink twice"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#99000000"))
            setPadding(32, 24, 32, 24)
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }
        bottomBar.addView(hintView)

        root.addView(bottomBar)

        return root
    }

    private fun onFrame(face: com.google.mlkit.vision.face.Face?, @Suppress("UNUSED_PARAMETER") bounds: android.graphics.RectF?, @Suppress("UNUSED_PARAMETER") bitmap: Bitmap) {
        if (finished) return
        if (face == null) {
            mainHandler.post { hintView.text = "No face detected — look at the camera" }
            return
        }

        when (livenessDetector.process(face)) {
            LivenessState.CHECKING -> mainHandler.post {
                hintView.text = "Blink twice (${livenessDetector.blinkCount}/2) or turn your head slightly"
            }
            LivenessState.PASSED -> {
                // blinkCount/head-turn stay "passed" on every subsequent frame once
                // triggered — without this guard, onFrame would call requestCapture
                // again on every frame during the score-display delay below,
                // stacking up concurrent captures.
                if (capturing) return
                capturing = true
                mainHandler.post { hintView.text = "Hold still…" }
                cameraManager.requestCapture(::onCaptured)
            }
            LivenessState.TIMEOUT -> finishWith(reason = "LIVENESS_TIMEOUT")
        }
    }

    private fun onCaptured(faceBitmap: Bitmap) {
        embeddingExecutor.execute {
            val embedding = embeddingEngine.generate(faceBitmap)
            mainHandler.post {
                if (embedding == null) {
                    finishWith(reason = "EMBEDDING_FAILED")
                    return@post
                }
                val reference = referenceEmbedding
                if (reference == null) {
                    finishWith(embedding = embedding)
                    return@post
                }
                // Show the score briefly before closing — purely informational,
                // JS still makes the actual pass/fail call on the same embedding.
                val score = cosineSimilarity(embedding, reference)
                val pct = (score * 100).toInt().coerceIn(0, 100)
                hintView.text = if (score >= MATCH_THRESHOLD) "Matched — $pct%" else "Low match — $pct%"
                scoreView.text = "Face match: $pct%"
                scoreView.visibility = View.VISIBLE
                scoreBar.score = score
                scoreBar.visibility = View.VISIBLE
                mainHandler.postDelayed({ finishWith(embedding = embedding) }, 900L)
            }
        }
    }

    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size) return 0f
        var dot = 0f
        for (i in a.indices) dot += a[i] * b[i]
        return dot.coerceIn(-1f, 1f)
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
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
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

        canvas.drawOval(rect, ovalStrokePaint)
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
