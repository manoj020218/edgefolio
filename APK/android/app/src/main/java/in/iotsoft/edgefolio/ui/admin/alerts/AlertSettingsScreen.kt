package `in`.iotsoft.edgefolio.ui.admin.alerts

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertSettingsScreen(
    viewModel: AlertSettingsViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val snackbarHost = remember { SnackbarHostState() }
    LaunchedEffect(state.errorMessage) { state.errorMessage?.let { snackbarHost.showSnackbar(it) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Alert Subscriptions") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
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
                "Get notified when these employees check in or out",
                style    = MaterialTheme.typography.bodySmall,
                color    = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.rows, key = { it.employee.id }) { row ->
                    AlertRow(
                        row       = row,
                        onToggle  = { checkin, checkout -> viewModel.toggle(row.employee.id, checkin, checkout) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AlertRow(row: AlertRow, onToggle: (checkin: Boolean, checkout: Boolean) -> Unit) {
    val sub          = row.subscription
    var checkinOn    by remember(sub) { mutableStateOf(sub?.alertCheckin ?: false) }
    var checkoutOn   by remember(sub) { mutableStateOf(sub?.alertCheckout ?: false) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(row.employee.name, fontWeight = FontWeight.SemiBold)
            Text("${row.employee.department ?: "—"} · ${row.employee.empCode}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Switch(
                        checked         = checkinOn,
                        onCheckedChange = { v -> checkinOn = v; onToggle(v, checkoutOn) },
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Check-in", style = MaterialTheme.typography.bodySmall)
                }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Switch(
                        checked         = checkoutOn,
                        onCheckedChange = { v -> checkoutOn = v; onToggle(checkinOn, v) },
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Check-out", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
