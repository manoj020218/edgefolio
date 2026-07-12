package `in`.iotsoft.edgefolio.ui.employee

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.db.daos.AttendanceDao
import `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MyHistoryViewModel @Inject constructor(
    private val prefs: EncryptedPrefs,
    private val attendanceDao: AttendanceDao,
) : ViewModel() {

    private val _records = MutableStateFlow<List<LocalAttendanceRecord>>(emptyList())
    val records: StateFlow<List<LocalAttendanceRecord>> = _records

    init { load() }

    fun load() {
        viewModelScope.launch {
            val empId = prefs.empId ?: return@launch
            _records.value = attendanceDao.getHistory(empId)
        }
    }
}
