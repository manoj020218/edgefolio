package `in`.iotsoft.edgefolio.data.db.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_employees")
data class CachedEmployee(
    @PrimaryKey val empId: String,
    val empCode: String,
    val name: String,
    val department: String,
    val designation: String?,
    val appRole: String,
    // AES-256-GCM encrypted 128-float embedding stored as Base64 blob
    @ColumnInfo(typeAffinity = ColumnInfo.BLOB)
    val embeddingEncrypted: ByteArray?,
    val embeddingUpdatedDate: String?,   // YYYY-MM-DD of last EMA update
    val enrollmentStatus: String,        // "pending" | "partial" | "complete"
    val syncedAt: Long = System.currentTimeMillis(),
) {
    override fun equals(other: Any?): Boolean = other is CachedEmployee && empId == other.empId
    override fun hashCode(): Int = empId.hashCode()
}
