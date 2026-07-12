package `in`.iotsoft.edgefolio.network

import `in`.iotsoft.edgefolio.data.prefs.EncryptedPrefs
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApiClient @Inject constructor(private val prefs: EncryptedPrefs) {

    // Retrofit is rebuilt when base URL changes (company switch / LAN→FRP fallback)
    @Volatile private var currentBaseUrl: String = ""
    @Volatile private var service: ApiService? = null

    fun get(baseUrl: String): ApiService {
        val normalised = if (baseUrl.endsWith('/')) baseUrl else "$baseUrl/"
        val full = "${normalised}api/v1/"
        if (full == currentBaseUrl && service != null) return service!!

        synchronized(this) {
            if (full == currentBaseUrl && service != null) return service!!
            currentBaseUrl = full
            service = buildRetrofit(full).create(ApiService::class.java)
            Timber.d("ApiClient rebuilt for base URL: $full")
            return service!!
        }
    }

    // Convenience: use the already-resolved URL stored in prefs
    fun get(): ApiService {
        val url = prefs.resolvedBaseUrl ?: error("Base URL not resolved yet. Call CompanyIdResolver first.")
        return get(url)
    }

    private fun buildRetrofit(baseUrl: String): Retrofit {
        val logging = HttpLoggingInterceptor { Timber.tag("OkHttp").d(it) }
        logging.level = HttpLoggingInterceptor.Level.BASIC

        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val token = prefs.authToken
                val req = if (token != null)
                    chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
                else chain.request()
                chain.proceed(req)
            }
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}
