package `in`.iotsoft.edgefolio.ui.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SplashScreen(
    viewModel: SplashViewModel = hiltViewModel(),
    onNavigateToLogin: () -> Unit,
    onNavigateToEmployeeHome: () -> Unit,
    onNavigateToAdminHome: () -> Unit,
    onNavigateToOwnerHome: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state) {
        when (state) {
            SplashState.GoToLogin    -> onNavigateToLogin()
            SplashState.GoToEmployee -> onNavigateToEmployeeHome()
            SplashState.GoToAdmin    -> onNavigateToAdminHome()
            SplashState.GoToOwner    -> onNavigateToOwnerHome()
            SplashState.Loading      -> Unit
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "EdgeFolio",
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Attendance & Payroll",
                fontSize = 14.sp,
                color = Color.White.copy(alpha = 0.8f),
            )
            Spacer(Modifier.height(32.dp))
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
        }
    }
}
