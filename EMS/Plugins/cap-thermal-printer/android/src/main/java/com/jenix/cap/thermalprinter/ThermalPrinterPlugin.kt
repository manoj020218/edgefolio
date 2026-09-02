package com.jenix.cap.thermalprinter

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "JenixThermalPrinter")
class ThermalPrinterPlugin : Plugin() {
    @PluginMethod
    fun scan(call: PluginCall) = rejectNotReady(call, "BLE scanning will be added in a later phase.")

    @PluginMethod
    fun stopScan(call: PluginCall) {
        call.resolve(JSObject().apply { put("scanning", false) })
    }

    @PluginMethod
    fun getDevices(call: PluginCall) {
        call.resolve(JSObject().apply { put("devices", JSArray()) })
    }

    @PluginMethod
    fun connect(call: PluginCall) = rejectNotReady(call, "Printer connections will be added in a later phase.")

    @PluginMethod
    fun disconnect(call: PluginCall) {
        call.resolve(disconnectedState())
    }

    @PluginMethod
    fun isConnected(call: PluginCall) {
        call.resolve(JSObject().apply { put("connected", false) })
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(disconnectedState())
    }

    @PluginMethod
    fun write(call: PluginCall) = rejectNotReady(call, "Raw writes will be added in a later phase.")

    @PluginMethod
    fun printText(call: PluginCall) = rejectNotReady(call, "Text printing will be added in a later phase.")

    @PluginMethod
    fun feed(call: PluginCall) = rejectNotReady(call, "Paper feed will be added in a later phase.")

    @PluginMethod
    fun printQRCode(call: PluginCall) = rejectNotReady(call, "QR printing will be added in a later phase.")

    @PluginMethod
    fun printBarcode(call: PluginCall) = rejectNotReady(call, "Barcode printing will be added in a later phase.")

    @PluginMethod
    fun printImage(call: PluginCall) = rejectNotReady(call, "Image printing will be added in a later phase.")

    @PluginMethod
    fun cut(call: PluginCall) = rejectNotReady(call, "Cut commands will be added in a later phase.")

    @PluginMethod
    fun openCashDrawer(call: PluginCall) = rejectNotReady(call, "Cash drawer commands will be added in a later phase.")

    private fun rejectNotReady(call: PluginCall, message: String) {
        call.reject(message, "UNSUPPORTED_OPERATION")
    }

    private fun disconnectedState() = JSObject().apply {
        put("connected", false)
        put("connectionState", "disconnected")
    }
}
