package `in`.iotsoft.edgefolio.ui.admin.enrollment

import android.graphics.Bitmap
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import `in`.iotsoft.edgefolio.data.model.SaveEmbeddingRequest
import `in`.iotsoft.edgefolio.ml.FaceEmbeddingEngine
import `in`.iotsoft.edgefolio.network.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

enum class EnrollAngle { FRONT, LEFT, RIGHT }

enum class EnrollStep {
    FRONT_PROMPT, FRONT_CAPTURING,
    LEFT_PROMPT,  LEFT_CAPTURING,
    RIGHT_PROMPT, RIGHT_CAPTURING,
    UPLOADING, DONE, FAIL
}

data class FaceEnrollmentState(
    val step: EnrollStep = EnrollStep.FRONT_PROMPT,
    val captureRequested: Boolean = false,
    val progressAngle: Int = 0,          // 0, 1, 2 captured so far
    val errorMessage: String? = null,
    val empName: String = "",
)

@HiltViewModel
class FaceEnrollmentViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val apiClient: ApiClient,
    private val embeddingEngine: FaceEmbeddingEngine,
) : ViewModel() {

    private val empId: String   = checkNotNull(savedStateHandle["empId"])
    private val empName: String = savedStateHandle["empName"] ?: ""

    private val capturedEmbeddings = mutableListOf<FloatArray>()

    private val _state = MutableStateFlow(FaceEnrollmentState(empName = empName))
    val state: StateFlow<FaceEnrollmentState> = _state

    fun requestCapture() {
        _state.update { it.copy(captureRequested = true) }
    }

    fun consumeCapture() {
        _state.update { it.copy(captureRequested = false) }
    }

    fun onFrameCaptured(bitmap: Bitmap) {
        val currentStep = _state.value.step
        val targetAngle = when (currentStep) {
            EnrollStep.FRONT_CAPTURING -> EnrollAngle.FRONT
            EnrollStep.LEFT_CAPTURING  -> EnrollAngle.LEFT
            EnrollStep.RIGHT_CAPTURING -> EnrollAngle.RIGHT
            else -> return
        }

        viewModelScope.launch {
            val embedding = embeddingEngine.generate(bitmap)
            if (embedding == null) {
                _state.update { it.copy(errorMessage = "Face not detected — try again") }
                // Step back to prompt so user can retry
                _state.update { it.copy(step = currentStep.toPrompt()) }
                return@launch
            }

            capturedEmbeddings.add(embedding)
            val captured = capturedEmbeddings.size

            _state.update { it.copy(progressAngle = captured) }

            when (targetAngle) {
                EnrollAngle.FRONT -> _state.update { it.copy(step = EnrollStep.LEFT_PROMPT) }
                EnrollAngle.LEFT  -> _state.update { it.copy(step = EnrollStep.RIGHT_PROMPT) }
                EnrollAngle.RIGHT -> uploadEmbedding()
            }
        }
    }

    private suspend fun uploadEmbedding() {
        _state.update { it.copy(step = EnrollStep.UPLOADING) }
        try {
            // Average the 3 embeddings and L2-normalize
            val averaged = average(capturedEmbeddings)
            val normalized = embeddingEngine.l2Normalize(averaged)
            val embeddingList = normalized.toList()

            val resp = apiClient.get().saveEmbedding(empId, SaveEmbeddingRequest(embeddingList))
            if (resp.isSuccessful && resp.body()?.ok == true) {
                _state.update { it.copy(step = EnrollStep.DONE) }
            } else {
                _state.update { it.copy(step = EnrollStep.FAIL, errorMessage = "Upload failed — server error") }
            }
        } catch (e: Exception) {
            Timber.e(e, "Face enrollment upload failed")
            _state.update { it.copy(step = EnrollStep.FAIL, errorMessage = "Upload failed — ${e.message}") }
        }
    }

    fun proceedToCapture() {
        _state.update { state ->
            val next = when (state.step) {
                EnrollStep.FRONT_PROMPT -> EnrollStep.FRONT_CAPTURING
                EnrollStep.LEFT_PROMPT  -> EnrollStep.LEFT_CAPTURING
                EnrollStep.RIGHT_PROMPT -> EnrollStep.RIGHT_CAPTURING
                else -> state.step
            }
            state.copy(step = next, captureRequested = true)
        }
    }

    fun retry() {
        capturedEmbeddings.clear()
        _state.update { FaceEnrollmentState(empName = empName) }
    }

    private fun average(embeddings: List<FloatArray>): FloatArray {
        val size = embeddings[0].size
        val result = FloatArray(size)
        for (emb in embeddings) {
            for (i in 0 until size) result[i] += emb[i]
        }
        val n = embeddings.size.toFloat()
        return FloatArray(size) { result[it] / n }
    }

    private fun EnrollStep.toPrompt() = when (this) {
        EnrollStep.FRONT_CAPTURING -> EnrollStep.FRONT_PROMPT
        EnrollStep.LEFT_CAPTURING  -> EnrollStep.LEFT_PROMPT
        EnrollStep.RIGHT_CAPTURING -> EnrollStep.RIGHT_PROMPT
        else -> this
    }
}
