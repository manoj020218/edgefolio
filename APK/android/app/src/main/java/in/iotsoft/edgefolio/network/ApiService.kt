package `in`.iotsoft.edgefolio.network

import `in`.iotsoft.edgefolio.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ── Config (no auth) ─────────────────────────────────────────────────────
    @GET("apk/config")
    suspend fun getConfig(): Response<ApiResponse<ApkConfig>>

    @GET("apk/login-check")
    suspend fun loginCheck(@Query("empCode") empCode: String): Response<ApiResponse<LoginCheckResponse>>

    @GET("apk/offices")
    suspend fun getOffices(): Response<ApiResponse<List<Office>>>

    // ── Auth ─────────────────────────────────────────────────────────────────
    @POST("apk/auth/login")
    suspend fun login(@Body request: ApkLoginRequest): Response<ApiResponse<ApkLoginResponse>>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequest): Response<ApiResponse<Any>>

    @POST("auth/change-password")
    suspend fun changePassword(@Body request: ChangePasswordRequest): Response<ApiResponse<Any>>

    @PATCH("apk/fcm-token")
    suspend fun registerFcmToken(@Body request: FcmTokenRequest): Response<ApiResponse<Any>>

    // ── Work Status ───────────────────────────────────────────────────────────
    @GET("apk/today-status")
    suspend fun getTodayStatus(): Response<ApiResponse<TodayStatusResponse>>

    @GET("apk/work-assignments")
    suspend fun getWorkAssignments(
        @Query("date") date: String? = null,
        @Query("empId") empId: String? = null,
    ): Response<ApiResponse<List<WorkAssignment>>>

    @POST("apk/work-assignments")
    suspend fun createWorkAssignment(@Body request: CreateWorkAssignmentRequest): Response<ApiResponse<WorkAssignmentInfo>>

    @DELETE("apk/work-assignments/{id}")
    suspend fun deleteWorkAssignment(@Path("id") id: String): Response<ApiResponse<Any>>

    // ── Mobile Attendance ─────────────────────────────────────────────────────
    @POST("apk/attendance")
    suspend fun markAttendance(@Body request: MobileAttendanceRequest): Response<ApiResponse<MobileAttendanceResponse>>

    @POST("apk/attendance/batch-sync")
    suspend fun batchSync(@Body request: BatchSyncRequest): Response<ApiResponse<BatchSyncResponse>>

    // ── Live Feed ─────────────────────────────────────────────────────────────
    @GET("apk/live-feed")
    suspend fun getLiveFeed(): Response<ApiResponse<LiveFeedResponse>>

    // ── Alert Subscriptions ───────────────────────────────────────────────────
    @GET("apk/alert-subscriptions")
    suspend fun getAlertSubscriptions(): Response<ApiResponse<List<AlertSubscription>>>

    @POST("apk/alert-subscriptions")
    suspend fun createAlertSubscription(@Body request: CreateAlertSubscriptionRequest): Response<ApiResponse<AlertSubscription>>

    @DELETE("apk/alert-subscriptions/{id}")
    suspend fun deleteAlertSubscription(@Path("id") id: String): Response<ApiResponse<Any>>

    // ── Face Embeddings ───────────────────────────────────────────────────────
    @GET("apk/faces/{empId}/embedding")
    suspend fun getEmbedding(@Path("empId") empId: String): Response<ApiResponse<EmbeddingResponse>>

    @POST("apk/faces/{empId}/embedding")
    suspend fun saveEmbedding(
        @Path("empId") empId: String,
        @Body request: SaveEmbeddingRequest,
    ): Response<ApiResponse<Any>>

    // ── Announcements ─────────────────────────────────────────────────────────
    @GET("announcements")
    suspend fun getAnnouncements(@Query("since") since: String? = null): Response<ApiResponse<List<Any>>>

    @POST("apk/broadcast")
    suspend fun broadcast(@Body request: AnnouncementRequest): Response<ApiResponse<Any>>

    // ── Employees (admin management) ──────────────────────────────────────────
    @GET("apk/employees")
    suspend fun getEmployees(): Response<ApiResponse<List<EmployeeDetail>>>

    @PATCH("apk/employees/{id}")
    suspend fun patchEmployee(
        @Path("id") id: String,
        @Body body: Map<String, @JvmSuppressWildcards Any>,
    ): Response<ApiResponse<Any>>

    // ── Analytics ─────────────────────────────────────────────────────────────
    @GET("apk/analytics")
    suspend fun getAnalytics(): Response<ApiResponse<AnalyticsResponse>>

    // ── Health ────────────────────────────────────────────────────────────────
    @GET("../health")   // hits /health (root, not /api/v1/health)
    suspend fun health(): Response<Map<String, Any>>
}
