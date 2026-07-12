package `in`.iotsoft.edgefolio.data.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "announcement_cache")
data class AnnouncementCache(
    @PrimaryKey val id: String,
    val type: String,               // "sos" | "holiday" | "event" | "general"
    val message: String,
    val announcedByName: String,
    val announcedByDesignation: String?,
    val target: String,             // "all" | "admin" | "staff"
    val createdAt: String,          // ISO-8601 from server
    val dismissed: Boolean = false,
    val cachedAt: Long = System.currentTimeMillis(),
)
