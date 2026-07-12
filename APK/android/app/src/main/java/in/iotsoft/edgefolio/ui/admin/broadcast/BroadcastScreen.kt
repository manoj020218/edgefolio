package `in`.iotsoft.edgefolio.ui.admin.broadcast

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BroadcastScreen(
    viewModel: BroadcastViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    var selectedType by remember { mutableStateOf("general") }
    var message      by remember { mutableStateOf("") }

    val types = listOf(
        "sos"     to "🚨 URGENT / SOS",
        "holiday" to "📅 Holiday Notice",
        "event"   to "📢 Event / Meeting",
        "general" to "📣 General Notice",
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Broadcast Message") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {

            if (state.sentTo != null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Broadcast Sent!", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text("Delivered to ${state.sentTo} device(s)", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(12.dp))
                        TextButton(onClick = { viewModel.reset(); message = ""; selectedType = "general" }) {
                            Text("Send Another")
                        }
                    }
                }
                return@Column
            }

            Text("Message Type", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                types.forEach { (value, label) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selectedType == value, onClick = { selectedType = value })
                        Spacer(Modifier.width(8.dp))
                        Text(label)
                    }
                }
            }

            OutlinedTextField(
                value         = message,
                onValueChange = { message = it },
                label         = { Text("Message") },
                placeholder   = { Text("Write your message here…") },
                modifier      = Modifier.fillMaxWidth().height(140.dp),
                maxLines      = 6,
            )

            state.errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick  = { viewModel.send(selectedType, message) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled  = message.isNotBlank() && !state.isLoading,
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Icon(Icons.Default.Send, null)
                    Spacer(Modifier.width(8.dp))
                    Text("SEND TO ALL EMPLOYEES", fontWeight = FontWeight.Bold)
                }
            }

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Text(
                    "This message will be sent as a push notification to all employees and will appear on the office dashboard.",
                    modifier = Modifier.padding(12.dp),
                    style    = MaterialTheme.typography.bodySmall,
                    color    = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
