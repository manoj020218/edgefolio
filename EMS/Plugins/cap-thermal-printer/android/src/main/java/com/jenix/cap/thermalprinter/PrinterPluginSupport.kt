package com.jenix.cap.thermalprinter

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

fun buildDisconnectedStatusPayload() = JSObject().apply {
    put("connected", false)
    put("connectionState", "disconnected")
}

fun toCombinedDeviceListPayload(
    bleDevices: List<BlePrinterDevice>,
    usbDevices: List<UsbPrinterDevice>,
) = JSArray().apply {
    bleDevices.forEach { put(it.toJs()) }
    usbDevices.forEach { put(it.toJs()) }
}
