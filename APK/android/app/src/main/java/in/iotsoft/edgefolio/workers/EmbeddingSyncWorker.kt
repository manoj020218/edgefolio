package `in`.iotsoft.edgefolio.workers

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import `in`.iotsoft.edgefolio.data.db.daos.EmployeeDao
import `in`.iotsoft.edgefolio.data.db.entities.CachedEmployee
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import `in`.iotsoft.edgefolio.network.ApiClient
import `in`.iotsoft.edgefolio.security.EncryptionManager
import timber.log.Timber
import java.time.LocalDate

/**
 * Syncs the logged-in employee's reference face embedding from EDGE.
 * Scheduled once after login and then daily via WorkManager periodic work.
 * Stores the encrypted FloatArray JSON blob in [CachedEmployee.embeddingEncrypted].
 */
@HiltWorker
class EmbeddingSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val prefs: EncryptedPrefs,
    private val apiClient: ApiClient,
    private val employeeDao: EmployeeDao,
    private val encryptionManager: EncryptionManager,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val empId   = prefs.empId           ?: return Result.failure()
        val baseUrl = prefs.resolvedBaseUrl  ?: return Result.failure()
        val today   = LocalDate.now().toString()

        return try {
            val resp = apiClient.get(baseUrl).getEmbedding(empId)
            if (!resp.isSuccessful || resp.body()?.ok != true) {
                Timber.w("EmbeddingSync: no embedding returned for empId=$empId")
                return Result.success()
            }
            val data = resp.body()!!.data ?: return Result.success()
            if (data.status != "enrolled") {
                Timber.d("EmbeddingSync: employee not enrolled (status=${data.status})")
                return Result.success()
            }

            val json      = Gson().toJson(data.embedding.toFloatArray())
            val encrypted = encryptionManager.encryptString(json)

            val existing = employeeDao.getById(empId)
            if (existing != null) {
                employeeDao.updateEmbedding(empId, encrypted, today)
            } else {
                employeeDao.upsert(CachedEmployee(
                    empId                = empId,
                    empCode              = prefs.empCode ?: empId,
                    name                 = prefs.empName ?: "",
                    department           = "",
                    designation          = null,
                    appRole              = prefs.role ?: "employee",
                    embeddingEncrypted   = encrypted,
                    embeddingUpdatedDate = today,
                    enrollmentStatus     = "complete",
                ))
            }
            Timber.d("EmbeddingSync: stored embedding for empId=$empId")
            Result.success()
        } catch (e: Exception) {
            Timber.e(e, "EmbeddingSync failed")
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
}
