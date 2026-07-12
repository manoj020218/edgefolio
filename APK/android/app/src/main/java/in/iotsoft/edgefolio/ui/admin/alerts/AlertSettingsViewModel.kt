package `in`.iotsoft.edgefolio.ui.admin.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.AlertSubscription
import `in`.iotsoft.edgefolio.data.model.CreateAlertSubscriptionRequest
import `in`.iotsoft.edgefolio.data.model.EmployeeDetail
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class AlertRow(
    val employee: EmployeeDetail,
    val subscription: AlertSubscription?,  // null = no subscription
)

data class AlertSettingsState(
    val isLoading: Boolean = true,
    val rows: List<AlertRow> = emptyList(),
    val errorMessage: String? = null,
)

@HiltViewModel
class AlertSettingsViewModel @Inject constructor(
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _state = MutableStateFlow(AlertSettingsState())
    val state: StateFlow<AlertSettingsState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val empResp = apiClient.get().getEmployees()
                val subResp = apiClient.get().getAlertSubscriptions()

                val employees = empResp.body()?.data ?: emptyList()
                val subs      = subResp.body()?.data  ?: emptyList()
                val subMap    = subs.associateBy { it.watched.id }

                _state.update { it.copy(isLoading = false, rows = employees.map { emp -> AlertRow(emp, subMap[emp.id]) }) }
            } catch (e: Exception) {
                Timber.e(e, "AlertSettingsViewModel load failed")
                _state.update { it.copy(isLoading = false, errorMessage = "Failed to load data") }
            }
        }
    }

    /**
     * Toggle checkin or checkout alert for an employee.
     * Strategy: delete existing subscription (if any) and recreate with updated flags.
     * If both flags end up false, just delete without recreating.
     */
    fun toggle(empId: String, checkin: Boolean, checkout: Boolean) {
        viewModelScope.launch {
            try {
                val existing = _state.value.rows.firstOrNull { it.employee.id == empId }?.subscription
                // Delete existing subscription if present
                if (existing != null) apiClient.get().deleteAlertSubscription(existing.id)
                // Recreate if at least one flag is on
                if (checkin || checkout) {
                    apiClient.get().createAlertSubscription(
                        CreateAlertSubscriptionRequest(empId, checkin, checkout)
                    )
                }
                load()
            } catch (e: Exception) {
                Timber.e(e, "toggle alert failed")
                _state.update { it.copy(errorMessage = "Failed to update subscription") }
            }
        }
    }
}
