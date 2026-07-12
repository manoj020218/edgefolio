package `in`.iotsoft.edgefolio.ui.login

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.*
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import `in`.iotsoft.edgefolio.data.model.ApkLoginRequest
import `in`.iotsoft.edgefolio.data.model.FcmTokenRequest
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.network.CompanyIdResolver
import `in`.iotsoft.edgefolio.workers.EmbeddingSyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject

data class LoginUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val offices: List<Pair<String, String>> = emptyList(), // id to label
    val needOfficePicker: Boolean = false,
    val loginSuccess: Boolean = false,
    val successRole: String = "",
    val passwordMustChange: Boolean = false,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
    private val companyIdResolver: CompanyIdResolver,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    fun login(companyId: String, empCode: String, password: String, rememberMe: Boolean) {
        if (companyId.isBlank() || empCode.isBlank() || password.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "All fields are required")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                // 1. Resolve Company ID to base URL
                val baseUrl = companyIdResolver.resolve(companyId.trim())
                prefs.resolvedBaseUrl = baseUrl
                prefs.companyId = companyId.trim()
                val api = apiClient.get(baseUrl)

                // 2. Pre-check if mobile login is allowed
                val checkResp = api.loginCheck(empCode.trim())
                if (checkResp.isSuccessful) {
                    val check = checkResp.body()?.data
                    if (check?.allowed == false) {
                        val msg = when (check.reason) {
                            "LOGIN_BLOCKED"      -> "Mobile access is disabled. Contact your HR."
                            "EMPLOYEE_NOT_FOUND" -> "Employee ID not found."
                            else                 -> "Login not allowed."
                        }
                        _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
                        return@launch
                    }
                }

                // 3. Check for multiple offices
                val officesResp = api.getOffices()
                if (officesResp.isSuccessful) {
                    val officeList = officesResp.body()?.data ?: emptyList()
                    if (officeList.size > 1 && prefs.selectedOfficeId == null) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            offices = officeList.map { it.id to it.label },
                            needOfficePicker = true,
                        )
                        return@launch
                    }
                }

                // 4. Authenticate
                val loginResp = api.login(ApkLoginRequest(empCode.trim(), password))
                if (!loginResp.isSuccessful) {
                    val code = loginResp.code()
                    val msg = when (code) {
                        401  -> "Invalid Employee ID or password."
                        403  -> "Mobile access is disabled. Contact your HR."
                        else -> "Login failed. Check your network."
                    }
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
                    return@launch
                }

                val body = loginResp.body()?.data ?: run {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = "Unexpected server response.")
                    return@launch
                }

                // 5. Store session
                prefs.authToken         = body.token
                prefs.empId             = body.user.empId
                prefs.empCode           = body.user.empCode
                prefs.empName           = body.user.name
                prefs.role              = body.user.role
                prefs.passwordMustChange = body.user.passwordMustChange
                if (rememberMe) {
                    prefs.rememberedEmpCode   = empCode.trim()
                    prefs.rememberedCompanyId = companyId.trim()
                }

                // 6. Register FCM token (fire-and-forget)
                registerFcmToken(api)

                // 7. Enqueue embedding sync for employee role
                if (body.user.role == "employee") {
                    WorkManager.getInstance(context).enqueueUniqueWork(
                        "embedding_sync", ExistingWorkPolicy.REPLACE,
                        OneTimeWorkRequestBuilder<EmbeddingSyncWorker>()
                            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                            .build()
                    )
                }

                if (body.user.passwordMustChange) {
                    _uiState.value = _uiState.value.copy(isLoading = false, passwordMustChange = true)
                } else {
                    _uiState.value = _uiState.value.copy(isLoading = false, loginSuccess = true, successRole = body.user.role)
                }

            } catch (e: Exception) {
                Timber.e(e, "Login failed")
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "Cannot reach office server. Check your Company ID or network.",
                )
            }
        }
    }

    private suspend fun registerFcmToken(api: `in`.iotsoft.edgefolio.network.ApiService) {
        try {
            val token = FirebaseMessaging.getInstance().token.await()
            api.registerFcmToken(FcmTokenRequest(token))
            Timber.d("FCM token registered")
        } catch (e: Exception) {
            Timber.w("FCM token registration failed (non-fatal): ${e.message}")
        }
    }

    fun officePicked(officeId: String) {
        prefs.selectedOfficeId = officeId
        // Re-resolve with the specific office subdomain
        val resolvedUrl = "https://$officeId${`in`.iotsoft.edgefolio.BuildConfig.FRP_DOMAIN_SUFFIX}"
        prefs.resolvedBaseUrl = resolvedUrl
        _uiState.value = _uiState.value.copy(needOfficePicker = false)
    }

    fun clearError() { _uiState.value = _uiState.value.copy(errorMessage = null) }

    val rememberedEmpCode    get() = prefs.rememberedEmpCode
    val rememberedCompanyId  get() = prefs.rememberedCompanyId
}
