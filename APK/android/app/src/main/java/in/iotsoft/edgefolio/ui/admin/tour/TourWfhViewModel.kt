package `in`.iotsoft.edgefolio.ui.admin.tour

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.CreateWorkAssignmentRequest
import `in`.iotsoft.edgefolio.data.model.EmployeeDetail
import `in`.iotsoft.edgefolio.data.model.WorkAssignment
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDate
import javax.inject.Inject

data class EmployeeRow(
    val employee: EmployeeDetail,
    val assignment: WorkAssignment?,   // null = office (default)
)

data class TourWfhState(
    val isLoading: Boolean = true,
    val rows: List<EmployeeRow> = emptyList(),
    val filter: String = "all",       // "all" | "tour" | "wfh" | "office"
    val errorMessage: String? = null,
    val successMessage: String? = null,
)

@HiltViewModel
class TourWfhViewModel @Inject constructor(
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _state = MutableStateFlow(TourWfhState())
    val state: StateFlow<TourWfhState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val today = LocalDate.now().toString()
                val empResp = apiClient.get().getEmployees()
                val waResp  = apiClient.get().getWorkAssignments(date = today)

                val employees   = empResp.body()?.data ?: emptyList()
                val assignments = waResp.body()?.data  ?: emptyList()

                // Index assignments by employeeId for O(1) lookup
                val assignMap = assignments.associateBy { it.employee.id }

                val rows = employees.map { emp ->
                    EmployeeRow(emp, assignMap[emp.id])
                }
                _state.update { it.copy(isLoading = false, rows = rows) }
            } catch (e: Exception) {
                Timber.e(e, "TourWfhViewModel load failed")
                _state.update { it.copy(isLoading = false, errorMessage = "Failed to load data") }
            }
        }
    }

    fun createAssignment(employeeId: String, workType: String, fromDate: String, toDate: String, notes: String?) {
        viewModelScope.launch {
            try {
                val resp = apiClient.get().createWorkAssignment(
                    CreateWorkAssignmentRequest(employeeId, workType, fromDate, toDate, notes?.ifBlank { null })
                )
                if (resp.isSuccessful && resp.body()?.ok == true) {
                    _state.update { it.copy(successMessage = "Assignment created") }
                    load()
                } else {
                    _state.update { it.copy(errorMessage = "Failed to create assignment") }
                }
            } catch (e: Exception) {
                Timber.e(e, "createAssignment failed")
                _state.update { it.copy(errorMessage = "Network error") }
            }
        }
    }

    fun deleteAssignment(id: String) {
        viewModelScope.launch {
            try {
                apiClient.get().deleteWorkAssignment(id)
                load()
            } catch (e: Exception) {
                Timber.w(e, "deleteAssignment failed")
                _state.update { it.copy(errorMessage = "Failed to delete assignment") }
            }
        }
    }

    fun setFilter(filter: String) { _state.update { it.copy(filter = filter) } }
    fun clearMessages() { _state.update { it.copy(errorMessage = null, successMessage = null) } }

    fun filteredRows(): List<EmployeeRow> {
        val rows = _state.value.rows
        return when (_state.value.filter) {
            "tour"   -> rows.filter { it.assignment?.workType == "tour" }
            "wfh"    -> rows.filter { it.assignment?.workType == "wfh" }
            "office" -> rows.filter { it.assignment == null }
            else     -> rows
        }
    }
}
