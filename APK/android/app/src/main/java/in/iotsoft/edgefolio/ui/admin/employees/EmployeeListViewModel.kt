package `in`.iotsoft.edgefolio.ui.admin.employees

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.EmployeeDetail
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class EmployeeListState(
    val isLoading: Boolean = true,
    val employees: List<EmployeeDetail> = emptyList(),
    val errorMessage: String? = null,
    val togglingId: String? = null,   // empId currently being toggled (disables its switch)
)

@HiltViewModel
class EmployeeListViewModel @Inject constructor(
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _state = MutableStateFlow(EmployeeListState())
    val state: StateFlow<EmployeeListState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val resp = apiClient.get().getEmployees()
                val list = resp.body()?.data ?: emptyList()
                _state.update { it.copy(isLoading = false, employees = list) }
            } catch (e: Exception) {
                Timber.e(e, "EmployeeListViewModel load failed")
                _state.update { it.copy(isLoading = false, errorMessage = "Failed to load employees") }
            }
        }
    }

    fun toggleMobileLogin(emp: EmployeeDetail) {
        val newVal = if (emp.mobileLoginEnabled == 1) 0 else 1
        viewModelScope.launch {
            _state.update { it.copy(togglingId = emp.id) }
            try {
                val resp = apiClient.get().patchEmployee(emp.id, mapOf("mobileLoginEnabled" to newVal))
                if (resp.isSuccessful) {
                    _state.update { s ->
                        s.copy(
                            togglingId = null,
                            employees  = s.employees.map { e ->
                                if (e.id == emp.id) e.copy(mobileLoginEnabled = newVal) else e
                            },
                        )
                    }
                } else {
                    _state.update { it.copy(togglingId = null, errorMessage = "Failed to update") }
                }
            } catch (e: Exception) {
                Timber.e(e, "toggleMobileLogin failed")
                _state.update { it.copy(togglingId = null, errorMessage = "Network error") }
            }
        }
    }

    fun clearError() { _state.update { it.copy(errorMessage = null) } }
}
