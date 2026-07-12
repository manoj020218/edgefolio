package `in`.iotsoft.edgefolio.ui.admin.broadcast

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.AnnouncementRequest
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class BroadcastState(
    val isLoading: Boolean = false,
    val sentTo: Int? = null,          // non-null after success
    val errorMessage: String? = null,
)

@HiltViewModel
class BroadcastViewModel @Inject constructor(
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _state = MutableStateFlow(BroadcastState())
    val state: StateFlow<BroadcastState> = _state

    fun send(type: String, message: String) {
        if (message.isBlank()) {
            _state.update { it.copy(errorMessage = "Message cannot be empty") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, sentTo = null) }
            try {
                val resp = apiClient.get().broadcast(AnnouncementRequest(type, message))
                if (resp.isSuccessful && resp.body()?.ok == true) {
                    val sentTo = (resp.body()!!.data as? Map<*, *>)?.get("sentTo")?.toString()?.toIntOrNull() ?: 0
                    _state.update { it.copy(isLoading = false, sentTo = sentTo) }
                } else {
                    _state.update { it.copy(isLoading = false, errorMessage = "Broadcast failed") }
                }
            } catch (e: Exception) {
                Timber.e(e, "broadcast failed")
                _state.update { it.copy(isLoading = false, errorMessage = "Network error") }
            }
        }
    }

    fun reset() { _state.update { it.copy(sentTo = null, errorMessage = null) } }
}
