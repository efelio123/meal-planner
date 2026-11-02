package com.example.mealplanner.nativewidgetprobe

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.widget.TextView
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.Button

class ProbeActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setContentView(TextView(this).apply { text = "Disposable native widget gate. Fictional data only." })
    }
}
class ProbeTap : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        try { ProbeWorker.tap(context) } catch (_: Exception) { /* Pending persists on failure. */ }
        ProbeWidget().update(context, glanceId)
    }
}
class ProbeWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(140.dp,80.dp),DpSize(260.dp,120.dp),DpSize(260.dp,260.dp)))
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val count = ProbeStore(context).use { it.actions().size }
        provideContent {
            val size = LocalSize.current
            Column(GlanceModifier.padding(12.dp)) {
                Text("Native widget probe")
                Text("$count pending · ${size.width.value.toInt()}dp")
                Button("Test native tap", actionRunCallback<ProbeTap>())
            }
        }
    }
}
class ProbeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = ProbeWidget()
}
