package `in`.iotsoft.edgefolio.data.db.daos

import androidx.room.*
import `in`.iotsoft.edgefolio.data.db.entities.AnnouncementCache
import kotlinx.coroutines.flow.Flow

@Dao
interface AnnouncementDao {
    @Upsert
    suspend fun upsertAll(announcements: List<AnnouncementCache>)

    @Query("SELECT * FROM announcement_cache WHERE dismissed = 0 ORDER BY cachedAt DESC")
    fun observeActive(): Flow<List<AnnouncementCache>>

    @Query("UPDATE announcement_cache SET dismissed = 1 WHERE id = :id")
    suspend fun dismiss(id: String)

    @Query("SELECT MAX(createdAt) FROM announcement_cache")
    suspend fun latestCreatedAt(): String?

    @Query("DELETE FROM announcement_cache WHERE cachedAt < :cutoff")
    suspend fun purgeOld(cutoff: Long)
}
