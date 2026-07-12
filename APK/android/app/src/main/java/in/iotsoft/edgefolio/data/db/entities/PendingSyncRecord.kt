package `in`.iotsoft.edgefolio.data.db.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_sync_records")
data class PendingSyncRecord(
    @PrimaryKey val id: String,
    val empId: String,
    val timestamp: String,          // ISO-8601
    val workType: String,           // "tour" | "wfh"
    // AES-256-GCM encrypted JSON payload (attendance data + location)
    @ColumnInfo(typeAffinity = ColumnInfo.BLOB)
    val dataEncrypted: ByteArray,
    val retryCount: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val syncedAt: Long? = null,
) {
    override fun equals(other: Any?): Boolean = other is PendingSyncRecord && id == other.id
    override fun hashCode(): Int = id.hashCode()
}
