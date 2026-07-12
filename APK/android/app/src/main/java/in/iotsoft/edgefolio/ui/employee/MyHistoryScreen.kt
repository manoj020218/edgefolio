package `in`.iotsoft.edgefolio.ui.employee

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import `in`.iotsoft.edgefolio.data.db.entities.LocalAttendanceRecord

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyHistoryScreen(
    viewModel: MyHistoryViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val records by viewModel.records.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Attendance History") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) }
                },
            )
        }
    ) { padding ->
        if (records.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Text("No attendance records yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(records) { HistoryItem(it) }
            }
        }
    }
}

@Composable
private fun HistoryItem(record: LocalAttendanceRecord) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (record.synced) Icons.Default.CheckCircle else Icons.Default.CloudOff,
                contentDescription = null,
                tint    = if (record.synced) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(record.date, fontWeight = FontWeight.SemiBold)
                Text("Check-in: ${record.checkinTime ?: "—"}", style = MaterialTheme.typography.bodySmall)
                Text("Mode: ${record.workType.uppercase()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            }
            SyncBadge(synced = record.synced)
        }
    }
}

@Composable
private fun SyncBadge(synced: Boolean) {
    val (label, color) = if (synced)
        "SYNCED" to MaterialTheme.colorScheme.primaryContainer
    else
        "LOCAL"  to MaterialTheme.colorScheme.surfaceVariant
    Surface(color = color, shape = MaterialTheme.shapes.small) {
        Text(
            label,
            modifier   = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style      = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
        )
    }
}
