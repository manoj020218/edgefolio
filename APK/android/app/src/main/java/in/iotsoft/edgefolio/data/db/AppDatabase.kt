package `in`.iotsoft.edgefolio.data.db

import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import android.content.Context
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import `in`.iotsoft.edgefolio.data.db.daos.*
import `in`.iotsoft.edgefolio.data.db.entities.*

@Database(
    entities = [
        CachedEmployee::class,
        PendingSyncRecord::class,
        LocalAttendanceRecord::class,
        AnnouncementCache::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun employeeDao(): EmployeeDao
    abstract fun syncDao(): SyncDao
    abstract fun attendanceDao(): AttendanceDao
    abstract fun announcementDao(): AnnouncementDao

    companion object {
        fun create(context: Context, passphrase: ByteArray): AppDatabase {
            val factory = SupportFactory(SQLiteDatabase.getBytes(
                passphrase.map { it.toChar() }.toCharArray()
            ))
            return Room.databaseBuilder(context, AppDatabase::class.java, "edgefolio.db")
                .openHelperFactory(factory)
                .fallbackToDestructiveMigration()   // dev only; add migrations before v2
                .build()
        }
    }
}
