package `in`.iotsoft.edgefolio.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.LiveFeedEntry
import `in`.iotsoft.edgefolio.data.model.LiveSummary
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class AdminHomeState(
    val isLoading: Boolean = true,
    val adminName: String = "",
    val summary: LiveSummary? = null,
    val feed: List<LiveFeedEntry> = emptyList(),
    val errorMessage: String? = null,
)

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _homeState = MutableStateFlow(AdminHomeState(adminName = prefs.empName ?: ""))
    val homeState: StateFlow<AdminHomeState> = _homeState

    val healthMonitor = EdgeHealthMonitor(apiClient, viewModelScope)

    init {
        val baseUrl = prefs.resolvedBaseUrl
        if (baseUrl != null) healthMonitor.start(baseUrl)
        loadLiveFeed()
    }

    fun loadLiveFeed() {
        viewModelScope.launch {
            _homeState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val resp = apiClient.get().getLiveFeed()
                val body = resp.body()?.data
                _homeState.update { it.copy(isLoading = false, summary = body?.summary, feed = body?.feed ?: emptyList()) }
            } catch (e: Exception) {
                Timber.w(e, "loadLiveFeed failed")
                _homeState.update { it.copy(isLoading = false, errorMessage = "Could not load live feed") }
            }
        }
    }

    override fun onCleared() {
        healthMonitor.stop()
        super.onCleared()
    }
}
