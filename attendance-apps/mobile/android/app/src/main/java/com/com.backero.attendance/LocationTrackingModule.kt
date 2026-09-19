package com.backero.attendance

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-facing bridge for `LocationForegroundService` (Phase 7 background
 * tracking). Deliberately minimal — start/stop only. See the service's own
 * doc comment for why it doesn't fetch or emit location data itself.
 */
class LocationTrackingModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LocationTrackingService"

  @ReactMethod
  fun start(intervalSeconds: Double, promise: Promise) {
    try {
      LocationForegroundService.reactContext = reactApplicationContext
      LocationForegroundService.start(reactApplicationContext, (intervalSeconds * 1000).toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("location_foreground_service_start_failed", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      LocationForegroundService.stop(reactApplicationContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("location_foreground_service_stop_failed", e)
    }
  }
}
