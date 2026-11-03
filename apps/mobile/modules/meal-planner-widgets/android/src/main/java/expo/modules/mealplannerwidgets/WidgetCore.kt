package expo.modules.mealplannerwidgets

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyStore
import java.security.SecureRandom
import java.time.Instant
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal class WidgetStale : Exception()
internal class WidgetReconnect : Exception()
internal class WidgetBackend : Exception()
internal fun JSONObject.text(key:String):String = opt(key) as? String ?: ""
internal fun expiry(config:JSONObject):Instant = try { Instant.parse(config.text("expires_at")) } catch (_:Exception) { Instant.MIN }
internal fun widgetDatabase(context:Context):String {
    val folder=File(context.noBackupFilesDir,"meal-planner-widgets-v1")
    check(folder.exists() || folder.mkdirs())
    return File(folder,"state.sqlite").absolutePath
}

/** Credential-protected, excluded-from-backup SQLite. Transactions also fence other processes. */
internal class WidgetStore(context:Context):SQLiteOpenHelper(context,widgetDatabase(context),null,1) {
    companion object { private val lock=Any() }
    init { setWriteAheadLoggingEnabled(true) }
    override fun onCreate(db:SQLiteDatabase) {
        db.execSQL("CREATE TABLE state (key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY,generation TEXT NOT NULL,item TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(generation,item))")
        db.execSQL("CREATE TABLE revocations (generation TEXT PRIMARY KEY,origin TEXT NOT NULL)")
    }
    override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int) { error("Widget store upgrade requires an explicit migration") }
    private fun <T> tx(body:(SQLiteDatabase)->T):T = synchronized(lock) {
        val db=writableDatabase;db.beginTransaction()
        try { val result=body(db);db.setTransactionSuccessful();result } finally { db.endTransaction() }
    }
    private fun get(db:SQLiteDatabase,key:String):String? = db.rawQuery("SELECT value FROM state WHERE key=?",arrayOf(key)).use { if(it.moveToFirst()) it.getString(0) else null }
    private fun set(db:SQLiteDatabase,key:String,value:String) {
        db.insertWithOnConflict("state",null,ContentValues().apply { put("key",key);put("value",value) },SQLiteDatabase.CONFLICT_REPLACE)
    }
    private fun json(value:String?):JSONObject? = value?.let { JSONObject(it) }
    private fun reset(db:SQLiteDatabase) {
        json(get(db,"config"))?.let { config ->
            db.insertWithOnConflict("revocations",null,ContentValues().apply { put("generation",config.text("generation"));put("origin",config.text("api_origin")) },SQLiteDatabase.CONFLICT_IGNORE)
        }
        db.delete("state","key<>'scope'",null);db.delete("outbox",null,null)
    }
    fun verifySession(key:String?) = tx { db ->
        val scope=get(db,"scope")
        if(key!=null && scope!=null && (scope==key || scope.startsWith(key+"|"))) return@tx
        if(key==null && scope==null) return@tx
        reset(db);db.delete("state","key='scope'",null)
        if(key!=null) set(db,"scope",key)
    }
    fun activate(scope:String?) = tx { db ->
        if (get(db,"scope")!=scope) {
            reset(db);db.delete("state","key='scope'",null)
            if(scope!=null) set(db,"scope",scope)
        }
    }
    fun context():JSONObject? = tx { json(get(it,"config")) }
    fun current(config:JSONObject):Boolean = tx { db ->
        json(get(db,"config"))?.text("generation")==config.text("generation") && get(db,"scope")==config.text("scope")
    }
    fun prepare(settings:JSONObject,force:Boolean,vault:WidgetVault):JSONObject = tx { db ->
        if(get(db,"scope")!=settings.text("scope")) throw WidgetStale()
        if(force) reset(db)
        val config=json(get(db,"config")) ?: JSONObject().apply {
            val generation=UUID.randomUUID().toString()
            vault.save(generation,WidgetVault.random())
            put("scope",settings.text("scope"));put("generation",generation);put("device_id",UUID.randomUUID().toString());put("registered",false)
        }
        for(key in listOf("api_origin","household_id","user_id","week_start","theme")) config.put(key,settings.get(key))
        set(db,"config",config.toString());config
    }
    fun update(config:JSONObject) = tx { db ->
        if(get(db,"scope")!=config.text("scope") || json(get(db,"config"))?.text("generation")!=config.text("generation")) throw WidgetStale()
        set(db,"config",config.toString())
    }
    fun fail(state:String,config:JSONObject?) = tx { db ->
        if(config!=null && json(get(db,"config"))?.text("generation")!=config.text("generation")) return@tx
        set(db,"error",state)
        if(state=="reconnect") { db.delete("outbox",null,null);db.delete("state","key='snapshot'",null) }
    }
    fun pending(config:JSONObject):List<JSONObject> = tx { db ->
        db.rawQuery("SELECT body FROM outbox WHERE generation=? ORDER BY rowid",arrayOf(config.text("generation"))).use { c -> buildList { while(c.moveToNext()) add(JSONObject(c.getString(0))) } }
    }
    fun enqueue(generation:String,item:String,version:Long) = tx { db ->
        val config=json(get(db,"config")) ?: throw WidgetStale()
        val snapshot=json(get(db,"snapshot")) ?: throw WidgetStale()
        if(version<=0 || config.text("generation")!=generation || !snapshot.optBoolean("can_check") || expiry(config)<=Instant.now()) throw WidgetStale()
        val count=db.rawQuery("SELECT count(*) FROM outbox",null).use { it.moveToFirst();it.getInt(0) }
        check(count<100)
        val operation=UUID.randomUUID().toString()
        val body=JSONObject().put("operation_id",operation).put("generation",generation).put("item_id",item).put("expected_version",version).put("is_checked",true)
        db.insertWithOnConflict("outbox",null,ContentValues().apply { put("id",operation);put("generation",generation);put("item",item);put("body",body.toString()) },SQLiteDatabase.CONFLICT_IGNORE)
    }
    fun commit(config:JSONObject,snapshot:JSONObject,terminal:List<String>,changed:Boolean) = tx { db ->
        if(get(db,"scope")!=config.text("scope") || json(get(db,"config"))?.text("generation")!=config.text("generation")) throw WidgetStale()
        for(id in terminal) db.delete("outbox","id=? AND generation=?",arrayOf(id,config.text("generation")))
        if(!snapshot.optBoolean("can_check")) db.delete("outbox",null,null)
        val prior=json(get(db,"snapshot"))?.optLong("snapshot_version") ?: 0
        if(snapshot.optLong("snapshot_version")>=prior) {
            set(db,"snapshot",snapshot.toString());set(db,"error",if(changed) "changed" else "")
        }
    }
    fun select(generation:String,mode:String?,day:Int?) = tx { db ->
        if(json(get(db,"config"))?.text("generation")!=generation) return@tx
        if(mode in listOf("shopping","plan")) set(db,"view",mode!!)
        if(day!=null && day in 0..6) set(db,"day",day.toString())
    }
    fun presentation():JSONObject = tx { db ->
        val config=json(get(db,"config")) ?: JSONObject()
        val error=get(db,"error") ?: ""
        val expired=expiry(config)<=Instant.now()
        val count=db.rawQuery("SELECT count(*) FROM outbox",null).use { it.moveToFirst();it.getInt(0) }
        JSONObject().put("available",true).put("enabled",config.length()>0).put("config",config)
            .put("needs_reconnect",error=="reconnect" || (config.optBoolean("registered") && expired))
            .put("pending_count",count).put("pending_items",JSONArray().apply {
                db.rawQuery("SELECT item FROM outbox",null).use { c -> while(c.moveToNext()) put(c.getString(0)) }
            }).put("state",error).put("view",get(db,"view") ?: "shopping").put("day",get(db,"day")?.toIntOrNull() ?: 0).apply {
                if(!expired && error!="reconnect") json(get(db,"snapshot"))?.let { put("snapshot",it) }
            }
    }
    fun revocations():List<Pair<String,String>> = tx { db -> db.rawQuery("SELECT generation,origin FROM revocations LIMIT 3",null).use { c -> buildList { while(c.moveToNext()) add(c.getString(0) to c.getString(1)) } } }
    fun didRevoke(generation:String) = tx { it.delete("revocations","generation=?",arrayOf(generation)) }
    fun disable(scope:String) = tx { if(get(it,"scope")!=scope) throw WidgetStale();reset(it) }
}

/** Only encrypted native files; the AES key is non-exportable in Android Keystore. */
internal class WidgetVault(private val context:Context) {
    companion object {
        fun random():String = android.util.Base64.encodeToString(ByteArray(48).also { SecureRandom().nextBytes(it) },android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING)
    }
    private val alias="MealPlannerWidgets.Storage.v1"
    private fun file(generation:String):AtomicFile {
        require(generation.matches(Regex("[0-9a-f-]{36}")))
        val dir=File(context.noBackupFilesDir,"meal-planner-widget-credentials");check(dir.exists() || dir.mkdirs())
        return AtomicFile(File(dir,generation))
    }
    private fun key():SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias,null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun save(generation:String,secret:String) {
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
        val bytes=byteArrayOf(cipher.iv.size.toByte())+cipher.iv+cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        val target=file(generation);val output=target.startWrite()
        try { output.write(bytes);target.finishWrite(output) } catch(error:Exception) { target.failWrite(output);throw error }
    }
    fun read(generation:String):String {
        val data=file(generation).readFully();val size=data[0].toInt();require(size==12 && data.size>size+1)
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,data.copyOfRange(1,size+1))) }
        return cipher.doFinal(data.copyOfRange(size+1,data.size)).toString(Charsets.UTF_8)
    }
    fun remove(generation:String) { file(generation).delete() }
}

internal object WidgetTransport {
    fun request(origin:String,path:String,method:String,auth:String,body:JSONObject?=null):JSONObject {
        val base=URI(origin)
        if(base.scheme!="https" || base.host.isNullOrBlank() || base.rawUserInfo!=null || base.rawQuery!=null || base.rawFragment!=null || base.path !in listOf("","/")) throw WidgetBackend()
        val connection=base.resolve(path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod=method;connection.instanceFollowRedirects=false
            connection.connectTimeout=4000;connection.readTimeout=4000
            connection.setRequestProperty("Authorization",auth);connection.setRequestProperty("Content-Type","application/json")
            if(body!=null) { connection.doOutput=true;connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
            val code=connection.responseCode
            if(code in listOf(401,403,409)) throw WidgetReconnect()
            if(code==404) throw WidgetBackend()
            check(code in 200..299)
            if(code==204) return JSONObject()
            val bytes=ByteArrayOutputStream()
            connection.inputStream.use { input -> val buffer=ByteArray(8192);while(true) { val n=input.read(buffer);if(n<0) break;check(bytes.size()+n<=1_000_000);bytes.write(buffer,0,n) } }
            return if(bytes.size()==0) JSONObject() else JSONObject(bytes.toString("UTF-8"))
        } finally { connection.disconnect() }
    }
}
internal object WidgetWorker {
    private val mutex=Mutex()
    suspend fun revokeOld(context:Context) = withContext(Dispatchers.IO) {
        WidgetStore(context).use { store ->
            val vault=WidgetVault(context)
            for((generation,origin) in store.revocations()) try {
                WidgetTransport.request(origin,"/v1/widget/disconnect","POST","Widget "+vault.read(generation))
                store.didRevoke(generation);vault.remove(generation)
            } catch (_:Exception) { /* Retain for later revocation; server credentials have bounded expiry. */ }
        }
    }
    suspend fun connect(context:Context,settings:JSONObject,token:String,force:Boolean) = withContext(Dispatchers.IO) { mutex.withLock {
        var config:JSONObject?=null
        try { WidgetStore(context).use { store ->
            try {
                val prepared=store.prepare(settings,force,WidgetVault(context));config=prepared
                if(!store.current(prepared)) throw WidgetStale()
                if(prepared.optLong("registered_at")<System.currentTimeMillis()-86400000L || prepared.optInt("week_start")!=prepared.optInt("registered_week_start",-1)) {
                    val generation=prepared.text("generation")
                    val body=JSONObject().put("secret",WidgetVault(context).read(generation)).put("generation",generation).put("week_start",prepared.optInt("week_start",1))
                    val result=WidgetTransport.request(prepared.text("api_origin"),"/v1/households/${prepared.text("household_id")}/widget-devices/${prepared.text("device_id")}","PUT","Bearer $token",body)
                    for(key in listOf("user_id","household_id","generation","device_id")) if(result.text(key)!=prepared.text(key)) throw WidgetReconnect()
                    prepared.put("registered",true).put("registered_at",System.currentTimeMillis()).put("registered_week_start",prepared.optInt("week_start")).put("expires_at",result.text("expires_at"))
                    store.update(prepared)
                }
            } catch (_:WidgetStale) { return@withLock }
              catch (_:WidgetReconnect) { store.fail("reconnect",config);return@withLock }
              catch (_:WidgetBackend) { store.fail("backend",config);return@withLock }
              catch (_:Exception) { store.fail("offline",config);return@withLock }
        }
        syncLocked(context)
        } finally { MealPlannerWidget.refreshAll(context);revokeOld(context) }
    } }
    suspend fun sync(context:Context) = withContext(Dispatchers.IO) { mutex.withLock { syncLocked(context) } }
    private suspend fun syncLocked(context:Context) {
        WidgetStore(context).use { store ->
            val config=store.context() ?: return
            if(!config.optBoolean("registered")) return
            try {
                if(store.presentation().optBoolean("needs_reconnect")) throw WidgetReconnect()
                val origin=config.text("api_origin");val generation=config.text("generation")
                val auth="Widget "+WidgetVault(context).read(generation)
                val terminal=mutableListOf<String>();var changed=false
                for(action in store.pending(config).take(3)) {
                    if(!store.current(config)) throw WidgetStale()
                    val result=WidgetTransport.request(origin,"/v1/widget/checkoffs","POST",auth,action)
                    check(result.text("operation_id")==action.text("operation_id") && result.text("generation")==generation && result.text("status") in listOf("confirmed","gone","conflict"))
                    terminal.add(action.text("operation_id"));changed=changed || result.text("status")!="confirmed"
                }
                if(!store.current(config)) throw WidgetStale()
                val snapshot=WidgetTransport.request(origin,"/v1/widget/summary","GET",auth)
                check(snapshot.optInt("schema_version")==1 && snapshot.optLong("snapshot_version")>0 && snapshot.optJSONObject("shopping")!=null && snapshot.optJSONObject("plan")?.optJSONArray("days")?.length()==7)
                for(key in listOf("generation","device_id","user_id","household_id")) check(snapshot.text(key)==config.text(key))
                // Keep stable operation IDs if the authoritative snapshot cannot be fetched.
                store.commit(config,snapshot,terminal,changed)
            } catch (_:WidgetStale) { }
              catch (_:WidgetReconnect) { store.fail("reconnect",config) }
              catch (_:WidgetBackend) { store.fail("backend",config) }
              catch (_:Exception) { store.fail("offline",config) }
        }
        MealPlannerWidget.refreshAll(context)
    }
}
