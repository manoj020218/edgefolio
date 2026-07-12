package `in`.iotsoft.edgefolio.ml

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Tests for the pure math functions used in face recognition.
 * These replicate the formulas from FaceEmbeddingEngine without requiring
 * a Context or the TFLite model file.
 */
class EmbeddingMathTest {

    // ── Helpers replicating FaceEmbeddingEngine logic ─────────────────────────

    private fun l2Normalize(v: FloatArray): FloatArray {
        val norm = sqrt(v.fold(0.0) { acc, x -> acc + x * x }.toFloat()).coerceAtLeast(1e-10f)
        return FloatArray(v.size) { v[it] / norm }
    }

    private fun cosine(a: FloatArray, b: FloatArray): Float {
        var dot = 0f
        for (i in a.indices) dot += a[i] * b[i]
        return dot
    }

    private fun emaUpdate(stored: FloatArray, fresh: FloatArray, beta: Float = 0.15f): FloatArray =
        l2Normalize(FloatArray(stored.size) { beta * fresh[it] + (1f - beta) * stored[it] })

    // ── l2Normalize ───────────────────────────────────────────────────────────

    @Test
    fun l2Normalize_unitVector_unchanged() {
        val v      = floatArrayOf(1f, 0f, 0f)
        val result = l2Normalize(v)
        assertNearlyEqual(1f, result[0])
        assertNearlyEqual(0f, result[1])
        assertNearlyEqual(0f, result[2])
    }

    @Test
    fun l2Normalize_resultIsUnitVector() {
        val v      = floatArrayOf(3f, 4f, 0f)   // magnitude = 5
        val result = l2Normalize(v)
        val mag    = sqrt(result.fold(0.0) { acc, x -> acc + x * x }.toFloat())
        assertNearlyEqual(1f, mag)
    }

    @Test
    fun l2Normalize_allZeros_doesNotCrash() {
        val v      = floatArrayOf(0f, 0f, 0f)
        val result = l2Normalize(v)  // should use coerceAtLeast(1e-10f) floor
        assertTrue(result.all { !it.isNaN() && !it.isInfinite() })
    }

    @Test
    fun l2Normalize_128dim_resultIsUnit() {
        val v      = FloatArray(128) { (it + 1).toFloat() }
        val result = l2Normalize(v)
        val mag    = sqrt(result.fold(0.0) { acc, x -> acc + x * x }.toFloat())
        assertNearlyEqual(1f, mag)
    }

    // ── cosine ────────────────────────────────────────────────────────────────

    @Test
    fun cosine_identicalL2NormalizedVectors_returns1() {
        val v      = l2Normalize(floatArrayOf(3f, 4f, 0f))
        val result = cosine(v, v)
        assertNearlyEqual(1f, result)
    }

    @Test
    fun cosine_oppositeVectors_returnsNeg1() {
        val v      = l2Normalize(floatArrayOf(1f, 0f, 0f))
        val neg    = floatArrayOf(-1f, 0f, 0f)
        val result = cosine(v, neg)
        assertNearlyEqual(-1f, result)
    }

    @Test
    fun cosine_orthogonalVectors_returns0() {
        val a = l2Normalize(floatArrayOf(1f, 0f, 0f))
        val b = l2Normalize(floatArrayOf(0f, 1f, 0f))
        assertNearlyEqual(0f, cosine(a, b))
    }

    @Test
    fun cosine_aboveThreshold_forNearlyIdentical() {
        val base    = l2Normalize(FloatArray(128) { 1f })
        val similar = l2Normalize(FloatArray(128) { if (it < 120) 1f else 0.5f })
        val sim     = cosine(base, similar)
        // Slightly modified vector should still be above 0.60 threshold
        assertTrue("Expected sim > 0.60, got $sim", sim > FACE_MATCH_THRESHOLD)
    }

    @Test
    fun cosine_belowThreshold_forVeryDifferent() {
        val a = l2Normalize(FloatArray(128) { if (it % 2 == 0) 1f else 0f })
        val b = l2Normalize(FloatArray(128) { if (it % 2 != 0) 1f else 0f })
        val sim = cosine(a, b)
        assertTrue("Expected sim < 0.60 for alternating vectors, got $sim", sim < FACE_MATCH_THRESHOLD)
    }

    // ── emaUpdate ─────────────────────────────────────────────────────────────

    @Test
    fun emaUpdate_resultIsUnitVector() {
        val stored = l2Normalize(FloatArray(128) { 1f })
        val fresh  = l2Normalize(FloatArray(128) { (it + 1).toFloat() })
        val result = emaUpdate(stored, fresh)
        val mag    = sqrt(result.fold(0.0) { acc, x -> acc + x * x }.toFloat())
        assertNearlyEqual(1f, mag)
    }

    @Test
    fun emaUpdate_repeatedUpdatesWithSameFresh_convergesOnFresh() {
        var stored = l2Normalize(floatArrayOf(1f, 0f, 0f, 0f))
        val fresh  = l2Normalize(floatArrayOf(0f, 1f, 0f, 0f))
        // After many EMA updates toward `fresh`, stored should approach fresh
        repeat(100) { stored = emaUpdate(stored, fresh) }
        val sim = cosine(stored, fresh)
        assertTrue("After 100 EMA updates, sim should be > 0.98, got $sim", sim > 0.98f)
    }

    @Test
    fun emaUpdate_beta015_singleUpdate_partialShift() {
        val stored = l2Normalize(floatArrayOf(1f, 0f, 0f))
        val fresh  = l2Normalize(floatArrayOf(0f, 1f, 0f))
        val result = emaUpdate(stored, fresh, beta = 0.15f)
        // result should lean heavily toward stored (β=0.15 means 85% stored, 15% fresh)
        // After L2-normalize, stored component should still dominate
        assertTrue("stored component should dominate", result[0] > result[1])
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun assertNearlyEqual(expected: Float, actual: Float, epsilon: Float = 0.001f) {
        assertTrue(
            "Expected $expected ± $epsilon but got $actual",
            abs(expected - actual) <= epsilon,
        )
    }
}
