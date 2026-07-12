package `in`.iotsoft.edgefolio.data.db.daos

import androidx.room.*
import `in`.iotsoft.edgefolio.data.db.entities.PendingSyncRecord
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(record: PendingSyncRecord)

    @Query("SELECT * FROM pending_sync_records WHERE syncedAt IS NULL ORDER BY createdAt ASC")
    suspend fun getPending(): List<PendingSyncRecord>

    @Query("SELECT COUNT(*) FROM pending_sync_records WHERE syncedAt IS NULL")
    fun observePendingCount(): Flow<Int>

    @Query("UPDATE pending_sync_records SET syncedAt = :ts WHERE id = :id")
    suspend fun markSynced(id: String, ts: Long = System.currentTimeMillis())

    @Query("UPDATE pending_sync_records SET retryCount = retryCount + 1, lastError = :error WHERE id = :id")
    suspend fun incrementRetry(id: String, error: String?)

    // Purge records synced or older than cutoff to keep DB lean
    @Query("DELETE FROM pending_sync_records WHERE syncedAt IS NOT NULL OR createdAt < :cutoff")
    suspend fun purgeOld(cutoff: Long)

    @Query("SELECT COUNT(*) FROM pending_sync_records WHERE syncedAt IS NULL AND retryCount >= 5")
    suspend fun failedCount(): Int
}
