package app.houston.android

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Two windows on top of everything while control is active: a full-screen, untouchable
 * layer drawing Houston's pointer and clicks, and a bar with a Stop button.
 */
class Overlay(
  private val context: Context,
  private val type: Int,
  private val barText: String,
  private val stopText: String,
  private val onStop: () -> Unit,
) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private val main = Handler(Looper.getMainLooper())
  private var layer: PointerLayer? = null
  private var bar: View? = null

  fun show() = main.post {
    val layer = PointerLayer(context)
    val layerParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      }
    }
    windows.addView(layer, layerParams)
    this.layer = layer

    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.rgb(11, 61, 145))
      val pad = dp(12)
      setPadding(pad, pad, pad, pad)
      addView(TextView(context).apply {
        text = barText
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        setTypeface(typeface, Typeface.BOLD)
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      })
      addView(Button(context).apply {
        text = stopText
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        setTextColor(Color.WHITE)
        setBackgroundColor(Color.rgb(198, 40, 40))
        minHeight = dp(56)
        setOnClickListener { onStop() }
      })
    }
    val barParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP }
    windows.addView(bar, barParams)
    this.bar = bar
  }

  fun hide() = main.post {
    layer?.let { windows.removeView(it) }
    bar?.let { windows.removeView(it) }
    layer = null
    bar = null
  }

  fun pointer(x: Float, y: Float) = main.post { layer?.pointer(x, y) }

  fun click(x: Float, y: Float) = main.post { layer?.click(x, y) }

  private fun dp(value: Int) =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics).toInt()
}

/** Draws Houston's pointer and fading rings where Houston clicks. */
private class PointerLayer(context: Context) : View(context) {
  private val orange = Color.rgb(255, 90, 31)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = orange
    strokeWidth = 14f
  }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(70, 255, 90, 31) }
  private val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    color = Color.WHITE
    strokeWidth = 6f
  }
  private var pointer: Pair<Float, Float>? = null
  private val ripples = mutableListOf<Triple<Float, Float, Float>>()

  fun pointer(x: Float, y: Float) {
    pointer = x to y
    invalidate()
  }

  fun click(x: Float, y: Float) {
    val ripple = floatArrayOf(x, y, 0f)
    ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 900
      addUpdateListener {
        ripple[2] = it.animatedValue as Float
        ripples.clear()
        ripples.add(Triple(ripple[0], ripple[1], ripple[2]))
        invalidate()
      }
      start()
    }
  }

  override fun onDraw(canvas: Canvas) {
    pointer?.let { (fx, fy) ->
      val x = fx * width
      val y = fy * height
      canvas.drawCircle(x, y, 44f, fill)
      canvas.drawCircle(x, y, 44f, halo)
      canvas.drawCircle(x, y, 40f, ring)
    }
    for ((fx, fy, progress) in ripples) {
      val paint = Paint(ring).apply { alpha = ((1f - progress) * 255).toInt() }
      canvas.drawCircle(fx * width, fy * height, 30f + progress * 120f, paint)
    }
  }
}
