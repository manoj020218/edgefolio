package `in`.iotsoft.edgefolio.ui.admin

import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalTime
import java.time.format.DateTimeFormatter

enum class EdgeStatus { UNKNOWN, ONLINE, OFFLINE }

data class EdgeHealthState(
    val status: EdgeStatus = EdgeStatus.UNKNOWN,
    val lastSeenOnline: String? = null,   // "HH:mm"
)

class EdgeHealthMonitor(
    private val apiClient: ApiClient,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(EdgeHealthState())
    val state: StateFlow<EdgeHealthState> = _state

    private var job: Job? = null
    private var failCount = 0
    private val timeFmt = DateTimeFormatter.ofPattern("HH:mm")

    fun start(baseUrl: String) {
        job?.cancel()
        job = scope.launch {
            while (true) {
                try {
                    val ok = apiClient.get(baseUrl).health().isSuccessful
                    if (ok) {
                        failCount = 0
                        val now = LocalTime.now().format(timeFmt)
                        _state.value = EdgeHealthState(EdgeStatus.ONLINE, now)
                    } else {
                        onFail()
                    }
                } catch (e: Exception) {
                    Timber.d("EdgeHealthMonitor: ping failed — ${e.message}")
                    onFail()
                }
                delay(30_000L)
            }
        }
    }

    fun stop() { job?.cancel() }

    private fun onFail() {
        failCount++
        if (failCount >= 3) {
            _state.value = _state.value.copy(status = EdgeStatus.OFFLINE)
        }
    }
}
