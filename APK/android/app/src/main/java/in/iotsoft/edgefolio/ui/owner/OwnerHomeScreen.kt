package `in`.iotsoft.edgefolio.ui.owner

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import `in`.iotsoft.edgefolio.data.model.AnalyticsResponse
import `in`.iotsoft.edgefolio.data.model.DayCount
import `in`.iotsoft.edgefolio.data.model.DeptStat
import `in`.iotsoft.edgefolio.data.model.LiveFeedEntry
import `in`.iotsoft.edgefolio.data.model.LiveSummary
import `in`.iotsoft.edgefolio.ui.admin.EdgeHealthState
import `in`.iotsoft.edgefolio.ui.admin.EdgeStatus
import kotlin.math.max

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerHomeScreen(
    viewModel: OwnerViewModel = hiltViewModel(),
    onLogout: () -> Unit,
    onBroadcast: () -> Unit,
) {
    val state       by viewModel.state.collectAsState()
    val healthState by viewModel.healthMonitor.state.collectAsState(
        initial = EdgeHealthState(EdgeStatus.UNKNOWN, null)
    )

    var selectedTab by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Owner Dashboard") },
                actions = {
                    IconButton(onClick = { viewModel.load() }) { Icon(Icons.Default.Refresh, null) }
                    IconButton(onClick = onLogout) { Icon(Icons.Default.Logout, null) }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick  = { selectedTab = 0 },
                    icon     = { Icon(Icons.Default.Dashboard, null) },
                    label    = { Text("Dashboard") },
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick  = { selectedTab = 1 },
                    icon     = { Icon(Icons.Default.List, null) },
                    label    = { Text("Timeline") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick  = { onBroadcast() },
                    icon     = { Icon(Icons.Default.Campaign, null) },
                    label    = { Text("Broadcast") },
                )
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            // EDGE offline banner
            if (healthState.status == EdgeStatus.OFFLINE) {
                Surface(color = MaterialTheme.colorScheme.errorContainer) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Default.WifiOff, null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(16.dp))
                        Text(
                            "Office System is Offline${healthState.lastSeenOnline?.let { " — Last seen $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }

            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            when (selectedTab) {
                0 -> DashboardTab(state.summary, state.analytics)
                1 -> TimelineTab(viewModel)
            }
        }
    }
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

@Composable
private fun DashboardTab(summary: LiveSummary?, analytics: AnalyticsResponse?) {
    LazyColumn(
        modifier        = Modifier.fillMaxSize(),
        contentPadding  = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            // Large headcount widget
            if (summary != null) HeadcountWidget(summary)
        }
        item {
            // 7-day sparkline
            analytics?.sevenDayTrend?.let { trend ->
                TrendCard(trend)
            }
        }
        item {
            // Dept breakdown
            analytics?.departmentBreakdown?.let { depts ->
                DeptBreakdownCard(depts)
            }
        }
    }
}

@Composable
private fun HeadcountWidget(summary: LiveSummary) {
    Card(
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier            = Modifier.fillMaxWidth().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "${summary.present} of ${summary.totalEmployees}",
                style      = MaterialTheme.typography.displayMedium,
                fontWeight = FontWeight.Bold,
                color      = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                "present right now",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(16.dp))
            Row(
                modifier              = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                StatPill("In-Office", summary.present - summary.onTour - summary.wfh, MaterialTheme.colorScheme.primary)
                StatPill("On Tour",   summary.onTour, MaterialTheme.colorScheme.tertiary)
                StatPill("WFH",       summary.wfh,    MaterialTheme.colorScheme.secondary)
                StatPill("Absent",    summary.absent,  MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun StatPill(label: String, count: Int, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            "$count",
            style      = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color      = color,
        )
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TrendCard(trend: List<DayCount>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("7-Day Attendance Trend", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            TrendSparkline(trend)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                trend.forEach { d ->
                    Text(
                        d.date.substring(5),  // MM-DD
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun TrendSparkline(trend: List<DayCount>) {
    val barColor  = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.outlineVariant

    Canvas(modifier = Modifier.fillMaxWidth().height(80.dp)) {
        if (trend.isEmpty()) return@Canvas
        val maxPresent = max(trend.maxOf { it.present }, 1)
        val barWidth   = size.width / trend.size
        val gap        = barWidth * 0.15f

        trend.forEachIndexed { i, d ->
            val barHeight = (d.present.toFloat() / maxPresent) * (size.height - 20.dp.toPx())
            val left      = i * barWidth + gap
            val right     = (i + 1) * barWidth - gap
            val top       = size.height - barHeight - 4.dp.toPx()
            val bottom    = size.height - 4.dp.toPx()

            // Track (total)
            drawRect(
                color   = trackColor,
                topLeft = Offset(left, 4.dp.toPx()),
                size    = androidx.compose.ui.geometry.Size(right - left, size.height - 8.dp.toPx()),
            )
            // Present bar
            if (barHeight > 0) {
                drawRect(
                    color   = barColor,
                    topLeft = Offset(left, top),
                    size    = androidx.compose.ui.geometry.Size(right - left, bottom - top),
                )
            }
        }
    }
}

@Composable
private fun DeptBreakdownCard(depts: List<DeptStat>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Department Breakdown", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            depts.forEach { d ->
                DeptRow(d)
            }
        }
    }
}

@Composable
private fun DeptRow(d: DeptStat) {
    val fraction = if (d.total > 0) d.present.toFloat() / d.total else 0f
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(d.dept, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            Text("${d.present} / ${d.total}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        LinearProgressIndicator(
            progress  = { fraction },
            modifier  = Modifier.fillMaxWidth().height(6.dp),
        )
    }
}

// ── Timeline tab ──────────────────────────────────────────────────────────────

@Composable
private fun TimelineTab(viewModel: OwnerViewModel) {
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        // Filter chips
        Row(
            modifier              = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            listOf("all", "present", "tour", "wfh", "absent").forEach { f ->
                FilterChip(
                    selected = state.timelineFilter == f,
                    onClick  = { viewModel.setTimelineFilter(f) },
                    label    = { Text(f.uppercase(), style = MaterialTheme.typography.labelSmall) },
                )
            }
        }

        val rows = viewModel.filteredTimeline()

        if (rows.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No records for today", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier        = Modifier.fillMaxSize(),
                contentPadding  = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(rows, key = { it.empId }) { entry ->
                    TimelineEntryCard(entry)
                }
            }
        }
    }
}

@Composable
private fun TimelineEntryCard(entry: LiveFeedEntry) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier          = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(entry.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "${entry.dept ?: "—"} · ${entry.empCode}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (entry.checkinTime != null) {
                    val checkoutDisplay = entry.checkoutTime ?: "still present"
                    Text(
                        "In: ${entry.checkinTime}  •  Out: $checkoutDisplay",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
            if (entry.checkinTime != null) {
                val (label, color) = when (entry.workType) {
                    "mobile-tour" -> "TOUR" to MaterialTheme.colorScheme.tertiary
                    "mobile-wfh"  -> "WFH"  to MaterialTheme.colorScheme.secondary
                    else          -> "OFFICE" to MaterialTheme.colorScheme.primary
                }
                Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
                    Text(
                        label,
                        modifier   = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style      = MaterialTheme.typography.labelSmall,
                        color      = color,
                        fontWeight = FontWeight.Bold,
                    )
                }
            } else {
                Surface(
                    color  = MaterialTheme.colorScheme.errorContainer,
                    shape  = MaterialTheme.shapes.small,
                ) {
                    Text(
                        "ABSENT",
                        modifier   = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        style      = MaterialTheme.typography.labelSmall,
                        color      = MaterialTheme.colorScheme.onErrorContainer,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
