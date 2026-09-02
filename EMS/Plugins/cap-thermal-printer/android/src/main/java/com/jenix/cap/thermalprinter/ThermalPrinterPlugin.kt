package com.jenix.cap.thermalprinter

import android.Manifest
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "JenixThermalPrinter",
    permissions = [
        Permission(alias = "ble", strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]),
        Permission(alias = "location", strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
    ],
)
class ThermalPrinterPlugin : Plugin() {
    private lateinit var bleScanner: BlePrinterScanner
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scanTimeoutRunnable = Runnable { finishScan("timeout") }
    private var activeScanCallId: String? = null

    override fun load() {
        bleScanner = BlePrinterScanner(context)
    }

    override fun handleOnDestroy() {
        cancelScanTimeout()
        bleScanner.stop()
        releaseActiveScanCall()
    }

    @PluginMethod
    fun scan(call: PluginCall) {
        if (!bleScanner.isSupported()) {
            call.reject("Bluetooth LE is not available on this device.", "UNSUPPORTED_OPERATION")
            return
        }
        if (!bleScanner.isBluetoothEnabled()) {
            call.reject("Bluetooth is disabled.", "UNSUPPORTED_OPERATION")
            return
        }
        if (!hasScanPermissions()) {
            requestPermissionForAliases(scanPermissionAliases(), call, "scanPermissionCallback")
            return
        }
        startScan(call)
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        finishScan("manual")
        call.resolve(JSObject().apply { put("scanning", false) })
    }

    @PluginMethod
    fun getDevices(call: PluginCall) {
        val transport = call.getString("transport")
        val devices = if (transport == null || transport == "ble") bleScanner.getDevices() else emptyList()
        call.resolve(JSObject().apply { put("devices", toBleDeviceListPayload(devices)) })
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

    @PermissionCallback
    private fun scanPermissionCallback(call: PluginCall) {
        if (!hasScanPermissions()) {
            call.reject("Bluetooth scan permission denied.", "PERMISSION_DENIED")
            return
        }
        startScan(call)
    }

    private fun startScan(call: PluginCall) {
        val config = readBleScanConfig(call) ?: return
        val timeoutMs = normalizeBleScanTimeout(call.getInt("timeoutMs"))

        finishScan("restarted")
        call.setKeepAlive(true)
        saveCall(call)
        activeScanCallId = call.callbackId

        try {
            bleScanner.start(config, ::emitDeviceFound, ::handleScanFailure)
            cancelScanTimeout()
            mainHandler.postDelayed(scanTimeoutRunnable, timeoutMs.toLong())
        } catch (error: IllegalArgumentException) {
            rejectAndReleaseScan(call, error.message ?: "Invalid BLE scan options.", "INVALID_ARGUMENT")
        } catch (error: IllegalStateException) {
            rejectAndReleaseScan(call, error.message ?: "BLE scan could not start.", "UNSUPPORTED_OPERATION")
        }
    }

    private fun handleScanFailure(errorCode: Int) {
        cancelScanTimeout()
        val devices = bleScanner.getDevices()
        notifyListeners("scanStopped", buildScanStoppedPayload("failed", devices, errorCode))

        val savedCall = activeScanCall() ?: run {
            clearActiveScanCall()
            return
        }
        activeScanCallId = null
        savedCall.setKeepAlive(false)
        savedCall.reject(bleScanFailureMessage(errorCode), "CONNECTION_FAILED")
    }

    private fun finishScan(reason: String) {
        val hadActiveScan = bleScanner.isScanning() || activeScanCallId != null
        cancelScanTimeout()
        bleScanner.stop()
        if (!hadActiveScan) {
            return
        }

        val devices = bleScanner.getDevices()
        notifyListeners("scanStopped", buildScanStoppedPayload(reason, devices))

        val savedCall = activeScanCall() ?: run {
            clearActiveScanCall()
            return
        }
        activeScanCallId = null
        savedCall.setKeepAlive(false)
        savedCall.resolve(JSObject().apply { put("devices", toBleDeviceListPayload(devices)) })
    }

    private fun emitDeviceFound(device: BlePrinterDevice) {
        notifyListeners("deviceFound", device.toJs())
    }

    private fun hasScanPermissions(): Boolean {
        return bleScanPermissionAliases().all { getPermissionState(it) == PermissionState.GRANTED }
    }

    private fun cancelScanTimeout() {
        mainHandler.removeCallbacks(scanTimeoutRunnable)
    }

    private fun rejectAndReleaseScan(call: PluginCall, message: String, code: String) {
        clearActiveScanCall()
        cancelScanTimeout()
        call.setKeepAlive(false)
        call.reject(message, code)
    }

    private fun activeScanCall(): PluginCall? {
        val callbackId = activeScanCallId ?: return null
        return bridge.getSavedCall(callbackId)
    }

    private fun clearActiveScanCall() {
        activeScanCallId = null
    }

    private fun releaseActiveScanCall() {
        val callbackId = activeScanCallId ?: return
        bridge.getSavedCall(callbackId)?.release(bridge)
        activeScanCallId = null
    }

    private fun rejectNotReady(call: PluginCall, message: String) {
        call.reject(message, "UNSUPPORTED_OPERATION")
    }

    private fun disconnectedState() = JSObject().apply {
        put("connected", false)
        put("connectionState", "disconnected")
    }
}
