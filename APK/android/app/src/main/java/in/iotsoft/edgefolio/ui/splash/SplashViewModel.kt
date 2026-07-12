package `in`.iotsoft.edgefolio.ui.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.BuildConfig
import `in`.iotsoft.edgefolio.data.model.ApkConfig
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

sealed class SplashState {
    data object Loading     : SplashState()
    data object GoToLogin   : SplashState()
    data object GoToEmployee : SplashState()
    data object GoToAdmin   : SplashState()
    data object GoToOwner   : SplashState()
}

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _state = MutableStateFlow<SplashState>(SplashState.Loading)
    val state: StateFlow<SplashState> = _state

    init {
        viewModelScope.launch { checkSession() }
    }

    private suspend fun checkSession() {
        val token   = prefs.authToken
        val role    = prefs.role
        val baseUrl = prefs.resolvedBaseUrl

        if (token.isNullOrBlank() || role.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            _state.value = SplashState.GoToLogin
            return
        }

        // Check APK version against EDGE config (non-blocking; if fails, proceed)
        try {
            val response = apiClient.get(baseUrl).getConfig()
            if (response.isSuccessful) {
                val config = response.body()?.data
                if (config != null && isForceUpdate(config)) {
                    // Force update — still go to login so user sees the update prompt
                    prefs.clearAuth()
                    _state.value = SplashState.GoToLogin
                    return
                }
            }
        } catch (e: Exception) {
            Timber.w("Version check failed (non-fatal): ${e.message}")
        }

        _state.value = when (role) {
            "owner"    -> SplashState.GoToOwner
            "hr-admin" -> SplashState.GoToAdmin
            else       -> SplashState.GoToEmployee
        }
    }

    private fun isForceUpdate(config: ApkConfig): Boolean {
        val current = BuildConfig.VERSION_NAME
        return compareVersions(current, config.minApkVersion) < 0
    }

    // Returns negative if a < b, 0 if equal, positive if a > b
    internal fun compareVersions(a: String, b: String): Int {
        val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
        val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val diff = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
            if (diff != 0) return diff
        }
        return 0
    }
}
