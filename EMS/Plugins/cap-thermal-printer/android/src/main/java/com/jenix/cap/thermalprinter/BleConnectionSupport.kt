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
