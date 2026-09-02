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
    private lateinit var bleConnection: BlePrinterConnection
    private lateinit var usbMonitor: UsbPrinterMonitor
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scanTimeoutRunnable = Runnable { finishScan("timeout") }
    private val usbPermissionTimeoutRunnable = Runnable {
        failPendingUsbPermission("USB permission request timed out.", "CONNECTION_TIMEOUT", emitEvent = true)
    }
    private var activeScanCallId: String? = null
    private var pendingUsbPermissionCallId: String? = null
    private var pendingUsbPermissionDeviceId: String? = null
    private var preparedUsbDeviceId: String? = null

    override fun load() {
        bleScanner = BlePrinterScanner(context)
        bleConnection = BlePrinterConnection(context, object : BleConnectionListener {
            override fun onConnected(snapshot: BleConnectionSnapshot) = emitListenerEvent("connected", buildBleStatusPayload(snapshot))
            override fun onDisconnected(snapshot: BleConnectionSnapshot) = emitListenerEvent("disconnected", buildBleStatusPayload(snapshot))
            override fun onConnectionError(message: String, code: String) = emitListenerEvent("connectionError", buildConnectionErrorPayload(message, code, "ble"))
        })
        usbMonitor = UsbPrinterMonitor(context, object : UsbPrinterListener {
            override fun onUsbAttached(device: UsbPrinterDevice) = emitListenerEvent("usbAttached", device.toJs())

            override fun onUsbDetached(device: UsbPrinterDevice) {
                if (preparedUsbDeviceId == device.id) {
                    preparedUsbDeviceId = null
                }
                if (pendingUsbPermissionDeviceId == device.id) {
                    failPendingUsbPermission("USB device was detached before permission completed.", "DEVICE_NOT_FOUND", emitEvent = true)
                }
                emitListenerEvent("usbDetached", device.toJs())
            }

            override fun onUsbPermissionResult(device: UsbPrinterDevice, granted: Boolean) {
                if (pendingUsbPermissionDeviceId != device.id) {
                    return
                }
                if (!granted) {
                    failPendingUsbPermission("USB permission denied for the selected device.", "USB_PERMISSION_DENIED", emitEvent = true)
                    return
                }
                completePendingUsbPermission(device)
            }
        })
        usbMonitor.start()
    }

    override fun handleOnDestroy() {
        cancelScanTimeout()
        cancelUsbPermissionTimeout()
        bleScanner.stop()
        releaseActiveScanCall()
        releasePendingUsbPermissionCall()
        bleConnection.shutdown()
        usbMonitor.stop()
        preparedUsbDeviceId = null
    }

    @PluginMethod
    fun scan(call: PluginCall) {
        when (call.getString("transport")) {
            null, "ble" -> scanBle(call)
            "usb" -> scanUsb(call)
            else -> call.reject("transport must be 'ble' or 'usb'.", "INVALID_ARGUMENT")
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        finishScan("manual")
        call.resolve(JSObject().apply { put("scanning", false) })
    }

    @PluginMethod
    fun getDevices(call: PluginCall) {
        when (call.getString("transport")) {
            null -> call.resolve(JSObject().apply {
                put("devices", toCombinedDeviceListPayload(bleScanner.getDevices(), usbMonitor.getDevices()))
            })
            "ble" -> call.resolve(JSObject().apply { put("devices", toBleDeviceListPayload(bleScanner.getDevices())) })
            "usb" -> call.resolve(JSObject().apply { put("devices", toUsbDeviceListPayload(usbMonitor.getDevices())) })
            else -> call.reject("transport must be 'ble' or 'usb'.", "INVALID_ARGUMENT")
        }
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        when (call.getString("transport")) {
            null, "ble" -> connectBle(call)
            "usb" -> connectUsb(call)
            else -> call.reject("transport must be 'ble' or 'usb'.", "INVALID_ARGUMENT")
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        preparedUsbDeviceId = null
        cancelPendingUsbPermissionRequest("USB permission request cancelled.", "CONNECTION_FAILED")
        bleConnection.disconnect { call.resolve(buildDisconnectedStatusPayload()) }
    }

    @PluginMethod
    fun isConnected(call: PluginCall) {
        call.resolve(JSObject().apply { put("connected", bleConnection.isConnected()) })
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(currentStatusPayload())
    }

    @PluginMethod
    fun write(call: PluginCall) {
        if (!bleConnection.isConnected()) {
            call.reject("No printer is connected.", "NOT_CONNECTED")
            return
        }
        if (!hasConnectPermissions()) {
            call.reject("Bluetooth permission denied.", "PERMISSION_DENIED")
            return
        }
        val payload = readBleWritePayload(call) ?: return
        bleConnection.write(
            payload,
            onSuccess = { written -> call.resolve(JSObject().apply { put("written", written) }) },
            onError = { message, code -> call.reject(message, code) },
        )
    }

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

    @PermissionCallback
    private fun connectPermissionCallback(call: PluginCall) {
        if (!hasConnectPermissions()) {
            call.reject("Bluetooth connect permission denied.", "PERMISSION_DENIED")
            return
        }
        val config = readBleConnectConfig(call) ?: return
        startBleConnect(call, config)
    }

    private fun scanBle(call: PluginCall) {
        if (!bleScanner.isSupported()) {
            call.reject("Bluetooth LE is not available on this device.", "UNSUPPORTED_OPERATION")
            return
        }
        if (!bleScanner.isBluetoothEnabled()) {
            call.reject("Bluetooth is disabled.", "UNSUPPORTED_OPERATION")
            return
        }
        if (!hasScanPermissions()) {
            requestPermissionForAliases(bleScanPermissionAliases(), call, "scanPermissionCallback")
            return
        }
        startScan(call)
    }

    private fun scanUsb(call: PluginCall) {
        if (!usbMonitor.isSupported()) {
            call.reject("USB host is not available on this device.", "UNSUPPORTED_OPERATION")
            return
        }
        finishScan("restarted")
        val config = readUsbScanConfig(call)
        call.resolve(JSObject().apply { put("devices", toUsbDeviceListPayload(usbMonitor.getDevices(config))) })
    }

    private fun connectBle(call: PluginCall) {
        cancelPendingUsbPermissionRequest("USB permission request cancelled.", "CONNECTION_FAILED")
        preparedUsbDeviceId = null
        val config = readBleConnectConfig(call) ?: return
        if (!hasConnectPermissions()) {
            requestPermissionForAliases(bleConnectPermissionAliases(), call, "connectPermissionCallback")
            return
        }
        startBleConnect(call, config)
    }

    private fun connectUsb(call: PluginCall) {
        if (!usbMonitor.isSupported()) {
            call.reject("USB host is not available on this device.", "UNSUPPORTED_OPERATION")
            return
        }
        val bleStatus = bleConnection.status()
        if (bleStatus.connectionState != "disconnected") {
            call.reject("Disconnect the current printer before connecting another.", "CONNECTION_FAILED")
            return
        }
        finishScan("manual")
        preparedUsbDeviceId = null
        val config = readUsbConnectConfig(call) ?: return
        val selection = selectUsbDevice(usbMonitor.getDevices(), config)
        if (selection.device == null) {
            call.reject(selection.message ?: "USB device was not found.", selection.code ?: "DEVICE_NOT_FOUND")
            return
        }
        val device = selection.device
        if (device.permissionGranted) {
            preparedUsbDeviceId = device.id
            call.resolve(buildUsbStatusPayload(device))
            return
        }
        if (pendingUsbPermissionCallId != null) {
            call.reject("A USB permission request is already in progress.", "CONNECTION_FAILED")
            return
        }
        call.setKeepAlive(true)
        saveCall(call)
        pendingUsbPermissionCallId = call.callbackId
        pendingUsbPermissionDeviceId = device.id
        cancelUsbPermissionTimeout()
        if (!usbMonitor.requestPermission(device.id)) {
            failPendingUsbPermission("USB device was detached before permission could be requested.", "DEVICE_NOT_FOUND")
            return
        }
        mainHandler.postDelayed(usbPermissionTimeoutRunnable, config.timeoutMs.toLong())
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

    private fun startBleConnect(call: PluginCall, config: BleConnectConfig) {
        finishScan("manual")
        bleConnection.connect(
            config = config,
            scannedDevice = bleScanner.getDevice(config.deviceId),
            onSuccess = { snapshot -> call.resolve(buildBleStatusPayload(snapshot)) },
            onError = { message, code -> call.reject(message, code) },
        )
    }

    private fun handleScanFailure(errorCode: Int) {
        cancelScanTimeout()
        val devices = bleScanner.getDevices()
        emitListenerEvent("scanStopped", buildScanStoppedPayload("failed", devices, errorCode))
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
        if (!hadActiveScan) return
        val devices = bleScanner.getDevices()
        emitListenerEvent("scanStopped", buildScanStoppedPayload(reason, devices))
        val savedCall = activeScanCall() ?: run {
            clearActiveScanCall()
            return
        }
        activeScanCallId = null
        savedCall.setKeepAlive(false)
        savedCall.resolve(JSObject().apply { put("devices", toBleDeviceListPayload(devices)) })
    }

    private fun emitDeviceFound(device: BlePrinterDevice) {
        emitListenerEvent("deviceFound", device.toJs())
    }

    private fun emitListenerEvent(eventName: String, payload: JSObject) {
        mainHandler.post { notifyListeners(eventName, payload) }
    }

    private fun completePendingUsbPermission(device: UsbPrinterDevice) {
        val savedCall = pendingUsbPermissionCall() ?: run {
            clearPendingUsbPermissionState()
            return
        }
        preparedUsbDeviceId = device.id
        clearPendingUsbPermissionState()
        savedCall.setKeepAlive(false)
        savedCall.resolve(buildUsbStatusPayload(device))
    }

    private fun hasScanPermissions(): Boolean {
        return bleScanPermissionAliases().all { getPermissionState(it) == PermissionState.GRANTED }
    }

    private fun hasConnectPermissions(): Boolean {
        return bleConnectPermissionAliases().all { getPermissionState(it) == PermissionState.GRANTED }
    }

    private fun cancelScanTimeout() {
        mainHandler.removeCallbacks(scanTimeoutRunnable)
    }

    private fun cancelUsbPermissionTimeout() {
        mainHandler.removeCallbacks(usbPermissionTimeoutRunnable)
    }

    private fun currentStatusPayload(): JSObject {
        val bleStatus = bleConnection.status()
        if (bleStatus.connectionState != "disconnected") {
            return buildBleStatusPayload(bleStatus)
        }
        val pendingUsbDevice = pendingUsbPermissionDeviceId?.let { usbMonitor.getDevice(it) }
        if (pendingUsbPermissionCallId != null) {
            return buildUsbStatusPayload(pendingUsbDevice, "connecting")
        }
        val preparedUsbDeviceId = preparedUsbDeviceId ?: return buildDisconnectedStatusPayload()
        val preparedDevice = usbMonitor.getDevice(preparedUsbDeviceId)
        if (preparedDevice != null) {
            return buildUsbStatusPayload(preparedDevice)
        }
        this.preparedUsbDeviceId = null
        return buildDisconnectedStatusPayload()
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

    private fun pendingUsbPermissionCall(): PluginCall? {
        val callbackId = pendingUsbPermissionCallId ?: return null
        return bridge.getSavedCall(callbackId)
    }

    private fun clearPendingUsbPermissionState() {
        cancelUsbPermissionTimeout()
        pendingUsbPermissionCallId = null
        pendingUsbPermissionDeviceId = null
    }

    private fun failPendingUsbPermission(
        message: String,
        code: String,
        emitEvent: Boolean = false,
    ) {
        val savedCall = pendingUsbPermissionCall()
        clearPendingUsbPermissionState()
        savedCall?.setKeepAlive(false)
        savedCall?.reject(message, code)
        if (emitEvent) {
            emitListenerEvent("connectionError", buildConnectionErrorPayload(message, code, "usb"))
        }
    }

    private fun cancelPendingUsbPermissionRequest(message: String, code: String) {
        failPendingUsbPermission(message, code, emitEvent = false)
    }

    private fun releaseActiveScanCall() {
        val callbackId = activeScanCallId ?: return
        bridge.getSavedCall(callbackId)?.release(bridge)
        activeScanCallId = null
    }

    private fun releasePendingUsbPermissionCall() {
        val callbackId = pendingUsbPermissionCallId ?: return
        bridge.getSavedCall(callbackId)?.release(bridge)
        clearPendingUsbPermissionState()
    }

    private fun rejectNotReady(call: PluginCall, message: String) {
        call.reject(message, "UNSUPPORTED_OPERATION")
    }
}
