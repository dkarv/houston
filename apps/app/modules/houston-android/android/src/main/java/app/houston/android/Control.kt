package app.houston.android

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.graphics.PointF
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Remote control on Android. Houston's events arrive as fractions of the shared screen.
 * With the Accessibility service enabled they become real taps, swipes and typing;
 * otherwise only the overlay shows where Houston points.
 *
 * Nothing is ever performed unless the person allowed control in the call (`active`).
 */
object Control {
  /** Set while the person has allowed control; everything else is ignored. */
  @Volatile var active = false
    private set
  var mode = "overlay"
    private set

  /** Notified when the person ends control with the native Stop bar. */
  var onStoppedByUser: (() -> Unit)? = null
  /** Notified when what's possible changes (service enabled/disabled). */
  var onModeChange: (() -> Unit)? = null

  private var overlay: Overlay? = null
  private var stroke: MutableList<PointF>? = null
  private var strokeButton = 0
  private var strokeStart = 0L
  private var lastPointer = PointF(0.5f, 0.5f)

  fun canDrawOverlays(context: Context) = Settings.canDrawOverlays(context)

  fun currentMode(): String = if (HoustonAccessibilityService.instance != null) "full" else "overlay"

  /** Returns false if overlay mode lacks the "display over other apps" permission. */
  fun start(context: Context, requested: String, barText: String, stopText: String): Boolean {
    stop()
    val service = HoustonAccessibilityService.instance
    val full = requested == "full" && service != null
    val overlayContext: Context
    val type: Int
    if (full) {
      overlayContext = service!!
      type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
    } else {
      if (!canDrawOverlays(context)) return false
      overlayContext = context.applicationContext
      type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    }
    mode = if (full) "full" else "overlay"
    overlay = Overlay(overlayContext, type, barText, stopText) { stopByUser() }.also { it.show() }
    active = true
    return true
  }

  fun stop() {
    active = false
    stroke = null
    overlay?.hide()
    overlay = null
  }

  private fun stopByUser() {
    if (!active) return
    stop()
    onStoppedByUser?.invoke()
  }

  fun pointer(x: Double, y: Double) {
    if (!active) return
    lastPointer = PointF(x.toFloat(), y.toFloat())
    overlay?.pointer(x.toFloat(), y.toFloat())
    stroke?.add(PointF(x.toFloat(), y.toFloat()))
  }

  fun input(json: String) {
    if (!active) return
    val event = JSONObject(json)
    when (event.optString("t")) {
      "down" -> {
        val p = PointF(event.getDouble("x").toFloat(), event.getDouble("y").toFloat())
        overlay?.click(p.x, p.y)
        stroke = mutableListOf(p)
        strokeButton = event.optInt("b")
        strokeStart = SystemClock.uptimeMillis()
      }
      "up" -> {
        val points = stroke ?: return
        stroke = null
        points.add(PointF(event.getDouble("x").toFloat(), event.getDouble("y").toFloat()))
        gesture(points, SystemClock.uptimeMillis() - strokeStart, strokeButton == 2)
      }
      "wheel" -> scroll(
        event.getDouble("x").toFloat(),
        event.getDouble("y").toFloat(),
        event.optDouble("dy", 0.0).toFloat(),
      )
      "text" -> typeText(event.getString("text"))
      "key" -> if (event.getBoolean("down")) key(event.getString("key"))
    }
  }

  // ── Performing input through the Accessibility service ──────────────────

  private fun service(): HoustonAccessibilityService? =
    if (mode == "full") HoustonAccessibilityService.instance else null

  private fun screenSize(service: AccessibilityService): PointF {
    val windows = service.getSystemService(WindowManager::class.java)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windows.maximumWindowMetrics.bounds
      PointF(bounds.width().toFloat(), bounds.height().toFloat())
    } else {
      @Suppress("DEPRECATION")
      val metrics = android.util.DisplayMetrics().also { windows.defaultDisplay.getRealMetrics(it) }
      PointF(metrics.widthPixels.toFloat(), metrics.heightPixels.toFloat())
    }
  }

  /**
   * A mouse press becomes a touch: short = tap, held = long press (also for the right
   * button), moved = swipe along the pointer's path.
   */
  private fun gesture(fractions: List<PointF>, durationMs: Long, longPress: Boolean) {
    val service = service() ?: return
    val size = screenSize(service)
    val points = fractions.map { PointF(it.x * size.x, it.y * size.y) }
    val first = points.first()
    val last = points.last()
    val moved = hypot(last.x - first.x, last.y - first.y) > 24
    val path = Path().apply {
      moveTo(first.x, first.y)
      if (moved) points.drop(1).forEach { lineTo(it.x, it.y) }
    }
    val duration = when {
      moved -> min(max(durationMs, 100L), 2000L)
      longPress -> 800L
      durationMs >= 500 -> min(durationMs, 3000L)
      else -> 50L
    }
    dispatch(service, path, duration)
  }

  /** Mouse wheel → a swipe: scrolling down moves the finger up. */
  private fun scroll(x: Float, y: Float, dy: Float) {
    val service = service() ?: return
    if (dy == 0f) return
    val size = screenSize(service)
    val startX = x * size.x
    val startY = y * size.y
    val distance = min(abs(dy) * 2f, size.y * 0.4f) * if (dy > 0) -1 else 1
    val endY = min(max(startY + distance, 1f), size.y - 1f)
    val path = Path().apply {
      moveTo(startX, startY)
      lineTo(startX, endY)
    }
    dispatch(service, path, 250L)
  }

  private fun dispatch(service: AccessibilityService, path: Path, durationMs: Long) {
    val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
    service.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
  }

  private fun focusedInput(): AccessibilityNodeInfo? =
    service()?.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

  private fun currentText(node: AccessibilityNodeInfo): String {
    val showingHint = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && node.isShowingHintText
    return if (showingHint) "" else node.text?.toString() ?: ""
  }

  private fun setText(node: AccessibilityNodeInfo, text: String) {
    val arguments = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
    }
    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
  }

  /** Typing appends to the focused text field. */
  private fun typeText(text: String) {
    val node = focusedInput() ?: return
    setText(node, currentText(node) + text)
  }

  private fun key(key: String) {
    val service = service() ?: return
    when (key) {
      "Backspace" -> focusedInput()?.let { node ->
        val text = currentText(node)
        if (text.isNotEmpty()) setText(node, text.dropLast(1))
      }
      "Enter" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        focusedInput()?.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
      }
      // The closest a keyboard gets to Android's own navigation buttons.
      "Escape" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
      "Meta" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
    }
  }

  internal fun serviceChanged() {
    // Losing the service mid-control falls back to pointing.
    if (active && mode == "full" && HoustonAccessibilityService.instance == null) stopByUser()
    onModeChange?.invoke()
  }
}
