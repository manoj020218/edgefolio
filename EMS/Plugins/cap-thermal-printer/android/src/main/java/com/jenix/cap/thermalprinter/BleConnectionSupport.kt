package com.jenix.cap.thermalprinter

import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import java.util.UUID

private const val BLE_CONNECT_TIMEOUT_MS = 15000

data class BleConnectConfig(
    val deviceId: String,
    val serviceUuid: UUID?,
    val writeCharacteristicUuid: UUID?,
    val timeoutMs: Int,
)

data class BleConnectionSnapshot(
    val connected: Boolean,
    val connectionState: String,
    val device: BlePrinterDevice?,
)

data class BleRawWritePayload(
    val bytes: ByteArray,
    val chunkSize: Int?,
)

fun readBleConnectConfig(call: PluginCall): BleConnectConfig? {
    val transport = call.getString("transport")
    if (transport != null && transport != "ble") {
        call.reject("Only BLE connections are supported in this phase.", "UNSUPPORTED_OPERATION")
        return null
    }
    val deviceId = call.getString("deviceId")?.trim()
    if (deviceId.isNullOrEmpty()) {
        call.reject("deviceId is required for BLE connections.", "INVALID_ARGUMENT")
        return null
    }
    val serviceUuid = readUuid(call, "serviceUuid")
    if (!serviceUuid.valid) {
        return null
    }
    val writeCharacteristicUuid = readUuid(call, "writeCharacteristicUuid")
    if (!writeCharacteristicUuid.valid) {
        return null
    }
    return BleConnectConfig(
        deviceId = deviceId,
        serviceUuid = serviceUuid.value,
        writeCharacteristicUuid = writeCharacteristicUuid.value,
        timeoutMs = (call.getInt("timeoutMs") ?: BLE_CONNECT_TIMEOUT_MS).coerceIn(3000, 30000),
    )
}

fun readBleWritePayload(call: PluginCall): BleRawWritePayload? {
    val values = call.getArray("data")
    if (values == null) {
        call.reject("data must be a byte array.", "INVALID_ARGUMENT")
        return null
    }
    val bytes = ByteArray(values.length())
    for (index in 0 until values.length()) {
        val value = values.opt(index)
        if (value !is Number) {
            call.reject("data must contain only integer byte values.", "INVALID_ARGUMENT")
            return null
        }
        val intValue = value.toInt()
        if (!value.toDouble().isFinite() || value.toDouble() != intValue.toDouble() || intValue !in 0..255) {
            call.reject("data must contain only integer byte values between 0 and 255.", "INVALID_ARGUMENT")
            return null
        }
        bytes[index] = intValue.toByte()
    }
    val chunkSize = call.getInt("chunkSize")
    if (chunkSize != null && chunkSize < 1) {
        call.reject("chunkSize must be at least 1.", "INVALID_ARGUMENT")
        return null
    }
    return BleRawWritePayload(bytes = bytes, chunkSize = chunkSize)
}

fun buildBleStatusPayload(snapshot: BleConnectionSnapshot) = JSObject().apply {
    put("connected", snapshot.connected)
    put("transport", "ble")
    put("connectionState", snapshot.connectionState)
    snapshot.device?.let { put("device", it.toJs()) }
}

fun buildConnectionErrorPayload(
    message: String,
    code: String,
    transport: String,
) = JSObject().apply {
    put("message", message)
    put("code", code)
    put("transport", transport)
}

fun bleConnectPermissionAliases(): Array<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) arrayOf("ble") else emptyArray()
}

private fun readUuid(call: PluginCall, fieldName: String): UuidParseResult {
    val value = call.getString(fieldName)?.trim().takeUnless { it.isNullOrEmpty() } ?: return UuidParseResult(valid = true, value = null)
    return try {
        UuidParseResult(valid = true, value = UUID.fromString(value))
    } catch (_: IllegalArgumentException) {
        call.reject("$fieldName must be a valid UUID.", "INVALID_ARGUMENT")
        UuidParseResult(valid = false, value = null)
    }
}

private data class UuidParseResult(
    val valid: Boolean,
    val value: UUID?,
)
