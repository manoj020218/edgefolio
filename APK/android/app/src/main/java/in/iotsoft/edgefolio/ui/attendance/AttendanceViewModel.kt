package `in`.iotsoft.edgefolio.ui.attendance

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.RectF
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.*
import com.google.gson.Gson
import com.google.mlkit.vision.face.Face
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import `in`.iotsoft.edgefolio.data.db.daos.AttendanceDao
import `in`.iotsoft.edgefolio.data.db.daos.EmployeeDao
import `in`.iotsoft.edgefolio.data.db.daos.SyncDao
import `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord
import `in`.iotsoft.edgefolio.data.db.entities.PendingSyncRecord
import `in`.iotsoft.edgefolio.data.model.LocationData
import `in`.iotsoft.edgefolio.data.model.MobileAttendanceRequest
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.ml.FaceEmbeddingEngine
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.security.EncryptionManager
import `in`.iotsoft.edgefolio.workers.AttendanceSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import timber.log.Timber
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlin.coroutines.resume

// ── State machine ─────────────────────────────────────────────────────────────

sealed class AttendanceStep {
    object Idle         : AttendanceStep()
    object Liveness     : AttendanceStep()
    object Capturing    : AttendanceStep()
    object Processing   : AttendanceStep()
    object AcquiringGps : AttendanceStep()
    object Submitting   : AttendanceStep()
    data class Done(val checkinTime: String, val workType: String) : AttendanceStep()
    data class Fail(val message: String) : AttendanceStep()
}

data class AttendanceUiState(
    val step: AttendanceStep       = AttendanceStep.Idle,
    val workType: String?          = null,
    val todayRecord: LocalAttendanceRecord? = null,
    val isEdgeOnline: Boolean      = true,
    val livenessHint: String       = "Look at the camera and blink twice",
    val faceBounds: RectF?         = null,
    val captureRequested: Boolean  = false,
)

// ── ViewModel ─────────────────────────────────────────────────────────────────

@HiltViewModel
class AttendanceViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
    private val embeddingEngine: FaceEmbeddingEngine,
    private val employeeDao: EmployeeDao,
    private val attendanceDao: AttendanceDao,
    private val syncDao: SyncDao,
    private val encryptionManager: EncryptionManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AttendanceUiState())
    val uiState: StateFlow<AttendanceUiState> = _uiState

    private val livenessDetector = LivenessDetector()
    private var capturedWorkType: String? = null
    private val gson = Gson()

    init { loadStatus() }

    fun loadStatus() {
        viewModelScope.launch {
            val empId = prefs.empId ?: return@launch
            val today = LocalDate.now().toString()
            val local = attendanceDao.getForDate(empId, today)
            try {
                val resp = apiClient.get().getTodayStatus()
                _uiState.update { it.copy(workType = resp.body()?.data?.workType, todayRecord = local) }
            } catch (e: Exception) {
                _uiState.update { it.copy(workType = "office", todayRecord = local, isEdgeOnline = false) }
            }
        }
    }

    fun startLiveness(workType: String) {
        capturedWorkType = workType
        livenessDetector.reset()
        _uiState.update { it.copy(step = AttendanceStep.Liveness, livenessHint = "Look at the camera and blink twice") }
    }

    fun onFrame(face: Face?, bounds: RectF?, @Suppress("UNUSED_PARAMETER") bitmap: Bitmap) {
        if (_uiState.value.step !is AttendanceStep.Liveness) return
        _uiState.update { it.copy(faceBounds = bounds) }
        if (face == null) {
            _uiState.update { it.copy(livenessHint = "No face detected — look at the camera") }
            return
        }
        when (livenessDetector.process(face)) {
            LivenessState.CHECKING -> _uiState.update { it.copy(livenessHint = "Blink twice (${livenessDetector.blinkCount}/2) or turn your head slightly") }
            LivenessState.PASSED   -> _uiState.update { it.copy(step = AttendanceStep.Capturing, captureRequested = true, livenessHint = "Hold still…") }
            LivenessState.TIMEOUT  -> _uiState.update { it.copy(step = AttendanceStep.Fail("Liveness check timed out. Please try again.")) }
        }
    }

    /** Call from composable after consuming captureRequested=true. */
    fun consumeCapture() { _uiState.update { it.copy(captureRequested = false) } }

    fun onCapturedFrame(faceBitmap: Bitmap) {
        _uiState.update { it.copy(step = AttendanceStep.Processing) }
        viewModelScope.launch(Dispatchers.IO) {
            val empId    = prefs.empId    ?: return@launch
            val workType = capturedWorkType ?: return@launch

            val employee = employeeDao.getById(empId)
            val storedBlob = employee?.embeddingEncrypted
            if (storedBlob == null) {
                _uiState.update { it.copy(step = AttendanceStep.Fail("Face not enrolled. Please contact your HR.")) }
                return@launch
            }

            val reference  = gson.fromJson(encryptionManager.decryptString(storedBlob), FloatArray::class.java)
            val fresh      = embeddingEngine.generate(faceBitmap) ?: run {
                _uiState.update { it.copy(step = AttendanceStep.Fail("Face analysis failed. Please try again.")) }
                return@launch
            }
            val similarity = embeddingEngine.cosine(fresh, reference)
            if (!embeddingEngine.matches(fresh, reference)) {
                _uiState.update { it.copy(step = AttendanceStep.Fail("Face not recognised (${(similarity * 100).toInt()}%). Please try again.")) }
                return@launch
            }

            withContext(Dispatchers.Main) { _uiState.update { it.copy(step = AttendanceStep.AcquiringGps) } }
            val location = getLocation()
            if (location == null) {
                _uiState.update { it.copy(step = AttendanceStep.Fail("GPS unavailable. Enable location and retry.")) }
                return@launch
            }

            withContext(Dispatchers.Main) { _uiState.update { it.copy(step = AttendanceStep.Submitting) } }
            val now      = Instant.now().toString()
            val today    = LocalDate.now().toString()
            val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            val request  = MobileAttendanceRequest(empId, workType, now, similarity, similarity, "PASSED", location, deviceId)

            try {
                val resp = apiClient.get().markAttendance(request)
                val body = resp.body()
                when {
                    resp.isSuccessful && body?.ok == true -> {
                        val checkin = body.data?.checkedInAt?.let { it.substringAfter("T").take(5) }
                            ?: now.substringAfter("T").take(5)
                        saveLocal(empId, today, workType, similarity, checkin)
                        maybeUpdateEma(empId, storedBlob, fresh, today)
                        _uiState.update { it.copy(step = AttendanceStep.Done(checkin, workType)) }
                    }
                    body?.data?.alreadyMarked == true ->
                        _uiState.update { it.copy(step = AttendanceStep.Fail("Attendance already marked for today.")) }
                    else -> {
                        val checkin = now.substringAfter("T").take(5)
                        saveLocal(empId, today, workType, similarity, checkin)
                        saveOffline(empId, today, workType, request)
                        _uiState.update { it.copy(step = AttendanceStep.Done(checkin, workType), isEdgeOnline = false) }
                    }
                }
            } catch (e: Exception) {
                Timber.w(e, "Attendance POST failed — saving offline")
                val checkin = now.substringAfter("T").take(5)
                saveLocal(empId, today, workType, similarity, checkin)
                saveOffline(empId, today, workType, request)
                _uiState.update { it.copy(step = AttendanceStep.Done(checkin, workType), isEdgeOnline = false) }
            }
        }
    }

    fun reset() {
        livenessDetector.reset()
        capturedWorkType = null
        _uiState.update { it.copy(step = AttendanceStep.Idle, faceBounds = null, captureRequested = false, livenessHint = "Look at the camera and blink twice") }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private suspend fun saveLocal(empId: String, date: String, workType: String, similarity: Float, time: String) {
        attendanceDao.insert(LocalAttendanceRecord(empId, date, time, workType, similarity))
    }

    private suspend fun saveOffline(empId: String, date: String, workType: String, request: MobileAttendanceRequest) {
        val encrypted = encryptionManager.encryptString(gson.toJson(request))
        syncDao.insert(PendingSyncRecord("$empId-$date-${System.currentTimeMillis()}", empId, request.timestamp, workType, encrypted))
        WorkManager.getInstance(context).enqueueUniqueWork(
            "attendance_sync", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<AttendanceSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
        )
    }

    private suspend fun maybeUpdateEma(empId: String, storedBlob: ByteArray, fresh: FloatArray, today: String) {
        val existing = employeeDao.getById(empId) ?: return
        if (existing.embeddingUpdatedDate == today) return
        val ref     = gson.fromJson(encryptionManager.decryptString(storedBlob), FloatArray::class.java)
        val updated = embeddingEngine.emaUpdate(ref, fresh)
        employeeDao.updateEmbedding(empId, encryptionManager.encryptString(gson.toJson(updated)), today)
    }

    @SuppressLint("MissingPermission")
    private suspend fun getLocation(): LocationData? = withTimeoutOrNull(15_000L) {
        suspendCancellableCoroutine { cont ->
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val provider = when {
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER)     -> LocationManager.GPS_PROVIDER
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
            if (provider == null) { cont.resume(null); return@suspendCancellableCoroutine }

            val listener = object : LocationListener {
                override fun onLocationChanged(loc: Location) {
                    lm.removeUpdates(this)
                    if (!cont.isCompleted)
                        cont.resume(if (loc.accuracy < 100f) LocationData(loc.latitude, loc.longitude, loc.accuracy) else null)
                }
                @Suppress("DEPRECATION")
                override fun onStatusChanged(p: String?, s: Int, e: Bundle?) = Unit
                override fun onProviderDisabled(p: String) {
                    lm.removeUpdates(this)
                    if (!cont.isCompleted) cont.resume(null)
                }
            }
            @Suppress("DEPRECATION")
            lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
            cont.invokeOnCancellation { lm.removeUpdates(listener) }
        }
    }
}
