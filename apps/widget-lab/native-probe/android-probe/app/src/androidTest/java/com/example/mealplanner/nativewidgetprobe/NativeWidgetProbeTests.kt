package com.example.mealplanner.nativewidgetprobe

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeWidgetProbeTests {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun snapshotCannotErasePending() {
        ProbeStore(context).use { first ->
            first.clear(); val action = first.enqueue()
            ProbeStore(context).use { it.publish("summary", "refreshed") }
            assertEquals(listOf(action), first.actions())
        }
    }
    @Test fun secretRoundTripsThroughKeystoreEncryption() {
        val secret = UUID.randomUUID().toString()+UUID.randomUUID().toString()
        ProbeVault(context).save(secret)
        assertEquals(secret,ProbeVault(context).read())
        val bytes = java.io.File(context.noBackupFilesDir,"native-widget-probe.credential").readBytes()
        assertFalse(bytes.toString(Charsets.UTF_8).contains(secret))
        ProbeVault(context).clear()
        assertThrows(Exception::class.java) { ProbeVault(context).read() }
    }
    @Test fun separateNativeProcessAcknowledgesOnlyAuthenticatedSuccess() {
        ProbeStore(context).use { it.clear() }
        val secret = UUID.randomUUID().toString()+UUID.randomUUID().toString()
        ProbeVault(context).save(secret); ProbeWorker.seed(secret)
        val result = trigger()
        assertTrue(result.startsWith("acknowledged:"))
        assertNotEquals(android.os.Process.myPid().toString(),result.substringAfter(':'))
        ProbeStore(context).use {
            assertTrue(it.actions().isEmpty())
            assertEquals(1,it.state().confirmed)
            it.acknowledge("already-absent-operation")
            assertEquals(1,it.state().confirmed)
        }
        ProbeVault(context).save(UUID.randomUUID().toString())
        assertTrue(trigger().startsWith("pending:"))
        ProbeStore(context).use {
            assertEquals(1,it.actions().size)
            assertEquals(1,it.state().confirmed)
        }
    }
    private fun trigger(): String {
        ProbeStore(context).use { it.publish("result", "waiting") }
        context.sendBroadcast(Intent().setClassName(context.packageName,context.packageName+".ProbeGateReceiver"))
        repeat(100) {
            val result = ProbeStore(context).use { it.value("result") }
            if(result!=null && result!="waiting") return result
            Thread.sleep(100)
        }
        error("Separate native handler did not finish")
    }
}
