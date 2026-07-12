package `in`.iotsoft.edgefolio.ui.admin.tour

import androidx.compose.foundation.clickable
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
import `in`.iotsoft.edgefolio.data.model.EmployeeDetail
import java.time.Instant
import java.time.ZoneId

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TourWfhScreen(
    viewModel: TourWfhViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    var assignTarget by remember { mutableStateOf<EmployeeDetail?>(null) }

    // Show snackbar for success/error
    val snackbarHost = remember { SnackbarHostState() }
    LaunchedEffect(state.successMessage) { state.successMessage?.let { snackbarHost.showSnackbar(it); viewModel.clearMessages() } }
    LaunchedEffect(state.errorMessage)   { state.errorMessage?.let   { snackbarHost.showSnackbar(it); viewModel.clearMessages() } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tour / WFH Assignments") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = { IconButton(onClick = { viewModel.load() }) { Icon(Icons.Default.Refresh, null) } },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            // Filter chips
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all", "tour", "wfh", "office").forEach { f ->
                    FilterChip(
                        selected = state.filter == f,
                        onClick  = { viewModel.setFilter(f) },
                        label    = { Text(f.uppercase()) },
                    )
                }
            }

            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                val rows = viewModel.filteredRows()
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(rows, key = { it.employee.id }) { row ->
                        EmployeeAssignmentCard(
                            row        = row,
                            onAssign   = { assignTarget = row.employee },
                            onDelete   = { row.assignment?.id?.let { viewModel.deleteAssignment(it) } },
                        )
                    }
                }
            }
        }
    }

    // Assignment dialog
    assignTarget?.let { emp ->
        AssignmentDialog(
            employee = emp,
            onDismiss = { assignTarget = null },
            onConfirm = { workType, fromDate, toDate, notes ->
                viewModel.createAssignment(emp.id, workType, fromDate, toDate, notes)
                assignTarget = null
            },
        )
    }
}

@Composable
private fun EmployeeAssignmentCard(row: EmployeeRow, onAssign: () -> Unit, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable { onAssign() }) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(row.employee.name, fontWeight = FontWeight.SemiBold)
                Text("${row.employee.department ?: "—"} · ${row.employee.empCode}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                row.assignment?.let { a ->
                    Text("${a.fromDate} → ${a.toDate}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                }
            }
            if (row.assignment != null) {
                val (label, color) = if (row.assignment.workType == "tour")
                    "TOUR" to MaterialTheme.colorScheme.tertiary else "WFH" to MaterialTheme.colorScheme.secondary
                Surface(color = color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small) {
                    Text(label, modifier = Modifier.padding(6.dp, 3.dp), style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(8.dp))
                IconButton(onClick = onDelete, modifier = Modifier.size(24.dp)) {
                    Icon(Icons.Default.Close, "Remove", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                }
            } else {
                TextButton(onClick = onAssign) { Text("Assign") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssignmentDialog(
    employee: EmployeeDetail,
    onDismiss: () -> Unit,
    onConfirm: (workType: String, fromDate: String, toDate: String, notes: String?) -> Unit,
) {
    var workType    by remember { mutableStateOf("tour") }
    var showFromPicker by remember { mutableStateOf(false) }
    var showToPicker   by remember { mutableStateOf(false) }
    var fromDate    by remember { mutableStateOf("") }
    var toDate      by remember { mutableStateOf("") }
    var notes       by remember { mutableStateOf("") }

    val fromPickerState = rememberDatePickerState()
    val toPickerState   = rememberDatePickerState()

    if (showFromPicker) {
        DatePickerDialog(
            onDismissRequest = { showFromPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    fromDate = fromPickerState.selectedDateMillis?.toDateStr() ?: fromDate
                    showFromPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showFromPicker = false }) { Text("Cancel") } },
        ) { DatePicker(state = fromPickerState) }
    }

    if (showToPicker) {
        DatePickerDialog(
            onDismissRequest = { showToPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    toDate = toPickerState.selectedDateMillis?.toDateStr() ?: toDate
                    showToPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showToPicker = false }) { Text("Cancel") } },
        ) { DatePicker(state = toPickerState) }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Assign Work Type") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(employee.name, fontWeight = FontWeight.SemiBold)

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("tour", "wfh").forEach { type ->
                        FilterChip(
                            selected = workType == type,
                            onClick  = { workType = type },
                            label    = { Text(type.uppercase()) },
                        )
                    }
                }

                OutlinedButton(onClick = { showFromPicker = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.CalendarToday, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (fromDate.isBlank()) "From Date" else "From: $fromDate")
                }
                OutlinedButton(onClick = { showToPicker = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.CalendarToday, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (toDate.isBlank()) "To Date" else "To: $toDate")
                }

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(workType, fromDate, toDate, notes.ifBlank { null }) },
                enabled = fromDate.isNotBlank() && toDate.isNotBlank(),
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private fun Long.toDateStr(): String =
    Instant.ofEpochMilli(this).atZone(ZoneId.of("UTC")).toLocalDate().toString()
