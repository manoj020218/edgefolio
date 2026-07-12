package `in`.iotsoft.edgefolio.ui.attendance

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.RectF
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import timber.log.Timber
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraXManager(
    private val context: Context,
    // Delivers every analysed frame: detected face (or null), normalised bounding box, mirrored bitmap
    private val onFrame: (face: Face?, bounds: RectF?, bitmap: Bitmap) -> Unit,
) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .setMinFaceSize(0.20f)
            .build()
    )

    // When non-null, the next frame that contains a face will be cropped + delivered here
    private var captureCallback: ((Bitmap) -> Unit)? = null

    fun bind(owner: LifecycleOwner, previewView: PreviewView) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val preview  = Preview.Builder().build()
                .also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also { ia -> ia.setAnalyzer(executor) { proxy -> analyzeProxy(proxy) } }
            try {
                provider.unbindAll()
                provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
            } catch (e: Exception) {
                Timber.e(e, "CameraX bind failed")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    /** Ask for the next face-containing frame to be delivered as a cropped Bitmap. */
    fun requestCapture(callback: (Bitmap) -> Unit) {
        captureCallback = callback
    }

    private fun analyzeProxy(proxy: ImageProxy) {
        val bitmap   = proxy.toBitmap()
        val mirrored = bitmap.mirror()
        val fw = mirrored.width.toFloat()
        val fh = mirrored.height.toFloat()

        detector.process(InputImage.fromBitmap(mirrored, 0))
            .addOnSuccessListener { faces ->
                val face   = faces.firstOrNull()
                val bounds = face?.boundingBox?.let { b ->
                    RectF(b.left / fw, b.top / fh, b.right / fw, b.bottom / fh)
                }
                onFrame(face, bounds, mirrored)

                captureCallback?.let { cb ->
                    if (face != null) {
                        val cropped = mirrored.cropFace(face)
                        if (cropped != null) {
                            captureCallback = null
                            cb(cropped)
                        }
                    }
                }
            }
            .addOnCompleteListener { proxy.close() }
    }

    fun release() {
        executor.shutdown()
        detector.close()
    }

    // Front camera frames are mirrored — flip horizontally for a natural preview
    private fun Bitmap.mirror(): Bitmap {
        val m = Matrix().apply { preScale(-1f, 1f) }
        return Bitmap.createBitmap(this, 0, 0, width, height, m, true)
    }

    private fun Bitmap.cropFace(face: Face): Bitmap? {
        val box = face.boundingBox
        val pad = (box.width() * 0.25f).toInt()
        val l   = (box.left   - pad).coerceAtLeast(0)
        val t   = (box.top    - pad).coerceAtLeast(0)
        val r   = (box.right  + pad).coerceAtMost(width)
        val b   = (box.bottom + pad).coerceAtMost(height)
        return if (r > l && b > t) Bitmap.createBitmap(this, l, t, r - l, b - t) else null
    }
}
