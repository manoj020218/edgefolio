package com.jenix.cap.faceliveness

import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

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
        const val EXTRA_TIMEOUT_MS = "timeoutMs"
        const val EXTRA_EMBEDDING  = "embedding"
        const val EXTRA_REASON     = "reason"
    }

    private lateinit var cameraManager: CameraXManager
    private lateinit var embeddingEngine: FaceEmbeddingEngine
    private lateinit var livenessDetector: LivenessDetector
    private lateinit var hintView: TextView
    private lateinit var previewView: PreviewView

    private val mainHandler = Handler(Looper.getMainLooper())
    private val embeddingExecutor = Executors.newSingleThreadExecutor()
    private var timeoutRunnable: Runnable? = null
    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            finishWith(reason = "PERMISSION_DENIED")
            return
        }

        val timeoutMs = intent.getLongExtra(EXTRA_TIMEOUT_MS, 5_000L)

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

        hintView = TextView(this).apply {
            text = "Look at the camera and blink twice"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#99000000"))
            setPadding(32, 24, 32, 24)
            textSize = 16f
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            )
        }
        root.addView(hintView)

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
                } else {
                    finishWith(embedding = embedding)
                }
            }
        }
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
