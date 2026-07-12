package `in`.iotsoft.edgefolio.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.ForgotPasswordRequest
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ForgotPwdState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ForgotPwdState())
    val uiState: StateFlow<ForgotPwdState> = _uiState

    fun sendRequest(empCode: String) {
        if (empCode.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Employee ID is required")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val baseUrl = prefs.resolvedBaseUrl ?: run {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Please login first to set Company ID")
                    return@launch
                }
                val resp = apiClient.get(baseUrl).forgotPassword(
                    ForgotPasswordRequest(empId = empCode, companyId = prefs.companyId)
                )
                if (resp.isSuccessful) {
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true)
                } else {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Employee ID not found.")
                }
            } catch (e: Exception) {
                Timber.e(e)
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Cannot reach office server.")
            }
        }
    }
}
