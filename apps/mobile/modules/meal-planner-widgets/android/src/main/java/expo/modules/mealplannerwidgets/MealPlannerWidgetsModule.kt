package expo.modules.mealplannerwidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

class MealPlannerWidgetsModule:Module() {
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private fun context()=appContext.reactContext?.applicationContext ?: error("Widgets are unavailable")
    override fun definition()=ModuleDefinition {
        Name("MealPlannerWidgets")
        OnDestroy { scope.cancel() }
        Function("verifySession") { key:String? ->
            val context=context()
            WidgetStore(context).use { it.verifySession(key) }
            scope.launch { MealPlannerWidget.refreshAll(context);WidgetWorker.revokeOld(context) }
        }
        Function("activateScope") { owner:String? ->
            val context=context()
            WidgetStore(context).use { it.activate(owner) }
            scope.launch { MealPlannerWidget.refreshAll(context);WidgetWorker.revokeOld(context) }
        }
        Function("status") { WidgetStore(context()).use { it.presentation().toString() } }
        AsyncFunction("connect") Coroutine { settings:String,token:String,force:Boolean ->
            val context=context()
            WidgetWorker.connect(context,JSONObject(settings),token,force)
            WidgetRefresh.schedule(context)
            WidgetStore(context).use { it.presentation().toString() }
        }
        AsyncFunction("refresh") Coroutine { ->
            val context=context();WidgetWorker.sync(context)
            WidgetStore(context).use { it.presentation().toString() }
        }
        AsyncFunction("disable") Coroutine { owner:String ->
            val context=context()
            WidgetStore(context).use { it.disable(owner) }
            WidgetWorker.revokeOld(context);MealPlannerWidget.refreshAll(context);WidgetRefresh.cancel(context)
            WidgetStore(context).use { it.presentation().toString() }
        }
        Function("requestPin") {
            val context=context();val manager=AppWidgetManager.getInstance(context)
            manager.isRequestPinAppWidgetSupported && manager.requestPinAppWidget(ComponentName(context,MealPlannerWidgetReceiver::class.java),null,null)
        }
    }
}
