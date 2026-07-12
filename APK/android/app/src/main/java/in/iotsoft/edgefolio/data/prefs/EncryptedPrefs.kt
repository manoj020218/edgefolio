package `in`.iotsoft.edgefolio.data.prefs

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EncryptedPrefs @Inject constructor(@ApplicationContext context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "edgefolio_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    // ── Auth ──────────────────────────────────────────────────────────────────
    var authToken: String?
        get()      = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var empId: String?
        get()      = prefs.getString(KEY_EMP_ID, null)
        set(value) = prefs.edit().putString(KEY_EMP_ID, value).apply()

    var empCode: String?
        get()      = prefs.getString(KEY_EMP_CODE, null)
        set(value) = prefs.edit().putString(KEY_EMP_CODE, value).apply()

    var empName: String?
        get()      = prefs.getString(KEY_EMP_NAME, null)
        set(value) = prefs.edit().putString(KEY_EMP_NAME, value).apply()

    var role: String?
        get()      = prefs.getString(KEY_ROLE, null)
        set(value) = prefs.edit().putString(KEY_ROLE, value).apply()

    var passwordMustChange: Boolean
        get()      = prefs.getBoolean(KEY_PWD_CHANGE, false)
        set(value) = prefs.edit().putBoolean(KEY_PWD_CHANGE, value).apply()

    // ── Company / Network ──────────────────────────────────────────────────────
    var companyId: String?
        get()      = prefs.getString(KEY_COMPANY_ID, null)
        set(value) = prefs.edit().putString(KEY_COMPANY_ID, value).apply()

    var resolvedBaseUrl: String?
        get()      = prefs.getString(KEY_BASE_URL, null)
        set(value) = prefs.edit().putString(KEY_BASE_URL, value).apply()

    var lastKnownLanIp: String?
        get()      = prefs.getString(KEY_LAN_IP, null)
        set(value) = prefs.edit().putString(KEY_LAN_IP, value).apply()

    var selectedOfficeId: String?
        get()      = prefs.getString(KEY_OFFICE_ID, null)
        set(value) = prefs.edit().putString(KEY_OFFICE_ID, value).apply()

    var rememberedEmpCode: String?
        get()      = prefs.getString(KEY_REMEMBERED_EMP, null)
        set(value) = prefs.edit().putString(KEY_REMEMBERED_EMP, value).apply()

    var rememberedCompanyId: String?
        get()      = prefs.getString(KEY_REMEMBERED_COMPANY, null)
        set(value) = prefs.edit().putString(KEY_REMEMBERED_COMPANY, value).apply()

    fun clearAuth() {
        prefs.edit()
            .remove(KEY_TOKEN).remove(KEY_EMP_ID).remove(KEY_EMP_CODE)
            .remove(KEY_EMP_NAME).remove(KEY_ROLE).remove(KEY_PWD_CHANGE)
            .apply()
    }

    companion object {
        private const val KEY_TOKEN            = "auth_token"
        private const val KEY_EMP_ID           = "emp_id"
        private const val KEY_EMP_CODE         = "emp_code"
        private const val KEY_EMP_NAME         = "emp_name"
        private const val KEY_ROLE             = "role"
        private const val KEY_PWD_CHANGE       = "pwd_must_change"
        private const val KEY_COMPANY_ID       = "company_id"
        private const val KEY_BASE_URL         = "base_url"
        private const val KEY_LAN_IP           = "lan_ip"
        private const val KEY_OFFICE_ID        = "office_id"
        private const val KEY_REMEMBERED_EMP   = "remembered_emp"
        private const val KEY_REMEMBERED_COMPANY = "remembered_company"
    }
}
