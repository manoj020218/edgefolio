package `in`.iotsoft.edgefolio.ui.attendance

import com.google.mlkit.vision.face.Face
import kotlin.math.abs

enum class LivenessState { CHECKING, PASSED, TIMEOUT }

/**
 * Stateful liveness checker.
 * Pass = 2 blinks (eye-open probability < 0.3 for one frame, then back > 0.5)
 *      OR head Euler-Y movement ≥ 5° between consecutive frames.
 * Timeout = no pass within [timeoutMs] ms.
 */
class LivenessDetector(private val timeoutMs: Long = 5_000L) {

    private val startTime      = System.currentTimeMillis()
    var blinkCount             = 0
        private set
    private var eyesWereClosed = false
    private var prevEulerY     = Float.NaN

    fun process(face: Face): LivenessState {
        if (System.currentTimeMillis() - startTime > timeoutMs) return LivenessState.TIMEOUT

        val eulerY = face.headEulerAngleY
        if (!prevEulerY.isNaN() && abs(eulerY - prevEulerY) >= 5f) return LivenessState.PASSED
        prevEulerY = eulerY

        val leftOpen  = face.leftEyeOpenProbability  ?: 1f
        val rightOpen = face.rightEyeOpenProbability ?: 1f
        val closed    = leftOpen < 0.3f && rightOpen < 0.3f
        if (closed && !eyesWereClosed) {
            eyesWereClosed = true
        } else if (!closed && eyesWereClosed) {
            eyesWereClosed = false
            blinkCount++
        }
        if (blinkCount >= 2) return LivenessState.PASSED

        return LivenessState.CHECKING
    }

    fun reset() {
        blinkCount     = 0
        eyesWereClosed = false
        prevEulerY     = Float.NaN
    }
}
