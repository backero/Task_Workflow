package com.backero.attendance

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Phase 7 background tracking (docs/architecture/location-tracking.md).
 *
 * This service does not fetch location itself — `LocationTrackingManager`
 * (JS) already does that via `@react-native-community/geolocation` and is
 * fully tested. It has two jobs: (1) hold the process in the foreground with
 * the OS-mandated persistent notification, and (2) periodically emit a
 * "heartbeat" event straight into the JS bridge to drive `tick()`.
 *
 * (2) matters because plain JS `setInterval`/`setTimeout` timers get
 * throttled by Android once the app is backgrounded — a foreground service
 * alone keeps the *process* alive but does not, by itself, keep those JS
 * timers firing (confirmed live: no new points arrived for several minutes
 * with only the notification-holding service running). A native-triggered
 * bridge event is not subject to that same timer throttling, so it reaches
 * JS reliably; JS still owns the actual GPS fetch + queue + upload logic.
 */
class LocationForegroundService : Service() {

  companion object {
    private const val CHANNEL_ID = "backero_location_tracking"
    private const val NOTIFICATION_ID = 4201
    private const val EXTRA_INTERVAL_MS = "intervalMillis"
    private const val HEARTBEAT_EVENT = "BackeroLocationHeartbeat"

    // Set by LocationTrackingModule before starting the service — the
    // service itself has no other route to a JS-emitting context.
    var reactContext: ReactApplicationContext? = null

    fun start(context: Context, intervalMillis: Long) {
      val intent = Intent(context, LocationForegroundService::class.java)
        .putExtra(EXTRA_INTERVAL_MS, intervalMillis)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, LocationForegroundService::class.java))
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var intervalMillis: Long = 60_000
  private val heartbeatRunnable =
    object : Runnable {
      override fun run() {
        emitHeartbeat()
        handler.postDelayed(this, intervalMillis)
      }
    }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intervalMillis = intent?.getLongExtra(EXTRA_INTERVAL_MS, intervalMillis) ?: intervalMillis
    startForeground(NOTIFICATION_ID, buildNotification())
    handler.removeCallbacks(heartbeatRunnable)
    handler.postDelayed(heartbeatRunnable, intervalMillis)
    // START_STICKY: if the OS kills the process under memory pressure while
    // still "foreground", ask it to recreate the service — the JS side
    // separately persists session state and offers a resume/end prompt on
    // next launch, so this is a best-effort continuity aid, not the sole
    // mechanism relied on.
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(heartbeatRunnable)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun emitHeartbeat() {
    reactContext
      ?.takeIf { it.hasActiveReactInstance() }
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(HEARTBEAT_EVENT, null)
  }

  private fun buildNotification(): Notification {
    val openAppIntent =
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        PendingIntent.getActivity(
          this,
          0,
          it,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
      }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.app_name))
      .setContentText("Location tracking is active for your field session.")
      .setSmallIcon(R.drawable.ic_location_tracking)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .apply { openAppIntent?.let { setContentIntent(it) } }
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, "Field Session Tracking", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while a field employee's location tracking session is active."
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }
}
