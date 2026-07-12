package `in`.iotsoft.edgefolio.ui.login

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
    viewModel: ChangePasswordViewModel = hiltViewModel(),
    onPasswordChanged: (role: String) -> Unit,
) {
    // Block back navigation — user must change password before proceeding
    BackHandler(enabled = true) { /* intentionally blocked */ }

    val state by viewModel.uiState.collectAsState()
    var currentPassword by remember { mutableStateOf("") }
    var newPassword     by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var showCurrent     by remember { mutableStateOf(false) }
    var showNew         by remember { mutableStateOf(false) }

    LaunchedEffect(state.isSuccess) {
        if (state.isSuccess) onPasswordChanged(state.role)
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Change Password") }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(24.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                Text(
                    "A temporary password was set by your HR. Please set a new permanent password to continue.",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(24.dp))

            PasswordField("Current / Temporary Password", currentPassword, showCurrent, { currentPassword = it }, { showCurrent = !showCurrent })
            Spacer(Modifier.height(12.dp))
            PasswordField("New Password (min 6 characters)", newPassword, showNew, { newPassword = it }, { showNew = !showNew })
            Spacer(Modifier.height(12.dp))
            PasswordField("Confirm New Password", confirmPassword, showNew, { confirmPassword = it }, {})

            if (newPassword.isNotEmpty() && confirmPassword.isNotEmpty() && newPassword != confirmPassword) {
                Spacer(Modifier.height(4.dp))
                Text("Passwords do not match", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            state.errorMessage?.let { msg ->
                Spacer(Modifier.height(8.dp))
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = { viewModel.changePassword(currentPassword, newPassword) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled = currentPassword.isNotBlank() && newPassword.length >= 6 && newPassword == confirmPassword && !state.isLoading,
            ) {
                if (state.isLoading) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text("SET NEW PASSWORD", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun PasswordField(
    label: String,
    value: String,
    visible: Boolean,
    onValueChange: (String) -> Unit,
    onToggleVisibility: () -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = onToggleVisibility) {
                Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, null)
            }
        },
    )
}
