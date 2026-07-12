package `in`.iotsoft.edgefolio.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import `in`.iotsoft.edgefolio.ui.admin.AdminHomeScreen
import `in`.iotsoft.edgefolio.ui.owner.OwnerHomeScreen
import `in`.iotsoft.edgefolio.ui.admin.alerts.AlertSettingsScreen
import `in`.iotsoft.edgefolio.ui.admin.broadcast.BroadcastScreen
import `in`.iotsoft.edgefolio.ui.admin.employees.EmployeeListScreen
import `in`.iotsoft.edgefolio.ui.admin.enrollment.FaceEnrollmentScreen
import `in`.iotsoft.edgefolio.ui.admin.tour.TourWfhScreen
import `in`.iotsoft.edgefolio.ui.attendance.AttendanceCameraScreen
import `in`.iotsoft.edgefolio.ui.employee.EmployeeHomeScreen
import `in`.iotsoft.edgefolio.ui.employee.MyHistoryScreen
import `in`.iotsoft.edgefolio.ui.login.*
import `in`.iotsoft.edgefolio.ui.splash.SplashScreen

@Composable
fun AppNavigation() {
    val nav = rememberNavController()

    NavHost(navController = nav, startDestination = Screen.Splash.route) {

        composable(Screen.Splash.route) {
            SplashScreen(
                onNavigateToLogin        = { nav.navigate(Screen.Login.route) { popUpTo(Screen.Splash.route) { inclusive = true } } },
                onNavigateToEmployeeHome = { nav.navigate(Screen.EmployeeHome.route) { popUpTo(0) } },
                onNavigateToAdminHome    = { nav.navigate(Screen.AdminHome.route)    { popUpTo(0) } },
                onNavigateToOwnerHome    = { nav.navigate(Screen.OwnerHome.route)    { popUpTo(0) } },
            )
        }

        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = { role ->
                    val dest = when (role) {
                        "owner"    -> Screen.OwnerHome.route
                        "hr-admin" -> Screen.AdminHome.route
                        else       -> Screen.EmployeeHome.route
                    }
                    nav.navigate(dest) { popUpTo(Screen.Login.route) { inclusive = true } }
                },
                onNeedOfficePicker   = { nav.navigate(Screen.OfficePicker.route) },
                onForgotPassword     = { nav.navigate(Screen.ForgotPassword.route) },
                onPasswordMustChange = { nav.navigate(Screen.ChangePassword.route) { popUpTo(Screen.Login.route) { inclusive = true } } },
            )
        }

        composable(Screen.OfficePicker.route) {
            OfficePickerScreen(
                onOfficeSelected = { nav.popBackStack() },
                onBack           = { nav.popBackStack() },
            )
        }

        composable(Screen.ForgotPassword.route) {
            ForgotPasswordScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.ChangePassword.route) {
            ChangePasswordScreen(
                onPasswordChanged = { role ->
                    val dest = when (role) {
                        "owner"    -> Screen.OwnerHome.route
                        "hr-admin" -> Screen.AdminHome.route
                        else       -> Screen.EmployeeHome.route
                    }
                    nav.navigate(dest) { popUpTo(0) }
                }
            )
        }

        // ── Employee ──────────────────────────────────────────────────────────

        composable(Screen.EmployeeHome.route) {
            EmployeeHomeScreen(
                onMarkAttendance = { workType -> nav.navigate(Screen.AttendanceCamera.build(workType)) },
                onHistory        = { nav.navigate(Screen.MyHistory.route) },
                onLogout         = { nav.navigate(Screen.Login.route) { popUpTo(0) } },
            )
        }

        composable(
            route = Screen.AttendanceCamera.route,
            arguments = listOf(navArgument("workType") { type = NavType.StringType }),
        ) { backStack ->
            val workType = backStack.arguments?.getString("workType") ?: "office"
            AttendanceCameraScreen(
                workType = workType,
                onDone   = { nav.popBackStack() },
                onBack   = { nav.popBackStack() },
            )
        }

        composable(Screen.MyHistory.route) {
            MyHistoryScreen(onBack = { nav.popBackStack() })
        }

        // ── Admin ─────────────────────────────────────────────────────────────

        composable(Screen.AdminHome.route) {
            AdminHomeScreen(
                onLogout              = { nav.navigate(Screen.Login.route) { popUpTo(0) } },
                onNavigateToTourWfh   = { nav.navigate(Screen.TourWfhManager.route) },
                onNavigateToEmployees = { nav.navigate(Screen.EmployeeList.route) },
                onNavigateToBroadcast = { nav.navigate(Screen.Broadcast.route) },
                onNavigateToAlerts    = { nav.navigate(Screen.AlertSettings.route) },
            )
        }

        composable(Screen.TourWfhManager.route) {
            TourWfhScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.AlertSettings.route) {
            AlertSettingsScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.Broadcast.route) {
            BroadcastScreen(onBack = { nav.popBackStack() })
        }

        composable(Screen.EmployeeList.route) {
            EmployeeListScreen(
                onBack        = { nav.popBackStack() },
                onEnrollFace  = { empId, empName ->
                    nav.navigate(Screen.FaceEnrollment.build(empId, empName))
                },
            )
        }

        composable(
            route = Screen.FaceEnrollment.route,
            arguments = listOf(
                navArgument("empId")   { type = NavType.StringType },
                navArgument("empName") { type = NavType.StringType; defaultValue = "" },
            ),
        ) {
            FaceEnrollmentScreen(onBack = { nav.popBackStack() })
        }

        // ── Owner ─────────────────────────────────────────────────────────────

        composable(Screen.OwnerHome.route) {
            OwnerHomeScreen(
                onLogout    = { nav.navigate(Screen.Login.route) { popUpTo(0) } },
                onBroadcast = { nav.navigate(Screen.Broadcast.route) },
            )
        }
    }
}

@Composable
private fun PlaceholderScreen(title: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = title, style = MaterialTheme.typography.headlineMedium)
    }
}
