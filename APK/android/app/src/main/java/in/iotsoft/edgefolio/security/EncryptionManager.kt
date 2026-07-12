package `in`.iotsoft.edgefolio.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private const val KEY_ALIAS    = "edgefolio_master_key"
private const val KEYSTORE     = "AndroidKeyStore"
private const val ALGORITHM    = KeyProperties.KEY_ALGORITHM_AES
private const val BLOCK_MODE   = KeyProperties.BLOCK_MODE_GCM
private const val PADDING      = KeyProperties.ENCRYPTION_PADDING_NONE
private const val TRANSFORMATION = "$ALGORITHM/$BLOCK_MODE/$PADDING"
private const val GCM_IV_SIZE  = 12
private const val GCM_TAG_SIZE = 128

@Singleton
class EncryptionManager @Inject constructor() {

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        keyStore.getKey(KEY_ALIAS, null)?.let { return it as SecretKey }

        val keyGen = KeyGenerator.getInstance(ALGORITHM, KEYSTORE)
        keyGen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(BLOCK_MODE)
                .setEncryptionPaddings(PADDING)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return keyGen.generateKey()
    }

    fun encrypt(data: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv         = cipher.iv
        val encrypted  = cipher.doFinal(data)
        // Prepend IV so we can retrieve it on decrypt: [IV(12)] + [ciphertext]
        return iv + encrypted
    }

    fun decrypt(data: ByteArray): ByteArray {
        val iv         = data.copyOfRange(0, GCM_IV_SIZE)
        val ciphertext = data.copyOfRange(GCM_IV_SIZE, data.size)
        val cipher     = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_SIZE, iv))
        return cipher.doFinal(ciphertext)
    }

    fun encryptString(value: String): ByteArray = encrypt(value.toByteArray(Charsets.UTF_8))
    fun decryptString(data: ByteArray): String   = decrypt(data).toString(Charsets.UTF_8)

    // Derive a 32-byte key for SQLCipher from the Keystore key
    fun deriveDatabaseKey(): ByteArray {
        val marker = "edgefolio_db_key".toByteArray()
        return encrypt(marker).copyOf(32)
    }
}
