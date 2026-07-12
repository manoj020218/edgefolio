package `in`.iotsoft.edgefolio.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import `in`.iotsoft.edgefolio.data.db.AppDatabase
import `in`.iotsoft.edgefolio.data.db.daos.*
import `in`.iotsoft.edgefolio.security.EncryptionManager
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context,
        encryptionManager: EncryptionManager,
    ): AppDatabase = AppDatabase.create(context, encryptionManager.deriveDatabaseKey())

    @Provides fun provideEmployeeDao(db: AppDatabase): EmployeeDao         = db.employeeDao()
    @Provides fun provideSyncDao(db: AppDatabase): SyncDao                 = db.syncDao()
    @Provides fun provideAttendanceDao(db: AppDatabase): AttendanceDao     = db.attendanceDao()
    @Provides fun provideAnnouncementDao(db: AppDatabase): AnnouncementDao = db.announcementDao()
}
