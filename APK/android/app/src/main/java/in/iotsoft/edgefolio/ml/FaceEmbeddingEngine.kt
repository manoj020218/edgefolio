package `in`.iotsoft.edgefolio.ml

import android.content.Context
import android.graphics.Bitmap
import dagger.hilt.android.qualifiers.ApplicationContext
import org.tensorflow.lite.Interpreter
import timber.log.Timber
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.sqrt

// Model file must be placed at app/src/main/assets/mobilefacenet.tflite
// Input:  [1, 112, 112, 3] float32 normalised to [-1, 1]
// Output: [1, 128] float32 L2-normalised embedding
private const val MODEL_FILE    = "mobilefacenet.tflite"
private const val INPUT_SIZE    = 112
private const val EMBEDDING_DIM = 128
const val FACE_MATCH_THRESHOLD  = 0.60f

@Singleton
class FaceEmbeddingEngine @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val interpreter: Interpreter by lazy {
        val afd = context.assets.openFd(MODEL_FILE)
        val ch  = FileInputStream(afd.fileDescriptor).channel
        val buf = ch.map(FileChannel.MapMode.READ_ONLY, afd.startOffset, afd.declaredLength)
        Interpreter(buf, Interpreter.Options().apply { setNumThreads(2) })
    }

    fun generate(faceBitmap: Bitmap): FloatArray? = try {
        val scaled = Bitmap.createScaledBitmap(faceBitmap, INPUT_SIZE, INPUT_SIZE, true)
        val buf    = bitmapToBuffer(scaled)
        val out    = Array(1) { FloatArray(EMBEDDING_DIM) }
        interpreter.run(buf, out)
        l2Normalize(out[0])
    } catch (e: Exception) {
        Timber.e(e, "TFLite inference failed")
        null
    }

    // Both vectors are L2-normalised so cosine similarity = dot product
    fun cosine(a: FloatArray, b: FloatArray): Float {
        var dot = 0f
        for (i in a.indices) dot += a[i] * b[i]
        return dot
    }

    fun matches(embedding: FloatArray, ref: FloatArray): Boolean =
        cosine(embedding, ref) >= FACE_MATCH_THRESHOLD

    // EMA reference update — call at most once per calendar day after a successful match
    fun emaUpdate(stored: FloatArray, fresh: FloatArray, beta: Float = 0.15f): FloatArray =
        l2Normalize(FloatArray(EMBEDDING_DIM) { beta * fresh[it] + (1f - beta) * stored[it] })

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

    fun l2Normalize(v: FloatArray): FloatArray {
        val norm = sqrt(v.fold(0.0) { acc, x -> acc + x * x }.toFloat()).coerceAtLeast(1e-10f)
        return FloatArray(v.size) { v[it] / norm }
    }
}
