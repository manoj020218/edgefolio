package `in`.iotsoft.edgefolio.ui.employee

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.db.daos.AnnouncementDao
import `in`.iotsoft.edgefolio.data.db.daos.AttendanceDao
import `in`.iotsoft.edgefolio.data.db.daos.SyncDao
import `in`.iotsoft.edgefolio.data.db.entities.AnnouncementCache
import `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDate
import javax.inject.Inject

data class EmployeeHomeState(
    val isLoading: Boolean = true,
    val empName: String = "",
    val workType: String = "office",
    val todayRecord: LocalAttendanceRecord? = null,
    val pendingSync: Int = 0,
    val isEdgeOnline: Boolean = true,
    val announcements: List<AnnouncementCache> = emptyList(),
)

@HiltViewModel
class EmployeeHomeViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
    private val attendanceDao: AttendanceDao,
    private val announcementDao: AnnouncementDao,
    private val syncDao: SyncDao,
) : ViewModel() {

    private val _state = MutableStateFlow(EmployeeHomeState(empName = ""))
    val state: StateFlow<EmployeeHomeState> = _state

    init {
        _state.update { it.copy(empName = prefs.empName ?: "") }
        load()
        observeAnnouncements()
        observePendingSync()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val empId = prefs.empId ?: run {
                _state.update { it.copy(isLoading = false) }
                return@launch
            }
            val today = LocalDate.now().toString()
            val local = attendanceDao.getForDate(empId, today)

            val edgeOnline = try { apiClient.get().health().isSuccessful } catch (_: Exception) { false }

            if (!edgeOnline) {
                _state.update { it.copy(isLoading = false, workType = "office", todayRecord = local, isEdgeOnline = false) }
                return@launch
            }

            try {
                val resp     = apiClient.get().getTodayStatus()
                val workType = resp.body()?.data?.workType ?: "office"
                _state.update { it.copy(isLoading = false, workType = workType, todayRecord = local, isEdgeOnline = true) }
            } catch (e: Exception) {
                Timber.w(e, "EmployeeHome getTodayStatus failed")
                _state.update { it.copy(isLoading = false, workType = "office", todayRecord = local, isEdgeOnline = false) }
            }
        }
    }

    fun dismissAnnouncement(id: String) {
        viewModelScope.launch { announcementDao.dismiss(id) }
    }

    fun logout() { prefs.clearAuth() }

    private fun observeAnnouncements() {
        viewModelScope.launch {
            announcementDao.observeActive().collect { list ->
                _state.update { it.copy(announcements = list) }
            }
        }
    }

    private fun observePendingSync() {
        viewModelScope.launch {
            syncDao.observePendingCount().collect { count ->
                _state.update { it.copy(pendingSync = count) }
            }
        }
    }
}
