package com.example.mealplanner.nativewidgetprobe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Debug-only, same-UID receiver exercises the same worker in the separate widget process. */
class ProbeGateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            try {
                ProbeWorker.tap(context)
                ProbeStore(context).use { it.publish("result", "acknowledged:${android.os.Process.myPid()}") }
            } catch (_: Exception) {
                ProbeStore(context).use { it.publish("result", "pending:${android.os.Process.myPid()}") }
            } finally { pending.finish() }
        }.start()
    }
}
