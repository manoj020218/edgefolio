package com.jenix.cap.thermalprinter

import com.getcapacitor.JSObject

data class BlePrinterDevice(
    val id: String,
    val name: String?,
    val rssi: Int?,
    val serviceUuid: String?,
) {
    fun toJs() = JSObject().apply {
        put("id", id)
        put("transport", "ble")
        if (!name.isNullOrBlank()) {
            put("name", name)
        }
        if (rssi != null) {
            put("rssi", rssi)
        }
        if (!serviceUuid.isNullOrBlank()) {
            put("serviceUuid", serviceUuid)
        }
    }
}
