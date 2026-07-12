package `in`.iotsoft.edgefolio.data.db.daos

import androidx.room.*
import `in`.iotsoft.edgefolio.data.db.entities.CachedEmployee
import kotlinx.coroutines.flow.Flow

@Dao
interface EmployeeDao {
    @Upsert
    suspend fun upsert(employee: CachedEmployee)

    @Upsert
    suspend fun upsertAll(employees: List<CachedEmployee>)

    @Query("SELECT * FROM cached_employees WHERE empId = :empId")
    suspend fun getById(empId: String): CachedEmployee?

    @Query("SELECT * FROM cached_employees ORDER BY name ASC")
    fun observeAll(): Flow<List<CachedEmployee>>

    @Query("SELECT * FROM cached_employees ORDER BY name ASC")
    suspend fun getAll(): List<CachedEmployee>

    @Query("UPDATE cached_employees SET embeddingEncrypted = :blob, embeddingUpdatedDate = :date WHERE empId = :empId")
    suspend fun updateEmbedding(empId: String, blob: ByteArray, date: String)

    @Query("DELETE FROM cached_employees")
    suspend fun clearAll()
}
