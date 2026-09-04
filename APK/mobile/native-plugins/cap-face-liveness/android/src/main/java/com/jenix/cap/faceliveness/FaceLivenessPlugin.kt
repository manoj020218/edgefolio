package com.jenix.cap.faceliveness

import android.Manifest
import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray

@CapacitorPlugin(
    name = "JenixFaceLiveness",
    permissions = [Permission(alias = "camera", strings = [Manifest.permission.CAMERA])],
)
class FaceLivenessPlugin : Plugin() {

    @PluginMethod
    fun capture(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
            return
        }
        launchCapture(call)
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission required", "PERMISSION_DENIED")
            return
        }
        launchCapture(call)
    }

    private fun launchCapture(call: PluginCall) {
        val timeoutMs = call.getLong("timeoutMs") ?: 5_000L
        val intent = Intent(context, FaceCaptureActivity::class.java)
            .putExtra(FaceCaptureActivity.EXTRA_TIMEOUT_MS, timeoutMs)
        // Optional — only the attendance flow passes this (it already has the
        // employee's enrolled embedding on hand to check against); enrollment
        // has no reference yet on a first-ever capture. Display-only on the
        // native side: JS still does its own authoritative cosineSimilarity/
        // matchesFace check on the returned embedding, unchanged.
        val reference = call.getArray("referenceEmbedding")
        if (reference != null) {
            intent.putExtra(FaceCaptureActivity.EXTRA_REFERENCE_EMBEDDING, reference.toString())
        }
        startActivityForResult(call, intent, "handleCaptureResult")
    }

    @ActivityCallback
    private fun handleCaptureResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val json = result.data?.getStringExtra(FaceCaptureActivity.EXTRA_EMBEDDING)
            if (json == null) {
                call.reject("No embedding returned", "EMBEDDING_FAILED")
                return
            }
            val parsed  = JSONArray(json)
            val jsArray = JSArray()
            for (i in 0 until parsed.length()) jsArray.put(parsed.getDouble(i))
            call.resolve(JSObject().apply { put("embedding", jsArray) })
        } else {
            val reason = result.data?.getStringExtra(FaceCaptureActivity.EXTRA_REASON) ?: "CANCELLED"
            call.reject(reasonMessage(reason), reason)
        }
    }

    private fun reasonMessage(reason: String): String = when (reason) {
        "PERMISSION_DENIED" -> "Camera permission required"
        "LIVENESS_TIMEOUT"  -> "Liveness check timed out"
        "EMBEDDING_FAILED"  -> "Face analysis failed"
        "MODEL_MISSING"     -> "Face recognition model not installed on this build"
        else                -> "Capture cancelled"
    }
}
