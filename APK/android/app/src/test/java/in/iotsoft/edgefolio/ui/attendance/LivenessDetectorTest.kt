package `in`.iotsoft.edgefolio.ui.attendance

import com.google.mlkit.vision.face.Face
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class LivenessDetectorTest {

    private lateinit var detector: LivenessDetector

    @Before
    fun setup() {
        detector = LivenessDetector(timeoutMs = 60_000L)  // long timeout so tests don't race
    }

    private fun face(eulerY: Float = 0f, leftOpen: Float = 1f, rightOpen: Float = 1f): Face =
        mockk<Face>(relaxed = true) {
            every { headEulerAngleY }       returns eulerY
            every { leftEyeOpenProbability  } returns leftOpen
            every { rightEyeOpenProbability } returns rightOpen
        }

    // ── Initial state ─────────────────────────────────────────────────────────

    @Test
    fun initialFrame_eyesOpen_noMovement_returns_CHECKING() {
        val result = detector.process(face(eulerY = 0f, leftOpen = 1f, rightOpen = 1f))
        assertEquals(LivenessState.CHECKING, result)
    }

    // ── Head movement ─────────────────────────────────────────────────────────

    @Test
    fun headMovement_5degrees_returns_PASSED() {
        detector.process(face(eulerY = 0f))          // sets prevEulerY
        val result = detector.process(face(eulerY = 5f))   // 5° delta → PASSED
        assertEquals(LivenessState.PASSED, result)
    }

    @Test
    fun headMovement_under5degrees_returns_CHECKING() {
        detector.process(face(eulerY = 0f))
        val result = detector.process(face(eulerY = 4.9f))
        assertEquals(LivenessState.CHECKING, result)
    }

    @Test
    fun headMovement_negative5degrees_returns_PASSED() {
        detector.process(face(eulerY = 0f))
        val result = detector.process(face(eulerY = -5f))
        assertEquals(LivenessState.PASSED, result)
    }

    // ── Blink detection ───────────────────────────────────────────────────────

    @Test
    fun oneBlink_returns_CHECKING() {
        // Eyes close
        detector.process(face(leftOpen = 0.2f, rightOpen = 0.2f))
        // Eyes open again → 1 blink counted
        val result = detector.process(face(leftOpen = 1f, rightOpen = 1f))
        assertEquals(1, detector.blinkCount)
        assertEquals(LivenessState.CHECKING, result)
    }

    @Test
    fun twoBlinks_returns_PASSED() {
        // Blink 1
        detector.process(face(leftOpen = 0.2f, rightOpen = 0.2f))
        detector.process(face(leftOpen = 1f,   rightOpen = 1f))
        // Blink 2
        detector.process(face(leftOpen = 0.2f, rightOpen = 0.2f))
        val result = detector.process(face(leftOpen = 1f, rightOpen = 1f))

        assertEquals(2, detector.blinkCount)
        assertEquals(LivenessState.PASSED, result)
    }

    @Test
    fun blinkCount_notIncrementedIfEyesNeverClosed() {
        repeat(10) { detector.process(face(leftOpen = 1f, rightOpen = 1f)) }
        assertEquals(0, detector.blinkCount)
    }

    @Test
    fun blinkCount_notIncrementedIfEyesStayClosed() {
        // Eyes close and stay closed — should not count as a blink until they reopen
        repeat(5) { detector.process(face(leftOpen = 0.1f, rightOpen = 0.1f)) }
        assertEquals(0, detector.blinkCount)
    }

    @Test
    fun partialBlink_onlyOneEyeClosed_notCounted() {
        // Only left eye closed — right still open
        detector.process(face(leftOpen = 0.1f, rightOpen = 0.9f))  // not fully closed
        detector.process(face(leftOpen = 1f,   rightOpen = 1f))
        assertEquals(0, detector.blinkCount)
    }

    // ── Reset ─────────────────────────────────────────────────────────────────

    @Test
    fun reset_clearsBlinkCount() {
        detector.process(face(leftOpen = 0.2f, rightOpen = 0.2f))
        detector.process(face(leftOpen = 1f,   rightOpen = 1f))
        assertEquals(1, detector.blinkCount)

        detector.reset()
        assertEquals(0, detector.blinkCount)
    }

    @Test
    fun reset_clearsHeadMovementBaseline() {
        detector.process(face(eulerY = 0f))
        detector.reset()
        // After reset, the first frame sets a new prevEulerY — 5° from here should pass
        detector.process(face(eulerY = 0f))
        val result = detector.process(face(eulerY = 5f))
        assertEquals(LivenessState.PASSED, result)
    }
}
