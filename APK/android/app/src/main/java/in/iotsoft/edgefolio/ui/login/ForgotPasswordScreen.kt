package `in`.iotsoft.edgefolio.ui.login

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(
    viewModel: ForgotPasswordViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    var empCode by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Forgot Password") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding).padding(24.dp)) {
            Text(
                "Enter your Employee ID. Your HR Admin will be notified and set a temporary password for you.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = empCode,
                onValueChange = { empCode = it },
                label = { Text("Employee ID") },
                placeholder = { Text("e.g. EMP001") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isLoading && !state.isSuccess,
            )

            state.errorMessage?.let { msg ->
                Spacer(Modifier.height(8.dp))
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            if (state.isSuccess) {
                Spacer(Modifier.height(16.dp))
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Text(
                        "Request sent! Your HR Admin will set a temporary password and you'll receive it via SMS.",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            if (!state.isSuccess) {
                Button(
                    onClick = { viewModel.sendRequest(empCode.trim()) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    enabled = empCode.isNotBlank() && !state.isLoading,
                ) {
                    if (state.isLoading) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Text("SEND REQUEST")
                }
            } else {
                OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Text("BACK TO LOGIN")
                }
            }
        }
    }
}
