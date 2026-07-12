package `in`.iotsoft.edgefolio.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import `in`.iotsoft.edgefolio.data.model.LiveFeedEntry
import `in`.iotsoft.edgefolio.data.model.LiveSummary
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminHomeScreen(
    viewModel: AdminViewModel = hiltViewModel(),
    onNavigateToTourWfh: () -> Unit,
    onNavigateToEmployees: () -> Unit,
    onNavigateToBroadcast: () -> Unit,
    onNavigateToAlerts: () -> Unit,
    onLogout: () -> Unit,
) {
    val homeState   by viewModel.homeState.collectAsState()
    val healthState by viewModel.healthMonitor.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin — ${homeState.adminName}") },
                actions = {
                    IconButton(onClick = onNavigateToAlerts) { Icon(Icons.Default.Notifications, "Alerts") }
                    IconButton(onClick = { viewModel.loadLiveFeed() }) { Icon(Icons.Default.Refresh, "Refresh") }
                    IconButton(onClick = onLogout) { Icon(Icons.Default.ExitToApp, "Logout") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = true,
                    onClick = { },
                    icon = { Icon(Icons.Default.People, null) },
                    label = { Text("Live Feed") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToTourWfh,
                    icon = { Icon(Icons.Default.LocationOn, null) },
                    label = { Text("Tour/WFH") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToEmployees,
                    icon = { Icon(Icons.Default.Group, null) },
                    label = { Text("Employees") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = onNavigateToBroadcast,
                    icon = { Icon(Icons.Default.Campaign, null) },
                    label = { Text("Broadcast") },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            // EDGE offline banner
            if (healthState.status == EdgeStatus.OFFLINE) {
                Surface(color = MaterialTheme.colorScheme.errorContainer) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.WifiOff, null, tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            buildString {
                                append("Office System is Down")
                                healthState.lastSeenOnline?.let { append(" — Last seen $it") }
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            if (homeState.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            homeState.summary?.let { SummaryRow(it) }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (homeState.feed.isEmpty()) {
                    item {
                        Box(modifier = Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No attendance records yet today.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    items(homeState.feed) { FeedItem(it) }
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(s: LiveSummary) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SummaryChip("Present", s.present, MaterialTheme.colorScheme.primary, Modifier.weight(1f))
        SummaryChip("Tour", s.onTour, MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
        SummaryChip("WFH", s.wfh, MaterialTheme.colorScheme.secondary, Modifier.weight(1f))
        SummaryChip("Absent", s.absent, MaterialTheme.colorScheme.error, Modifier.weight(1f))
    }
}

@Composable
private fun SummaryChip(label: String, count: Int, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f))) {
        Column(modifier = Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$count", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
            Text(label, style = MaterialTheme.typography.labelSmall, color = color)
        }
    }
}

@Composable
private fun FeedItem(entry: LiveFeedEntry) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(entry.name, fontWeight = FontWeight.SemiBold)
                Text("${entry.dept} ${entry.designation?.let { "· $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(horizontalAlignment = Alignment.End) {
                WorkTypePill(entry.workType)
                Spacer(Modifier.height(4.dp))
                if (entry.checkinTime != null)
                    Text("In: ${entry.checkinTime}", style = MaterialTheme.typography.bodySmall)
                if (entry.checkoutTime != null)
                    Text("Out: ${entry.checkoutTime}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun WorkTypePill(workType: String) {
    val (label, color) = when (workType) {
        "tour"   -> "TOUR"   to MaterialTheme.colorScheme.tertiary
        "wfh"    -> "WFH"    to MaterialTheme.colorScheme.secondary
        "office" -> "OFFICE" to MaterialTheme.colorScheme.primary
        else     -> workType.uppercase() to MaterialTheme.colorScheme.outline
    }
    Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
        Text(label, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.Bold)
    }
}
