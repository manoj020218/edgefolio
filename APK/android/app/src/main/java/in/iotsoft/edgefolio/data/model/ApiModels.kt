package `in`.iotsoft.edgefolio.data.model

import com.google.gson.annotations.SerializedName

// ── Auth ──────────────────────────────────────────────────────────────────────

data class ApkLoginRequest(val empCode: String, val password: String)

data class ApkLoginResponse(
    val token: String,
    val user: ApkUser,
)

data class ApkUser(
    val empId: String,
    val empCode: String,
    val name: String,
    val department: String?,
    val designation: String?,
    val role: String,                     // "owner" | "hr-admin" | "employee"
    val passwordMustChange: Boolean,
)

data class LoginCheckResponse(
    val allowed: Boolean,
    val reason: String?,                  // "LOGIN_BLOCKED" | "EMPLOYEE_NOT_FOUND"
    val role: String?,
)

data class FcmTokenRequest(@SerializedName("fcmToken") val fcmToken: String)

data class ForgotPasswordRequest(val empId: String, val companyId: String?)
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)

// ── Config ────────────────────────────────────────────────────────────────────

data class ApkConfig(
    @SerializedName("min_apk_version") val minApkVersion: String,
    @SerializedName("geofence_radius_m") val geofenceRadiusM: Int,
    @SerializedName("offline_buffer_days") val offlineBufferDays: Int,
)

// ── Offices ───────────────────────────────────────────────────────────────────

data class Office(val id: String, val label: String)

// ── Work assignments ──────────────────────────────────────────────────────────

data class TodayStatusResponse(
    val workType: String,                 // "office" | "tour" | "wfh"
    val assignment: WorkAssignmentInfo?,
)

data class WorkAssignmentInfo(
    val id: String,
    val fromDate: String,
    val toDate: String,
    val notes: String?,
)

data class WorkAssignment(
    val id: String,
    val employee: EmployeeSummary,
    val workType: String,
    val fromDate: String,
    val toDate: String,
    val notes: String?,
    val createdBy: String?,
)

data class CreateWorkAssignmentRequest(
    val employeeId: String,
    val workType: String,
    val fromDate: String,
    val toDate: String,
    val notes: String?,
)

// ── Attendance ────────────────────────────────────────────────────────────────

data class MobileAttendanceRequest(
    val empId: String,
    val workType: String,
    val timestamp: String,
    val similarity: Float,
    val confidence: Float,
    val liveness: String,
    val location: LocationData,
    val deviceId: String?,
)

data class LocationData(val lat: Double, val lon: Double, val accuracy: Float)

data class MobileAttendanceResponse(
    val eventId: String?,
    val alreadyMarked: Boolean,
    val checkedInAt: String?,
)

data class BatchSyncRequest(val records: List<MobileAttendanceRequest>)
data class BatchSyncResponse(val synced: Int, val skipped: Int, val failed: Int)

// ── Live feed ─────────────────────────────────────────────────────────────────

data class LiveFeedResponse(
    val summary: LiveSummary,
    val feed: List<LiveFeedEntry>,
)

data class LiveSummary(
    val totalEmployees: Int,
    val present: Int,
    val onTour: Int,
    val wfh: Int,
    val absent: Int,
)

data class LiveFeedEntry(
    val empId: String,
    val empCode: String,
    val name: String,
    val dept: String,
    val designation: String?,
    val workType: String,
    val checkinTime: String?,
    val checkoutTime: String?,
    val hoursWorked: Float,
    val status: String,
)

// ── Alert subscriptions ───────────────────────────────────────────────────────

data class AlertSubscription(
    val id: String,
    val watched: EmployeeSummary,
    val alertCheckin: Boolean,
    val alertCheckout: Boolean,
)

data class CreateAlertSubscriptionRequest(
    val watchedEmpId: String,
    val alertCheckin: Boolean = true,
    val alertCheckout: Boolean = true,
)

// ── Face embedding ────────────────────────────────────────────────────────────

data class EmbeddingResponse(
    val empId: String,
    val embedding: List<Float>,
    val updatedAt: String?,
    val status: String,
)

data class SaveEmbeddingRequest(val embedding: List<Float>)

// ── Employee (admin management) ───────────────────────────────────────────────

data class EmployeeDetail(
    val id: String,
    val empCode: String,
    val name: String,
    val department: String?,
    val designation: String?,
    val appRole: String,
    val mobileLoginEnabled: Int,    // 1 = enabled, 0 = disabled
    val enrollmentStatus: String,   // "pending" | "partial" | "complete"
)

// ── Announcements ─────────────────────────────────────────────────────────────

data class AnnouncementRequest(
    val type: String,    // "sos" | "holiday" | "event" | "general"
    val message: String,
    val target: String = "all",
)

// ── Analytics ─────────────────────────────────────────────────────────────────

data class AnalyticsResponse(
    val sevenDayTrend: List<DayCount>,
    val departmentBreakdown: List<DeptStat>,
)

data class DayCount(val date: String, val present: Int, val total: Int)

data class DeptStat(val dept: String, val present: Int, val total: Int)

// ── Shared ────────────────────────────────────────────────────────────────────

data class EmployeeSummary(val id: String, val name: String, val empCode: String, val dept: String?)

// Generic wrapper that EDGE backend returns for all responses
data class ApiResponse<T>(val ok: Boolean, val data: T?, val meta: Map<String, Any>?)

data class ErrorResponse(val ok: Boolean, val error: String?, val message: String?)
