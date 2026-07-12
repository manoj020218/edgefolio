package `in`.iotsoft.edgefolio.ui.attendance

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceCameraScreen(
    workType: String,
    viewModel: AttendanceViewModel = hiltViewModel(),
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val state     by viewModel.uiState.collectAsState()
    val context   = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current

    var hasCamera by remember { mutableStateOf(context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { hasCamera = it }

    val cameraManager = remember {
        CameraXManager(context) { face, bounds, bitmap ->
            viewModel.onFrame(face, bounds, bitmap)
        }
    }

    LaunchedEffect(Unit) {
        if (!hasCamera) permLauncher.launch(Manifest.permission.CAMERA)
        viewModel.loadStatus()
    }

    LaunchedEffect(state.step) {
        if (state.step is AttendanceStep.Done) onDone()
    }

    LaunchedEffect(state.captureRequested) {
        if (state.captureRequested) {
            viewModel.consumeCapture()
            cameraManager.requestCapture { bitmap -> viewModel.onCapturedFrame(bitmap) }
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraManager.release() }
    }

    val workLabel = if (workType == "tour") "Tour Attendance" else "WFH Attendance"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(workLabel) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {

            if (!hasCamera) {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Camera permission required", style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { permLauncher.launch(Manifest.permission.CAMERA) }) { Text("Grant Permission") }
                }
                return@Scaffold
            }

            // CameraX preview
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { pv -> cameraManager.bind(lifecycle, pv) }
                },
                modifier = Modifier.fillMaxSize(),
            )

            // Face bounding box overlay
            state.faceBounds?.let { bounds ->
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val w = size.width
                    val h = size.height
                    drawRect(
                        color   = Color.Green,
                        topLeft = Offset(bounds.left * w, bounds.top * h),
                        size    = Size((bounds.right - bounds.left) * w, (bounds.bottom - bounds.top) * h),
                        style   = Stroke(width = 4f),
                    )
                }
            }

            // Step overlay at the bottom
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                when (val step = state.step) {
                    is AttendanceStep.Idle -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Face verification required", color = Color.White, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(16.dp))
                            Button(
                                onClick = { viewModel.startLiveness(workType) },
                                modifier = Modifier.fillMaxWidth().height(52.dp),
                            ) {
                                Text("START FACE VERIFICATION", fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    is AttendanceStep.Liveness ->
                        Text(state.livenessHint, color = Color.White, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)

                    is AttendanceStep.Capturing,
                    is AttendanceStep.Processing -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Analysing face…", color = Color.White, style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(8.dp))
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(32.dp))
                    }

                    is AttendanceStep.AcquiringGps -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Getting GPS location…", color = Color.White, style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(8.dp))
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(32.dp))
                    }

                    is AttendanceStep.Submitting -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Marking attendance…", color = Color.White, style = MaterialTheme.typography.bodyLarge)
                        Spacer(Modifier.height(8.dp))
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(32.dp))
                    }

                    is AttendanceStep.Done -> {
                        // Handled by LaunchedEffect above; nothing to show here
                    }

                    is AttendanceStep.Fail -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                            Text(step.message, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Cancel") }
                            Button(
                                onClick = { viewModel.reset(); viewModel.startLiveness(workType) },
                                modifier = Modifier.weight(1f),
                            ) { Text("Try Again") }
                        }
                    }
                }
            }
        }
    }
}
