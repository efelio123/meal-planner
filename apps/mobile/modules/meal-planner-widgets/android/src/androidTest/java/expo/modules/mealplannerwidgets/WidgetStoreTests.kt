package expo.modules.mealplannerwidgets

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.time.Instant
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** Uses actual Android SQLite/Keystore in an isolated, disposable test directory. */
class WidgetStoreTests {
    private lateinit var context:Context
    private lateinit var directory:File
    private val session="fixture-session"
    private val scope=session+"|home"
    @Before fun setup() {
        val base=InstrumentationRegistry.getInstrumentation().targetContext
        directory=File(base.cacheDir,"widget-store-test-"+UUID.randomUUID()).apply { mkdirs() }
        context=object:ContextWrapper(base) { override fun getNoBackupFilesDir()=directory }
    }
    @After fun cleanup() {
        WidgetStore(context).use { store ->
            store.activate(null)
            for((generation,_) in store.revocations()) WidgetVault(context).remove(generation)
        }
        check(directory.canonicalPath.startsWith(context.cacheDir.canonicalPath+File.separator))
        directory.deleteRecursively()
    }
    private fun binding():Pair<JSONObject,JSONObject> {
        WidgetStore(context).use { store ->
            store.activate(scope)
            val settings=JSONObject().put("scope",scope).put("api_origin","https://fixture.invalid")
                .put("user_id","test-user").put("household_id","test-home").put("week_start",1).put("theme",JSONObject())
            val config=store.prepare(settings,false,WidgetVault(context)).put("registered",true).put("expires_at",Instant.now().plusSeconds(86400).toString())
            store.update(config)
            val snapshot=JSONObject().put("schema_version",1).put("snapshot_version",1).put("can_check",true)
                .put("shopping",JSONObject().put("unpurchased_count",1).put("items",JSONArray()))
                .put("plan",JSONObject().put("days",JSONArray()))
            store.commit(config,snapshot,emptyList(),false)
            return config to snapshot
        }
    }
    @Test fun pendingSurvivesReopenAndOutOfOrderSnapshots() {
        val(config,snapshot)=binding()
        WidgetStore(context).use { it.enqueue(config.text("generation"),"item",1) }
        WidgetStore(context).use { store ->
            store.enqueue(config.text("generation"),"item",1)
            assertEquals(1,store.pending(config).size)
            val newer=JSONObject(snapshot.toString()).put("snapshot_version",3)
            store.commit(config,newer,emptyList(),false)
            store.commit(config,snapshot,emptyList(),false)
            assertEquals(3,store.presentation().getJSONObject("snapshot").getInt("snapshot_version"))
            val id=store.pending(config).single().text("operation_id")
            store.commit(config,newer,listOf(id),false)
            assertEquals(0,store.pending(config).size)
        }
    }
    @Test fun sessionAndHouseholdChangesFenceLateWork() {
        val(config,snapshot)=binding()
        WidgetStore(context).use { store ->
            store.enqueue(config.text("generation"),"item",1);store.verifySession(session)
            assertEquals(1,store.pending(config).size)
            store.activate(session+"|another-home")
            assertThrows(WidgetStale::class.java) { store.commit(config,snapshot,emptyList(),false) }
            assertThrows(WidgetStale::class.java) { store.enqueue(config.text("generation"),"item",1) }
            assertNull(store.presentation().optJSONObject("snapshot"))
            assertTrue(store.revocations().any { it.first==config.text("generation") })
        }
    }
    @Test fun signOutClearsDataAndCredentialIsAbsentFromMetadata() {
        val(config,_)=binding()
        WidgetStore(context).use { store ->
            val secret=WidgetVault(context).read(config.text("generation"))
            assertFalse(store.presentation().toString().contains(secret))
            store.verifySession(null)
            assertNull(store.context());assertEquals(0,store.presentation().getInt("pending_count"))
            assertFalse(store.revocations().toString().contains(secret))
        }
    }
    @Test fun anUnconfirmedRegistrationCanRetryTheSameBinding() {
        val(config,_)=binding()
        WidgetStore(context).use { store ->
            config.put("registered",false);config.remove("expires_at");store.update(config);store.fail("offline",config)
            assertFalse(store.presentation().getBoolean("needs_reconnect"))
            val retry=store.prepare(config,false,WidgetVault(context))
            assertEquals(config.text("generation"),retry.text("generation"))
        }
    }
    @Test fun expiryAndLostCheckPermissionPreventTaps() {
        val(config,snapshot)=binding()
        WidgetStore(context).use { store ->
            store.commit(config,JSONObject(snapshot.toString()).put("can_check",false),emptyList(),false)
            assertThrows(WidgetStale::class.java) { store.enqueue(config.text("generation"),"item",1) }
            config.put("expires_at",Instant.now().minusSeconds(60).toString());store.update(config)
            assertNull(store.presentation().optJSONObject("snapshot"))
            assertTrue(store.presentation().getBoolean("needs_reconnect"))
        }
    }
}
