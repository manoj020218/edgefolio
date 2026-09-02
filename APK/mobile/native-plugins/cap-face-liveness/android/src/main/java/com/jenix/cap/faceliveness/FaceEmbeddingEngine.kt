package com.jenix.cap.faceliveness

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.sqrt

// Ported from APK/android's
// app/src/main/java/in/iotsoft/edgefolio/ml/FaceEmbeddingEngine.kt
// (Hilt DI removed — this plugin isn't Hilt-wired like the native app; plain constructor instead).
//
// Model file must be placed at android/app/src/main/assets/mobilefacenet.tflite
// in the HOST app (APK/mobile/android/app) — see FACE_MODEL_README.txt for where
// to get it. Not committed to git (binary size).
//
// The publicly-available "MobileFaceNet.tflite" (sirius-ai lineage, widely mirrored,
// e.g. syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing) is a *pairwise*
// export: input [2, 112, 112, 3], output "embeddings" [2, 192] float32 — verified
// directly against the actual file (2026-09-02), not assumed from docs, which is
// how the original [1,112,112,3]->[1,128] assumption here turned out to be wrong.
// We only ever need one embedding at a time, so both batch slots are filled with
// the same image and only row 0 of the output is used.
private const val MODEL_FILE    = "mobilefacenet.tflite"
private const val INPUT_SIZE    = 112
private const val BATCH_SIZE    = 2
private const val EMBEDDING_DIM = 192

class FaceEmbeddingEngine(private val context: Context) {

    private val interpreter: Interpreter? by lazy {
        try {
            val afd = context.assets.openFd(MODEL_FILE)
            val ch  = FileInputStream(afd.fileDescriptor).channel
            val buf = ch.map(FileChannel.MapMode.READ_ONLY, afd.startOffset, afd.declaredLength)
            Interpreter(buf, Interpreter.Options().apply { setNumThreads(2) })
        } catch (e: Exception) {
            Log.e("FaceLiveness", "mobilefacenet.tflite not found in assets", e)
            null
        }
    }

    fun isModelAvailable(): Boolean = interpreter != null

    fun generate(faceBitmap: Bitmap): FloatArray? {
        val model = interpreter ?: return null
        return try {
            val scaled = Bitmap.createScaledBitmap(faceBitmap, INPUT_SIZE, INPUT_SIZE, true)
            val buf    = bitmapToBuffer(scaled)
            val out    = Array(BATCH_SIZE) { FloatArray(EMBEDDING_DIM) }
            model.run(buf, out)
            l2Normalize(out[0])
        } catch (e: Exception) {
            Log.e("FaceLiveness", "TFLite inference failed", e)
            null
        }
    }

    // Fills both batch slots with the same image — the model requires batch=2,
    // we only care about one face at a time.
    private fun bitmapToBuffer(bmp: Bitmap): ByteBuffer {
        val buf    = ByteBuffer.allocateDirect(BATCH_SIZE * INPUT_SIZE * INPUT_SIZE * 3 * 4).order(ByteOrder.nativeOrder())
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        bmp.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        repeat(BATCH_SIZE) {
            for (px in pixels) {
                buf.putFloat(((px shr 16 and 0xFF) / 128f) - 1f)
                buf.putFloat(((px shr  8 and 0xFF) / 128f) - 1f)
                buf.putFloat(((px        and 0xFF) / 128f) - 1f)
            }
        }
        buf.rewind()
        return buf
    }

    private fun l2Normalize(v: FloatArray): FloatArray {
        val norm = sqrt(v.fold(0.0) { acc, x -> acc + x * x }.toFloat()).coerceAtLeast(1e-10f)
        return FloatArray(v.size) { v[it] / norm }
    }
}
