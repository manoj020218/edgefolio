package `in`.iotsoft.edgefolio.ui.employee

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import `in`.iotsoft.edgefolio.data.db.entities.AnnouncementCache

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmployeeHomeScreen(
    viewModel: EmployeeHomeViewModel = hiltViewModel(),
    onMarkAttendance: (workType: String) -> Unit,
    onHistory: () -> Unit,
    onLogout: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Hi, ${state.empName}") },
                actions = {
                    IconButton(onClick = { viewModel.load() }) { Icon(Icons.Default.Refresh, "Refresh") }
                    IconButton(onClick = { viewModel.logout(); onLogout() }) { Icon(Icons.Default.ExitToApp, "Logout") }
                },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {

            if (!state.isEdgeOnline) {
                OfflineBanner()
            }

            if (state.pendingSync > 0) {
                PendingSyncBanner(state.pendingSync)
            }

            TodayCard(
                workType   = state.workType,
                record     = state.todayRecord,
                isLoading  = state.isLoading,
                onMarkAttendance = onMarkAttendance,
            )

            OutlinedButton(onClick = onHistory, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.History, null)
                Spacer(Modifier.width(8.dp))
                Text("My Attendance History")
            }

            if (state.announcements.isNotEmpty()) {
                Text("Announcements", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                state.announcements.forEach { ann ->
                    AnnouncementCard(ann) { viewModel.dismissAnnouncement(ann.id) }
                }
            }
        }
    }
}

@Composable
private fun OfflineBanner() {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.WifiOff, null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(8.dp))
            Text("Office system is offline. Attendance will sync when reconnected.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun PendingSyncBanner(count: Int) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Sync, null)
            Spacer(Modifier.width(8.dp))
            Text("$count attendance record(s) pending sync to office server.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun TodayCard(
    workType: String,
    record: `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord?,
    isLoading: Boolean,
    onMarkAttendance: (workType: String) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Today", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                WorkTypeBadge(workType)
            }
            Spacer(Modifier.height(12.dp))

            when {
                isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))

                workType == "office" -> {
                    Icon(Icons.Default.Business, null, tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.align(Alignment.CenterHorizontally).size(40.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "You are scheduled in-office today.\nPlease use the office attendance machine.",
                        style     = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        modifier  = Modifier.fillMaxWidth(),
                    )
                }

                record != null -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text("Attendance Marked", fontWeight = FontWeight.SemiBold)
                            Text("Check-in: ${record.checkinTime ?: "—"}", style = MaterialTheme.typography.bodySmall)
                            if (!record.synced)
                                Text("Syncing…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                        }
                    }
                }

                else -> {
                    Button(
                        onClick  = { onMarkAttendance(workType) },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Icon(Icons.Default.CameraAlt, null)
                        Spacer(Modifier.width(8.dp))
                        Text("MARK ATTENDANCE", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkTypeBadge(workType: String) {
    val (label, color) = when (workType) {
        "tour" -> "TOUR"   to MaterialTheme.colorScheme.tertiary
        "wfh"  -> "WFH"    to MaterialTheme.colorScheme.secondary
        else   -> "OFFICE" to MaterialTheme.colorScheme.primary
    }
    Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style    = MaterialTheme.typography.labelSmall,
            color    = color,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun AnnouncementCard(ann: AnnouncementCache, onDismiss: () -> Unit) {
    val bg = when (ann.type) {
        "sos"     -> MaterialTheme.colorScheme.errorContainer
        "holiday" -> MaterialTheme.colorScheme.tertiaryContainer
        else      -> MaterialTheme.colorScheme.surfaceVariant
    }
    Card(colors = CardDefaults.cardColors(containerColor = bg), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                if (ann.type == "sos") Text("URGENT", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                Text(ann.message, style = MaterialTheme.typography.bodyMedium)
                Text("— ${ann.announcedByName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                Icon(Icons.Default.Close, "Dismiss", modifier = Modifier.size(16.dp))
            }
        }
    }
}
