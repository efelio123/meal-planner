package com.example.mealplanner.nativewidgetprobe

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.Button as NativeButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.Button
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/** Disposable setup screen; no consumer authentication, data or navigation. */
class ProbeActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var setup: NativeButton
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        status = TextView(this).apply { textSize = 18f }
        setup = NativeButton(this).apply {
            text = "Run native self-check"
            setOnClickListener {
                isEnabled = false
                status.text = "Checking fictional native storage and networking..."
                val app = applicationContext
                Thread {
                    val result = try {
                        ProbeStore(app).use { it.clear() }
                        val secret = UUID.randomUUID().toString()+UUID.randomUUID().toString()
                        ProbeVault(app).save(secret)
                        ProbeWorker.seed(secret)
                        ProbeWorker.tap(app)
                        runBlocking { ProbeWidget.refreshAll(app) }
                        "Self-check passed. Add the probe widget, then leave this app."
                    } catch (_: Exception) { "Self-check failed; verify the disposable fixture is running." }
                    runOnUiThread { if (!isDestroyed) { isEnabled = true; showStatus(result) } }
                }.start()
            }
        }
        val pin = NativeButton(this).apply {
            text = "Add test widget"
            setOnClickListener {
                val manager = AppWidgetManager.getInstance(this@ProbeActivity)
                if (manager.isRequestPinAppWidgetSupported) {
                    manager.requestPinAppWidget(ComponentName(this@ProbeActivity,ProbeWidgetReceiver::class.java),null,null)
                } else { showStatus("Use the launcher's widget picker to add Native Widget Probe.") }
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32,64,32,32)
            addView(TextView(this@ProbeActivity).apply { text="Native Widget Probe"; textSize=24f })
            addView(status); addView(setup); addView(pin)
        })
    }
    override fun onResume() { super.onResume(); showStatus("Fictional-data probe only.") }
    private fun showStatus(message: String) {
        val state = ProbeStore(this).use { it.state() }
        status.text = "$message\n${state.confirmed} confirmed · ${state.pending} pending"
    }
}

class ProbeTap : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withContext(Dispatchers.IO) { ProbeStore(context).use { it.enqueue() } }
        ProbeWidget.refreshAll(context)
        try { withContext(Dispatchers.IO) { ProbeWorker.synchronize(context) } }
        catch (_: Exception) { /* Persisted Pending remains visible, never confirmed. */ }
        ProbeWidget.refreshAll(context)
    }
}
class ProbeRetry : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        try { withContext(Dispatchers.IO) { ProbeWorker.synchronize(context) } }
        catch (_: Exception) { /* Retry does not enqueue or discard an operation. */ }
        ProbeWidget.refreshAll(context)
    }
}
class ProbeWidget : GlanceAppWidget() {
    companion object {
        private val confirmedKey = intPreferencesKey("confirmed")
        private val pendingKey = intPreferencesKey("pending")
        suspend fun refreshAll(context: Context) {
            for (id in GlanceAppWidgetManager(context).getGlanceIds(ProbeWidget::class.java)) {
                publish(context,id)
                ProbeWidget().update(context,id)
            }
        }
        private suspend fun publish(context: Context, id: GlanceId) {
            val state = withContext(Dispatchers.IO) { ProbeStore(context).use { it.state() } }
            // Only the count projection is in Glance state. Credentials remain in Keystore.
            updateAppWidgetState(context,id) { prefs ->
                prefs[confirmedKey] = state.confirmed
                prefs[pendingKey] = state.pending
            }
        }
    }
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(140.dp,140.dp),DpSize(260.dp,180.dp),DpSize(260.dp,260.dp)))
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        publish(context,id)
        provideContent {
            val state = currentState<Preferences>()
            val confirmed = state[confirmedKey] ?: 0
            val pending = state[pendingKey] ?: 0
            val size = LocalSize.current
            GlanceTheme {
                Column(GlanceModifier.fillMaxSize().background(Color.White).padding(12.dp)) {
                    if (size.width >= 200.dp) {
                        Text("Native widget probe", style=TextStyle(color=ColorProvider(Color.Black)))
                        Text("${size.width.value.toInt()} × ${size.height.value.toInt()}dp",style=TextStyle(color=ColorProvider(Color.DarkGray)))
                    }
                    Text("$confirmed confirmed",style=TextStyle(color=ColorProvider(Color.Black)))
                    Text("$pending pending",style=TextStyle(color=ColorProvider(Color.Black)))
                    if (pending>0) Button("Retry pending",actionRunCallback<ProbeRetry>())
                    else Button("Test native tap",actionRunCallback<ProbeTap>())
                }
            }
        }
    }
}
class ProbeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = ProbeWidget()
}
