package `in`.iotsoft.edgefolio.ui.admin.enrollment

import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Camera
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
import `in`.iotsoft.edgefolio.ui.attendance.CameraXManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FaceEnrollmentScreen(
    viewModel: FaceEnrollmentViewModel = hiltViewModel(),
    onBack: () -> Unit,
) {
    val state          by viewModel.state.collectAsState()
    val context         = LocalContext.current
    val lifecycleOwner  = LocalLifecycleOwner.current

    // Single camera instance; capture triggered via requestCapture callback
    val cameraManager = remember {
        CameraXManager(context) { _, _, _ -> }
    }

    val isCapturing = state.step in listOf(
        EnrollStep.FRONT_CAPTURING,
        EnrollStep.LEFT_CAPTURING,
        EnrollStep.RIGHT_CAPTURING,
    )

    LaunchedEffect(state.captureRequested) {
        if (state.captureRequested) {
            viewModel.consumeCapture()
            cameraManager.requestCapture { bitmap ->
                viewModel.onFrameCaptured(bitmap)
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraManager.release() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Face Enrollment") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
            )
        }
    ) { padding ->
        Column(
            modifier            = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(state.empName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ProgressDots(captured = state.progressAngle)

            when (state.step) {
                EnrollStep.FRONT_PROMPT -> AnglePrompt(
                    angle       = "FRONT",
                    instruction = "Look straight at the camera",
                    onReady     = { viewModel.proceedToCapture() },
                )
                EnrollStep.LEFT_PROMPT -> AnglePrompt(
                    angle       = "LEFT",
                    instruction = "Turn your head slightly to the LEFT",
                    onReady     = { viewModel.proceedToCapture() },
                )
                EnrollStep.RIGHT_PROMPT -> AnglePrompt(
                    angle       = "RIGHT",
                    instruction = "Turn your head slightly to the RIGHT",
                    onReady     = { viewModel.proceedToCapture() },
                )

                EnrollStep.FRONT_CAPTURING,
                EnrollStep.LEFT_CAPTURING,
                EnrollStep.RIGHT_CAPTURING -> {
                    Box(modifier = Modifier.fillMaxWidth().height(360.dp)) {
                        AndroidView(
                            factory = { ctx ->
                                PreviewView(ctx).also { pv ->
                                    cameraManager.bind(lifecycleOwner, pv)
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                        )
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val cx = size.width / 2f
                            val cy = size.height / 2f
                            val rx = size.width * 0.38f
                            val ry = size.height * 0.46f
                            drawOval(
                                color   = Color.White.copy(alpha = 0.85f),
                                topLeft = Offset(cx - rx, cy - ry),
                                size    = Size(rx * 2, ry * 2),
                                style   = Stroke(width = 3.dp.toPx()),
                            )
                        }
                    }
                    CircularProgressIndicator()
                    Text("Capturing…", style = MaterialTheme.typography.bodySmall)
                }

                EnrollStep.UPLOADING -> {
                    Spacer(Modifier.height(48.dp))
                    CircularProgressIndicator()
                    Spacer(Modifier.height(8.dp))
                    Text("Uploading embedding…", style = MaterialTheme.typography.bodyMedium)
                }

                EnrollStep.DONE -> {
                    Spacer(Modifier.height(32.dp))
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Column(
                            modifier            = Modifier.fillMaxWidth().padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text("Enrollment Complete!", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text(
                                "${state.empName} is now enrolled for mobile face attendance.",
                                style     = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = onBack) { Text("Done") }
                        }
                    }
                }

                EnrollStep.FAIL -> {
                    Spacer(Modifier.height(32.dp))
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Column(
                            modifier            = Modifier.fillMaxWidth().padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                "Enrollment Failed",
                                fontWeight = FontWeight.Bold,
                                style      = MaterialTheme.typography.titleMedium,
                                color      = MaterialTheme.colorScheme.onErrorContainer,
                            )
                            state.errorMessage?.let {
                                Text(
                                    it,
                                    style     = MaterialTheme.typography.bodySmall,
                                    color     = MaterialTheme.colorScheme.onErrorContainer,
                                    textAlign = TextAlign.Center,
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { viewModel.retry() }) { Text("Try Again") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AnglePrompt(angle: String, instruction: String, onReady: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
            Text(
                angle,
                modifier   = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                style      = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color      = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
        Text(instruction, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Button(
            onClick  = onReady,
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Icon(Icons.Default.Camera, null)
            Spacer(Modifier.width(8.dp))
            Text("CAPTURE", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ProgressDots(captured: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(3) { i ->
            Surface(
                color    = if (i < captured) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                shape    = MaterialTheme.shapes.small,
                modifier = Modifier.size(width = 40.dp, height = 8.dp),
            ) {}
        }
    }
    Text(
        "$captured / 3 angles captured",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
