package `in`.iotsoft.edgefolio.network

import `in`.iotsoft.edgefolio.BuildConfig
import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CompanyIdResolver @Inject constructor(private val prefs: EncryptedPrefs) {

    private val probeClient = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    // Returns the base URL to use for this company ID (LAN preferred, FRP fallback)
    suspend fun resolve(companyId: String): String = withContext(Dispatchers.IO) {
        // 1. Try last-known LAN IP first
        val lanIp = prefs.lastKnownLanIp
        if (lanIp != null) {
            val url = "http://$lanIp:7001"
            if (isReachable("$url/health")) {
                Timber.d("CompanyIdResolver: LAN hit at $lanIp")
                return@withContext url
            }
        }

        // 2. Try FRP subdomain
        val frpUrl = "https://$companyId${BuildConfig.FRP_DOMAIN_SUFFIX}"
        if (isReachable("$frpUrl/health")) {
            Timber.d("CompanyIdResolver: FRP hit at $frpUrl")
            return@withContext frpUrl
        }

        // 3. Return FRP URL anyway — the API call will fail with a proper error
        Timber.w("CompanyIdResolver: neither LAN nor FRP reachable, returning FRP URL")
        frpUrl
    }

    // After a successful LAN connection, cache the IP so next probe is faster
    fun cacheLanIp(ip: String) { prefs.lastKnownLanIp = ip }

    // Quick reachability probe — just checks /health
    suspend fun isEdgeReachable(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        isReachable("$baseUrl/health")
    }

    private fun isReachable(url: String): Boolean {
        return try {
            val request = Request.Builder().url(url).get().build()
            val response = probeClient.newCall(request).execute()
            val ok = response.isSuccessful
            response.close()
            ok
        } catch (e: Exception) {
            false
        }
    }
}
