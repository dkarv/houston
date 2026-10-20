package app.houston.android

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HoustonAndroidModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("HoustonAndroid")

    Events("onControlModeChange", "onControlStopped")

    OnCreate {
      Control.onModeChange = { sendEvent("onControlModeChange") }
      Control.onStoppedByUser = { sendEvent("onControlStopped") }
    }

    OnDestroy {
      Control.stop()
      Control.onModeChange = null
      Control.onStoppedByUser = null
    }

    // Permissions can be granted in Settings while the app is in the background.
    OnActivityEntersForeground { sendEvent("onControlModeChange") }

    Function("controlMode") { Control.currentMode() }

    Function("isAccessibilityEnabled") { HoustonAccessibilityService.instance != null }

    Function("canDrawOverlays") { Control.canDrawOverlays(context) }

    Function("openAccessibilitySettings") {
      context.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    Function("openOverlaySettings") {
      context.startActivity(
        Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    Function("startControl") { mode: String, barText: String, stopText: String ->
      Control.start(context, mode, barText, stopText)
    }

    Function("stopControl") { Control.stop() }

    Function("pointer") { x: Double, y: Double -> Control.pointer(x, y) }

    Function("input") { json: String -> Control.input(json) }
  }
}
