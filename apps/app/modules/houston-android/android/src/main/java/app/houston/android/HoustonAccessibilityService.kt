package app.houston.android

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * Enabled by the person in Android's accessibility settings. It does nothing by itself:
 * it only carries out Houston's input while control is active (see Control).
 */
class HoustonAccessibilityService : AccessibilityService() {
  companion object {
    @Volatile var instance: HoustonAccessibilityService? = null
      private set
  }

  override fun onServiceConnected() {
    instance = this
    Control.serviceChanged()
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    instance = null
    Control.serviceChanged()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    instance = null
    Control.serviceChanged()
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

  override fun onInterrupt() {}
}
