package com.jenix.cap.thermalprinter

class BleWriteRequest(
    private val chunks: List<ByteArray>,
    val totalBytes: Int,
    private val onSuccess: (Int) -> Unit,
    private val onError: (String, String) -> Unit,
) {
    private var index = 0

    fun nextChunk(): ByteArray? = chunks.getOrNull(index)

    fun advance() {
        index += 1
    }

    fun isComplete(): Boolean = index >= chunks.size

    fun resolve() {
        onSuccess(totalBytes)
    }

    fun reject(message: String, code: String) {
        onError(message, code)
    }
}

fun splitBlePayload(bytes: ByteArray, chunkSize: Int): List<ByteArray> {
    val chunks = ArrayList<ByteArray>()
    var index = 0
    while (index < bytes.size) {
        val end = minOf(bytes.size, index + chunkSize)
        chunks.add(bytes.copyOfRange(index, end))
        index = end
    }
    return chunks
}
