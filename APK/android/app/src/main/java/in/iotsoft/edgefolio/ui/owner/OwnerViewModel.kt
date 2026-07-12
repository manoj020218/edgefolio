package `in`.iotsoft.edgefolio.ui.owner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.AnalyticsResponse
import `in`.iotsoft.edgefolio.data.model.LiveFeedEntry
import `in`.iotsoft.edgefolio.data.model.LiveSummary
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.ui.admin.EdgeHealthMonitor
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class OwnerDashboardState(
    val isLoading: Boolean = true,
    val summary: LiveSummary? = null,
    val feed: List<LiveFeedEntry> = emptyList(),
    val analytics: AnalyticsResponse? = null,
    val timelineFilter: String = "all",   // all | present | tour | wfh | absent
    val errorMessage: String? = null,
)

@HiltViewModel
class OwnerViewModel @Inject constructor(
    private val apiClient: ApiClient,
    private val prefs: EncryptedPrefs,
) : ViewModel() {

    val healthMonitor = EdgeHealthMonitor(apiClient, viewModelScope)

    private val _state = MutableStateFlow(OwnerDashboardState())
    val state: StateFlow<OwnerDashboardState> = _state

    init {
        val baseUrl = prefs.baseUrl
        if (!baseUrl.isNullOrBlank()) healthMonitor.start(baseUrl)
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val feedDeferred      = async { apiClient.get().getLiveFeed() }
                val analyticsDeferred = async { apiClient.get().getAnalytics() }

                val feedResp      = feedDeferred.await()
                val analyticsResp = analyticsDeferred.await()

                val feedData      = feedResp.body()?.data
                val analyticsData = analyticsResp.body()?.data

                _state.update {
                    it.copy(
                        isLoading = false,
                        summary   = feedData?.summary,
                        feed      = feedData?.feed ?: emptyList(),
                        analytics = analyticsData,
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "OwnerViewModel load failed")
                _state.update { it.copy(isLoading = false, errorMessage = "Failed to load data") }
            }
        }
    }

    fun setTimelineFilter(filter: String) {
        _state.update { it.copy(timelineFilter = filter) }
    }

    fun filteredTimeline(): List<LiveFeedEntry> {
        val feed = _state.value.feed
        return when (_state.value.timelineFilter) {
            "present" -> feed.filter { it.checkinTime != null }
            "tour"    -> feed.filter { it.workType == "mobile-tour" }
            "wfh"     -> feed.filter { it.workType == "mobile-wfh" }
            "absent"  -> feed.filter { it.checkinTime == null }
            else      -> feed
        }
    }

    override fun onCleared() {
        super.onCleared()
        healthMonitor.stop()
    }
}
