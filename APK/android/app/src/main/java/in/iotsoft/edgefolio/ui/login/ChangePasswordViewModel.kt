package `in`.iotsoft.edgefolio.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.ChangePasswordRequest
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ChangePasswordState(
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val role: String = "employee",
    val errorMessage: String? = null,
)

@HiltViewModel
class ChangePasswordViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChangePasswordState())
    val uiState: StateFlow<ChangePasswordState> = _uiState

    fun changePassword(currentPassword: String, newPassword: String) {
        if (newPassword.length < 6) {
            _uiState.value = _uiState.value.copy(errorMessage = "New password must be at least 6 characters")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val resp = apiClient.get().changePassword(ChangePasswordRequest(currentPassword, newPassword))
                if (resp.isSuccessful) {
                    prefs.passwordMustChange = false
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true, role = prefs.role ?: "employee")
                } else {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Current password is incorrect.")
                }
            } catch (e: Exception) {
                Timber.e(e)
                _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Cannot reach office server.")
            }
        }
    }
}
