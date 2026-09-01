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
// in the HOST app (APK/mobile/android/app), same as APK/android's — see that
// project's FACE_MODEL_README.txt for where to get it. Not committed to git
// (binary size).
// Input:  [1, 112, 112, 3] float32 normalised to [-1, 1]
// Output: [1, 128] float32 L2-normalised embedding
private const val MODEL_FILE    = "mobilefacenet.tflite"
private const val INPUT_SIZE    = 112
private const val EMBEDDING_DIM = 128

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
            val out    = Array(1) { FloatArray(EMBEDDING_DIM) }
            model.run(buf, out)
            l2Normalize(out[0])
        } catch (e: Exception) {
            Log.e("FaceLiveness", "TFLite inference failed", e)
            null
        }
    }

    private fun bitmapToBuffer(bmp: Bitmap): ByteBuffer {
        val buf    = ByteBuffer.allocateDirect(INPUT_SIZE * INPUT_SIZE * 3 * 4).order(ByteOrder.nativeOrder())
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        bmp.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (px in pixels) {
            buf.putFloat(((px shr 16 and 0xFF) / 128f) - 1f)
            buf.putFloat(((px shr  8 and 0xFF) / 128f) - 1f)
            buf.putFloat(((px        and 0xFF) / 128f) - 1f)
        }
        return buf
    }

    private fun l2Normalize(v: FloatArray): FloatArray {
        val norm = sqrt(v.fold(0.0) { acc, x -> acc + x * x }.toFloat()).coerceAtLeast(1e-10f)
        return FloatArray(v.size) { v[it] / norm }
    }
}
