package `in`.iotsoft.edgefolio.ui.navigation

sealed class Screen(val route: String) {
    data object Splash           : Screen("splash")
    data object Login            : Screen("login")
    data object OfficePicker     : Screen("office_picker")
    data object ForgotPassword   : Screen("forgot_password")
    data object ChangePassword   : Screen("change_password")

    // Role-specific home screens
    data object EmployeeHome     : Screen("employee_home")
    data object AdminHome        : Screen("admin_home")
    data object OwnerHome        : Screen("owner_home")

    // Employee sub-screens
    data object AttendanceCamera : Screen("attendance_camera/{workType}") {
        fun build(workType: String) = "attendance_camera/$workType"
    }
    data object MyHistory        : Screen("my_history")
    data object Announcements    : Screen("announcements")

    // Admin sub-screens
    data object TourWfhManager   : Screen("tour_wfh_manager")
    data object LiveFeed         : Screen("live_feed")
    data object AlertSettings    : Screen("alert_settings")
    data object Broadcast        : Screen("broadcast")
    data object EmployeeList     : Screen("employee_list")
    data object FaceEnrollment   : Screen("face_enrollment/{empId}?empName={empName}") {
        fun build(empId: String, empName: String) =
            "face_enrollment/$empId?empName=${android.net.Uri.encode(empName)}"
    }
}
