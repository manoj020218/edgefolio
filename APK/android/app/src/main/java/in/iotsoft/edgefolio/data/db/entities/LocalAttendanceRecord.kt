package `in`.iotsoft.edgefolio.data.db.entities

import androidx.room.Entity

// Composite PK: one record per (empId, date)
@Entity(tableName = "local_attendance", primaryKeys = ["empId", "date"])
data class LocalAttendanceRecord(
    val empId: String,
    val date: String,               // YYYY-MM-DD
    val checkinTime: String?,       // HH:mm
    val workType: String,           // "tour" | "wfh"
    val similarity: Float,
    val status: String = "present",
    val synced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
)
