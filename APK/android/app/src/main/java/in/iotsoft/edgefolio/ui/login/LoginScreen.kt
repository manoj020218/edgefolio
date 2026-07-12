package `in`.iotsoft.edgefolio.ui.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun LoginScreen(
    viewModel: LoginViewModel = hiltViewModel(),
    onLoginSuccess: (role: String) -> Unit,
    onNeedOfficePicker: () -> Unit,
    onForgotPassword: () -> Unit,
    onPasswordMustChange: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    var companyId by remember { mutableStateOf(viewModel.rememberedCompanyId ?: "") }
    var empCode   by remember { mutableStateOf(viewModel.rememberedEmpCode   ?: "") }
    var password  by remember { mutableStateOf("") }
    var rememberMe by remember { mutableStateOf(viewModel.rememberedEmpCode != null) }
    var showPassword by remember { mutableStateOf(false) }

    // Navigate when state changes
    LaunchedEffect(state.loginSuccess) {
        if (state.loginSuccess) onLoginSuccess(state.successRole)
    }
    LaunchedEffect(state.needOfficePicker) {
        if (state.needOfficePicker) onNeedOfficePicker()
    }
    LaunchedEffect(state.passwordMustChange) {
        if (state.passwordMustChange) onPasswordMustChange()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Header
        Text("EdgeFolio", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text("Attendance & Payroll", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(40.dp))

        // Company ID
        OutlinedTextField(
            value = companyId,
            onValueChange = { companyId = it; viewModel.clearError() },
            label = { Text("Company ID") },
            placeholder = { Text("e.g. jenix-mumbai") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
        )
        Spacer(Modifier.height(12.dp))

        // Employee ID
        OutlinedTextField(
            value = empCode,
            onValueChange = { empCode = it; viewModel.clearError() },
            label = { Text("Employee ID") },
            placeholder = { Text("e.g. EMP001") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
        )
        Spacer(Modifier.height(12.dp))

        // Password
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; viewModel.clearError() },
            label = { Text("Password") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                focusManager.clearFocus()
                viewModel.login(companyId, empCode, password, rememberMe)
            }),
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                }
            },
        )
        Spacer(Modifier.height(8.dp))

        // Remember me
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Checkbox(checked = rememberMe, onCheckedChange = { rememberMe = it })
            Text("Remember me", style = MaterialTheme.typography.bodyMedium)
        }

        // Error message
        state.errorMessage?.let { msg ->
            Spacer(Modifier.height(8.dp))
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(
                    text = msg,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        // Login button
        Button(
            onClick = { viewModel.login(companyId, empCode, password, rememberMe) },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            enabled = !state.isLoading,
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
            } else {
                Text("LOGIN", fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            }
        }

        Spacer(Modifier.height(16.dp))

        // Forgot password
        TextButton(onClick = onForgotPassword) {
            Text("Forgot Password?", color = MaterialTheme.colorScheme.primary)
        }
    }
}
