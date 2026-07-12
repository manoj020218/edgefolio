package `in`.iotsoft.edgefolio.data.db.daos

import androidx.room.*
import `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord
import kotlinx.coroutines.flow.Flow

@Dao
interface AttendanceDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(record: LocalAttendanceRecord)

    @Query("SELECT * FROM local_attendance WHERE empId = :empId AND date = :date LIMIT 1")
    suspend fun getForDate(empId: String, date: String): LocalAttendanceRecord?

    @Query("SELECT * FROM local_attendance WHERE empId = :empId AND date = :date LIMIT 1")
    fun observeForDate(empId: String, date: String): Flow<LocalAttendanceRecord?>

    @Query("SELECT * FROM local_attendance WHERE empId = :empId ORDER BY date DESC LIMIT 60")
    suspend fun getHistory(empId: String): List<LocalAttendanceRecord>

    @Query("UPDATE local_attendance SET synced = 1 WHERE empId = :empId AND date = :date")
    suspend fun markSynced(empId: String, date: String)

    @Query("DELETE FROM local_attendance WHERE date < :cutoffDate")
    suspend fun purgeOld(cutoffDate: String)
}
