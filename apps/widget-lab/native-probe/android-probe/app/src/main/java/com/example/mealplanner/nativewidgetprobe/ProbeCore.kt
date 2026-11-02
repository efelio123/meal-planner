package com.example.mealplanner.nativewidgetprobe

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

data class ProbeState(val pending: Int, val confirmed: Int)

data class ProbeAction(val id: String, val itemID: String, val desired: Boolean, val version: Int)

class ProbeStore(context: Context) : SQLiteOpenHelper(context, "native-widget-probe.sqlite", null, 1) {
    init { setWriteAheadLoggingEnabled(true) }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE snapshot (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, item TEXT NOT NULL, desired INTEGER NOT NULL, version INTEGER NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { error("No destructive upgrade path in the disposable probe") }
    private fun <T> transaction(body: (SQLiteDatabase) -> T): T {
        val db = writableDatabase
        db.beginTransaction()
        try { val result = body(db); db.setTransactionSuccessful(); return result } finally { db.endTransaction() }
    }
    fun clear() = transaction { db -> db.delete("snapshot", null, null); db.delete("outbox", null, null) }
    fun publish(key: String, value: String) = transaction { db ->
        db.insertWithOnConflict("snapshot", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun value(key: String): String? = readableDatabase.rawQuery("SELECT value FROM snapshot WHERE key=?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }
    fun enqueue(): ProbeAction {
        val action = ProbeAction(UUID.randomUUID().toString(), "fictional-item", true, 1)
        transaction { db -> db.insertOrThrow("outbox", null, ContentValues().apply { put("id", action.id); put("item", action.itemID); put("desired", 1); put("version", 1) }) }
        return action
    }
    fun actions(): List<ProbeAction> = readableDatabase.rawQuery("SELECT id,item,desired,version FROM outbox ORDER BY rowid", null).use { c ->
        buildList { while(c.moveToNext()) add(ProbeAction(c.getString(0),c.getString(1),c.getInt(2)!=0,c.getInt(3))) }
    }
    fun state(): ProbeState = readableDatabase.rawQuery(
        "SELECT (SELECT count(*) FROM outbox),coalesce((SELECT cast(value AS INTEGER) FROM snapshot WHERE key='confirmed'),0)", null
    ).use { c -> check(c.moveToFirst()); ProbeState(c.getInt(0),c.getInt(1)) }
    fun acknowledge(id: String) = transaction { db ->
        if (db.delete("outbox", "id=?", arrayOf(id)) == 1) {
            db.execSQL("INSERT OR IGNORE INTO snapshot(key,value) VALUES ('confirmed','0')")
            db.execSQL("UPDATE snapshot SET value=cast(value AS INTEGER)+1 WHERE key='confirmed'")
        }
    }
}

/** Private encrypted file; the AES key never leaves Android Keystore. No plaintext fallback. */
class ProbeVault(private val context: Context) {
    private val alias = "native-widget-probe-disposable"
    private val file get() = AtomicFile(File(context.noBackupFilesDir, "native-widget-probe.credential"))
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun save(secret: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val data = byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        val output = file.startWrite()
        try { output.write(data); file.finishWrite(output) } catch (e: Exception) { file.failWrite(output); throw e }
    }
    fun read(): String {
        val data = file.readFully(); val length = data[0].toInt()
        require(length == 12 && data.size > length + 1)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(1, length+1))) }
        return cipher.doFinal(data.copyOfRange(length+1, data.size)).toString(Charsets.UTF_8)
    }
    fun clear() { file.delete() }
}

/** Emulator-only fictional fixture; never contacts the family API. */
object ProbeWorker {
    private const val origin = "http://10.0.2.2:43817"
    private fun post(path: String, body: JSONObject, secret: String? = null): Pair<Int,String> {
        val connection = URL(origin+path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"; connection.doOutput = true
            connection.instanceFollowRedirects = false; connection.connectTimeout = 4000; connection.readTimeout = 4000
            connection.setRequestProperty("Content-Type", "application/json")
            if (secret != null) connection.setRequestProperty("Authorization", "Widget $secret")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            return code to (if(code==200) connection.inputStream.bufferedReader().use { it.readText() } else "")
        } finally { connection.disconnect() }
    }
    fun seed(secret: String) { check(post("/seed", JSONObject().put("secret", secret)).first==200) }
    fun synchronize(context: Context) {
        ProbeStore(context).use { store -> for (action in store.actions()) {
            val body = JSONObject().put("id",action.id).put("itemID",action.itemID).put("desired",action.desired).put("version",action.version)
            val (code,response) = post("/check",body,ProbeVault(context).read())
            check(code==200 && JSONObject(response).getString("id")==action.id) { "Unconfirmed operation stays pending" }
            store.acknowledge(action.id)
        } }
    }
    fun tap(context: Context) {
        ProbeStore(context).use { it.enqueue() }
        synchronize(context)
    }
}
