package `in`.iotsoft.edgefolio.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import `in`.iotsoft.edgefolio.data.db.daos.AttendanceDao
import `in`.iotsoft.edgefolio.data.db.daos.SyncDao
import `in`.iotsoft.edgefolio.data.model.BatchSyncRequest
import `in`.iotsoft.edgefolio.data.model.MobileAttendanceRequest
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.security.EncryptionManager
import timber.log.Timber
import java.time.LocalDate

/**
 * Syncs pending offline attendance records to EDGE when a network connection is available.
 * Enqueued by [AttendanceViewModel] immediately after saving an offline record.
 * Uses exponential backoff (30 s base); gives up after 5 attempts.
 */
@HiltWorker
class AttendanceSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
    private val syncDao: SyncDao,
    private val attendanceDao: AttendanceDao,
    private val encryptionManager: EncryptionManager,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val baseUrl = prefs.resolvedBaseUrl ?: return Result.failure()
        val pending = syncDao.getPending()
        if (pending.isEmpty()) return Result.success()

        Timber.d("AttendanceSyncWorker: syncing ${pending.size} pending records")
        val gson    = Gson()
        val records = mutableListOf<MobileAttendanceRequest>()
        val ids     = mutableListOf<String>()

        for (rec in pending) {
            try {
                val json    = encryptionManager.decryptString(rec.dataEncrypted)
                val request = gson.fromJson(json, MobileAttendanceRequest::class.java)
                records.add(request)
                ids.add(rec.id)
            } catch (e: Exception) {
                Timber.e(e, "Failed to decrypt sync record ${rec.id}")
                syncDao.incrementRetry(rec.id, e.message)
            }
        }

        if (records.isEmpty()) return Result.success()

        return try {
            val resp = apiClient.get(baseUrl).batchSync(BatchSyncRequest(records))
            if (resp.isSuccessful && resp.body()?.ok == true) {
                val now = System.currentTimeMillis()
                ids.forEachIndexed { i, id ->
                    syncDao.markSynced(id, now)
                    val date = records[i].timestamp.take(10)   // "YYYY-MM-DD"
                    attendanceDao.markSynced(records[i].empId, date)
                }
                Timber.d("AttendanceSyncWorker: synced ${records.size} records")
                // Purge fully-synced records older than 30 days
                syncDao.purgeOld(System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000)
                Result.success()
            } else {
                Timber.w("AttendanceSyncWorker batchSync returned ${resp.code()}")
                if (runAttemptCount < 5) Result.retry() else Result.failure()
            }
        } catch (e: Exception) {
            Timber.e(e, "AttendanceSyncWorker exception")
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
