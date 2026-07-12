package `in`.iotsoft.edgefolio.ui.admin.employees

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import `in`.iotsoft.edgefolio.data.model.EmployeeDetail

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmployeeListScreen(
    viewModel: EmployeeListViewModel = hiltViewModel(),
    onBack: () -> Unit,
    onEnrollFace: (empId: String, empName: String) -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbarHost.showSnackbar(it); viewModel.clearError() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Employees") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = { IconButton(onClick = { viewModel.load() }) { Icon(Icons.Default.Refresh, null) } },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Text(
                "Toggle mobile access and manage face enrollment",
                style    = MaterialTheme.typography.bodySmall,
                color    = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            LazyColumn(
                contentPadding     = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.employees, key = { it.id }) { emp ->
                    EmployeeCard(
                        emp         = emp,
                        isToggling  = state.togglingId == emp.id,
                        onToggle    = { viewModel.toggleMobileLogin(emp) },
                        onEnroll    = { onEnrollFace(emp.id, emp.name) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EmployeeCard(
    emp: EmployeeDetail,
    isToggling: Boolean,
    onToggle: () -> Unit,
    onEnroll: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(emp.name, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${emp.department ?: "—"} · ${emp.empCode}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                EnrollmentBadge(emp.enrollmentStatus)
            }

            Spacer(Modifier.height(8.dp))
            HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(8.dp))

            Row(
                modifier            = Modifier.fillMaxWidth(),
                verticalAlignment   = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isToggling) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Switch(
                            checked         = emp.mobileLoginEnabled == 1,
                            onCheckedChange = { onToggle() },
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text("Mobile Login", style = MaterialTheme.typography.bodySmall)
                }

                OutlinedButton(
                    onClick      = onEnroll,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    Icon(Icons.Default.Face, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Enroll Face", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun EnrollmentBadge(status: String) {
    val (label, containerColor, contentColor) = when (status) {
        "enrolled"  -> Triple("Enrolled",  MaterialTheme.colorScheme.primaryContainer,  MaterialTheme.colorScheme.onPrimaryContainer)
        "pending"   -> Triple("Pending",   MaterialTheme.colorScheme.tertiaryContainer, MaterialTheme.colorScheme.onTertiaryContainer)
        else        -> Triple("None",      MaterialTheme.colorScheme.errorContainer,     MaterialTheme.colorScheme.onErrorContainer)
    }
    Surface(color = containerColor, shape = MaterialTheme.shapes.small) {
        Text(
            label,
            modifier  = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style     = MaterialTheme.typography.labelSmall,
            color     = contentColor,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
