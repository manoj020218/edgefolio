package `in`.iotsoft.edgefolio.ui.splash

import io.mockk.every
import io.mockk.mockk
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for version string comparison logic in SplashViewModel.
 * Uses MockK to satisfy constructor dependencies without Android components.
 */
class VersionCheckTest {

    private val prefs     = mockk<EncryptedPrefs>(relaxed = true)
    private val apiClient = mockk<ApiClient>(relaxed = true)
    private val vm        = SplashViewModel(prefs, apiClient)

    @Test
    fun compareVersions_equalStrings_returnsZero() {
        val result = vm.compareVersions("1.0.0", "1.0.0")
        assertTrue("equal versions should return 0", result == 0)
    }

    @Test
    fun compareVersions_currentGreater_returnsPositive() {
        assertTrue(vm.compareVersions("1.1.0", "1.0.0") > 0)
        assertTrue(vm.compareVersions("2.0.0", "1.9.9") > 0)
        assertTrue(vm.compareVersions("1.0.1", "1.0.0") > 0)
    }

    @Test
    fun compareVersions_currentLower_returnsNegative() {
        assertTrue(vm.compareVersions("1.0.0", "1.0.1") < 0)
        assertTrue(vm.compareVersions("0.9.9", "1.0.0") < 0)
        assertTrue(vm.compareVersions("1.0.0", "2.0.0") < 0)
    }

    @Test
    fun compareVersions_differentSegmentLengths_handledGracefully() {
        // "1.0" vs "1.0.0" should be equal (missing segment treated as 0)
        assertTrue(vm.compareVersions("1.0", "1.0.0") == 0)
        assertTrue(vm.compareVersions("1.0.0.1", "1.0.0") > 0)
    }

    @Test
    fun compareVersions_forcedUpdate_detectedCorrectly() {
        // v1.0.0 app with min_apk_version 1.1.0 → force update required
        assertTrue("should detect force update when current < min", vm.compareVersions("1.0.0", "1.1.0") < 0)
    }

    @Test
    fun compareVersions_noForcedUpdate_detectedCorrectly() {
        // v1.1.0 app with min_apk_version 1.0.0 → no force update
        assertTrue("should not force update when current > min", vm.compareVersions("1.1.0", "1.0.0") > 0)
    }
}
