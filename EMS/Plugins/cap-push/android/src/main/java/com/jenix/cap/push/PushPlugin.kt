package com.jenix.cap.push

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.jenix.cap.core.CoreStore
import org.json.JSONObject

// POST_NOTIFICATIONS is only a runtime-requestable permission on API 33+ (Android
// 13) — Capacitor's permission machinery already resolves it to GRANTED on older
// API levels automatically, so no separate SDK branch is needed here.
@CapacitorPlugin(
    name = "JenixPush",
    permissions = [
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class PushPlugin : Plugin() {
    private lateinit var pushState: PushStateStore
    private lateinit var coreStore: CoreStore

    override fun load() {
        pushState = PushStateStore(context)
        coreStore = CoreStore(context)
    }

    // Actively asks Firebase for a live token rather than only reading whatever
    // onNewToken() last cached — on a fresh install/login the cache is often still
    // empty because FCM's own auto-init hasn't fired yet, which is exactly the case
    // this needs to work for (registering right after login). Falls back to the
    // cached value if Firebase isn't initialized (no google-services.json, e.g. a
    // fresh clone) or the live fetch fails for any other reason.
    @PluginMethod
    fun getToken(call: PluginCall) {
        val cached = pushState.token()
        try {
            FirebaseApp.getInstance()
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    pushState.saveToken(token)
                    call.resolve(JSObject().apply { put("token", token) })
                }
                .addOnFailureListener {
                    call.resolve(JSObject().apply { put("token", cached) })
                }
        } catch (e: IllegalStateException) {
            call.resolve(JSObject().apply { put("token", cached) })
        }
    }

    @PluginMethod
    fun refreshRegistration(call: PluginCall) {
        val token = call.getString("token") ?: pushState.token()
        if (token.isNullOrEmpty()) {
            call.resolve(JSObject().apply { put("uploaded", false) })
            return
        }
        try {
            pushState.saveToken(token)
            call.resolve(JSObject().apply { put("uploaded", PushTokenUploader(context).upload(context, token)) })
        } catch (error: Exception) {
            call.reject(error.message ?: "Upload failed", "BACKEND_REJECTED")
        }
    }

    @PluginMethod
    fun getPushStatus(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("token", pushState.token())
            put("configured", coreStore.baseUrl() != null)
            put("nativeCallBridgeAvailable", VideoCallBridge.isAvailable())
        })
    }

    @PluginMethod
    fun dispatchPayload(call: PluginCall) {
        val json = JSONObject(call.data.toString())
        val payload = buildMap {
            json.keys().forEach { key -> put(key, json.optString(key)) }
        }
        val type = payload["commandType"]
        val handled = JenixPushMessageHandler.handleData(context, payload)
        if (type != null) pushState.saveLastCommand(type)
        call.resolve(JSObject().apply {
            put("handled", handled)
            put("commandType", type)
        })
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(permissionStatus())
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        requestPermissionForAlias("notifications", call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        call.resolve(permissionStatus())
    }

    private fun permissionStatus() = JSObject().apply {
        put("notifications", getPermissionState("notifications").toString().lowercase())
    }
}
