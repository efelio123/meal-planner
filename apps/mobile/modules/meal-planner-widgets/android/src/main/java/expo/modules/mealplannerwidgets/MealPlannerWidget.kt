package expo.modules.mealplannerwidgets

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.glance.Button
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

internal val generationKey=ActionParameters.Key<String>("generation")
internal val itemKey=ActionParameters.Key<String>("item")
internal val versionKey=ActionParameters.Key<Long>("version")
internal val modeKey=ActionParameters.Key<String>("view")
internal val dayKey=ActionParameters.Key<Int>("day")
internal fun JSONArray?.objects():List<JSONObject> = if(this==null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

class WidgetCheckAction:ActionCallback {
    override suspend fun onAction(context:Context,glanceId:GlanceId,parameters:ActionParameters) {
        val generation=parameters[generationKey] ?: return
        val item=parameters[itemKey] ?: return
        val version=parameters[versionKey] ?: return
        try { withContext(Dispatchers.IO) { WidgetStore(context).use { it.enqueue(generation,item,version) } } }
        catch (_:Exception) { MealPlannerWidget.refreshAll(context);return }
        MealPlannerWidget.refreshAll(context)
        WidgetWorker.sync(context)
    }
}
class WidgetRetryAction:ActionCallback {
    override suspend fun onAction(context:Context,glanceId:GlanceId,parameters:ActionParameters) { WidgetWorker.sync(context) }
}
class WidgetViewAction:ActionCallback {
    override suspend fun onAction(context:Context,glanceId:GlanceId,parameters:ActionParameters) {
        val generation=parameters[generationKey] ?: return
        withContext(Dispatchers.IO) { WidgetStore(context).use { it.select(generation,parameters[modeKey],parameters[dayKey]) } }
        MealPlannerWidget.refreshAll(context)
    }
}
class MealPlannerWidget:GlanceAppWidget() {
    companion object {
        private val revisionKey=intPreferencesKey("revision")
        suspend fun refreshAll(context:Context) {
            for(id in GlanceAppWidgetManager(context).getGlanceIds(MealPlannerWidget::class.java)) {
                // Preferences contain only an invalidation signal, never credentials or summary data.
                updateAppWidgetState(context,id) { it[revisionKey]=(it[revisionKey] ?: 0)+1 }
                MealPlannerWidget().update(context,id)
            }
        }
    }
    override val sizeMode=SizeMode.Responsive(setOf(DpSize(110.dp,80.dp),DpSize(260.dp,150.dp),DpSize(260.dp,310.dp)))
    override suspend fun provideGlance(context:Context,id:GlanceId) {
        provideContent {
            val revision=currentState<Preferences>()[revisionKey] ?: 0
            val state=remember(revision) { runCatching { WidgetStore(context).use { it.presentation() } }.getOrDefault(JSONObject()) }
            val config=state.optJSONObject("config") ?: JSONObject()
            val snapshot=state.optJSONObject("snapshot")
            val dark=(context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES
            val palette=config.optJSONObject("theme")?.optJSONObject(if(dark) "dark" else "light")
            fun color(key:String,fallback:Color):ColorProvider = ColorProvider(runCatching { Color(android.graphics.Color.parseColor(palette?.text(key))) }.getOrDefault(fallback))
            val text=color("text",if(dark) Color.White else Color.Black)
            val secondary=color("textSecondary",if(dark) Color.LightGray else Color.DarkGray)
            val accent=color("primary",if(dark) Color.LightGray else Color.DarkGray)
            val surface=color("surface",if(dark) Color.DarkGray else Color.White)
            val small=LocalSize.current.width<200.dp
            val large=LocalSize.current.height>=300.dp
            val generation=config.text("generation")
            val day=state.optInt("day",0).coerceIn(0,6)
            val shopping=snapshot?.optJSONObject("shopping")
            val mode=state.optString("view","shopping")
            val pending=state.optInt("pending_count")
            fun open(plan:Boolean):Action {
                val scheme=context.packageManager.getApplicationInfo(context.packageName,android.content.pm.PackageManager.GET_META_DATA).metaData?.getString("MealPlannerWidgetScheme") ?: "mealplanner"
                return actionStartActivity(Intent(Intent.ACTION_VIEW,Uri.parse(scheme+if(plan) "://plan" else "://shopping")).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            fun view(mode:String,day:Int)=actionRunCallback<WidgetViewAction>(actionParametersOf(generationKey to generation,modeKey to mode,dayKey to day))
            Column(GlanceModifier.fillMaxSize().background(surface).padding(12.dp)) {
                if(small) {
                    if(LocalSize.current.height>=110.dp) Text("Shopping",style=TextStyle(color=text,fontSize=13.sp,fontWeight=FontWeight.Bold),maxLines=1)
                    Text(if(snapshot==null) "—" else shopping?.optInt("unpurchased_count").toString(),modifier=GlanceModifier.clickable(open(false)),style=TextStyle(color=text,fontSize=26.sp,fontWeight=FontWeight.Bold),maxLines=1)
                    Text(if(snapshot==null) "Open app" else if(pending>0) "$pending pending" else "items to buy",modifier=GlanceModifier.clickable(open(false)),style=TextStyle(color=secondary,fontSize=11.sp),maxLines=1)
                } else if(snapshot==null) {
                    Text(if(state.optBoolean("needs_reconnect")) "Reconnect widgets" else "Set up your widgets",style=TextStyle(color=text,fontWeight=FontWeight.Bold))
                    Button("Open Meal Planner",open(false))
                } else {
                    Row(GlanceModifier.fillMaxWidth()) {
                        Text(snapshot.text("household_name"),modifier=GlanceModifier.defaultWeight(),style=TextStyle(color=text,fontSize=12.sp,fontWeight=FontWeight.Bold),maxLines=1)
                        Text("Shopping",modifier=GlanceModifier.clickable(view("shopping",day)).padding(horizontal=5.dp),style=TextStyle(color=accent,fontSize=12.sp,fontWeight=if(mode=="shopping") FontWeight.Bold else FontWeight.Normal))
                        Text("Plan",modifier=GlanceModifier.clickable(view("plan",day)).padding(horizontal=5.dp),style=TextStyle(color=accent,fontSize=12.sp,fontWeight=if(mode=="plan") FontWeight.Bold else FontWeight.Normal))
                    }
                    if(mode=="plan") {
                        val days=snapshot.optJSONObject("plan")?.optJSONArray("days").objects()
                        fun dateLabel(value:JSONObject,pattern:String):String = runCatching { LocalDate.parse(value.text("date")).format(DateTimeFormatter.ofPattern(pattern)) }.getOrDefault(value.text("date"))
                        if(days.size==7) {
                            if(large) for((index,value) in days.withIndex()) {
                                Row(GlanceModifier.fillMaxWidth().clickable(view("plan",index)).padding(vertical=2.dp)) {
                                    Text(dateLabel(value,"EEE d"),modifier=GlanceModifier.defaultWeight(),style=TextStyle(color=if(index==day) accent else text,fontSize=11.sp,fontWeight=if(index==day) FontWeight.Bold else FontWeight.Normal))
                                    Text(value.optJSONArray("meals").objects().joinToString(" · ") { it.text("title") }.ifEmpty { "No meals" },modifier=GlanceModifier.defaultWeight(),style=TextStyle(color=secondary,fontSize=11.sp),maxLines=1)
                                }
                            } else Row(GlanceModifier.fillMaxWidth().padding(vertical=4.dp)) {
                                for((index,value) in days.withIndex()) Text(dateLabel(value,"EEEEE d"),modifier=GlanceModifier.defaultWeight().clickable(view("plan",index)),style=TextStyle(color=accent,fontSize=10.sp,fontWeight=if(index==day) FontWeight.Bold else FontWeight.Normal),maxLines=1)
                            }
                            val selected=days[day]
                            Text(dateLabel(selected,"EEE, MMM d"),style=TextStyle(color=text,fontSize=12.sp,fontWeight=FontWeight.Bold))
                            val meals=selected.optJSONArray("meals").objects()
                            for(slot in listOf("breakfast","lunch","dinner")) {
                                Text(slot.replaceFirstChar { it.uppercase() }+": "+meals.filter { it.text("slot")==slot }.joinToString(", ") { it.text("title") }.ifEmpty { "—" },style=TextStyle(color=text,fontSize=11.sp),maxLines=1)
                            }
                            Text("Open Plan",modifier=GlanceModifier.clickable(open(true)),style=TextStyle(color=accent,fontSize=11.sp))
                        }
                    } else {
                        val rows=shopping?.optJSONArray("items").objects()
                        val limit=if(large) 7 else 3
                        val waiting=state.optJSONArray("pending_items") ?: JSONArray()
                        val pendingItems=(0 until waiting.length()).map { waiting.optString(it) }.toSet()
                        if(rows.isEmpty()) Text("Nothing to buy",style=TextStyle(color=text,fontSize=16.sp))
                        for(row in rows.take(limit)) {
                            val isPending=row.text("id") in pendingItems
                            Row(GlanceModifier.fillMaxWidth().padding(vertical=2.dp)) {
                                if(!isPending && snapshot.optBoolean("can_check")) {
                                    Text("○",modifier=GlanceModifier.padding(end=8.dp).semantics { contentDescription="Check ${row.text("name")}" }.clickable(actionRunCallback<WidgetCheckAction>(actionParametersOf(generationKey to generation,itemKey to row.text("id"),versionKey to row.optLong("check_version")))),style=TextStyle(color=accent,fontSize=20.sp))
                                }
                                Column(GlanceModifier.defaultWeight()) {
                                    Text(row.text("name"),style=TextStyle(color=text,fontSize=13.sp),maxLines=1)
                                    if(large) Text(listOf(row.text("amount"),row.text("unit_label"),row.text("store_name")).filter { it.isNotEmpty() }.joinToString(" · "),style=TextStyle(color=secondary,fontSize=10.sp),maxLines=1)
                                }
                                if(isPending) Text("Pending",style=TextStyle(color=secondary,fontSize=10.sp))
                            }
                        }
                        Row(GlanceModifier.fillMaxWidth()) {
                            val count=shopping?.optInt("unpurchased_count") ?: 0
                            Text(if(count>limit) "+${count-limit} more · Open list" else "Open list",modifier=GlanceModifier.defaultWeight().clickable(open(false)),style=TextStyle(color=accent,fontSize=11.sp))
                            if(pending>0) Text("Retry $pending pending",modifier=GlanceModifier.clickable(actionRunCallback<WidgetRetryAction>()),style=TextStyle(color=accent,fontSize=11.sp))
                        }
                    }
                    if(state.text("state")=="offline") Text("Offline · showing last update",style=TextStyle(color=secondary,fontSize=9.sp))
                    if(state.text("state")=="changed") Text("List changed · showing current items",style=TextStyle(color=secondary,fontSize=9.sp))
                }
            }
        }
    }
}
class MealPlannerWidgetReceiver:GlanceAppWidgetReceiver() {
    override val glanceAppWidget=MealPlannerWidget()
    override fun onEnabled(context:Context) { super.onEnabled(context);WidgetRefresh.schedule(context) }
    override fun onDisabled(context:Context) { super.onDisabled(context);WidgetRefresh.cancel(context) }
}
class WidgetRefresh(context:Context,parameters:WorkerParameters):CoroutineWorker(context,parameters) {
    override suspend fun doWork():Result { return try { WidgetWorker.sync(applicationContext);Result.success() } catch (_:Exception) { Result.retry() } }
    companion object {
        private const val name="meal-planner-widget-refresh"
        fun schedule(context:Context) {
            val request=PeriodicWorkRequestBuilder<WidgetRefresh>(30,TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(name,ExistingPeriodicWorkPolicy.KEEP,request)
        }
        fun cancel(context:Context) { WorkManager.getInstance(context).cancelUniqueWork(name) }
    }
}
