package eu.embodyagile.gtdpara

import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File

/**
 * Native text measurement for Supernote textbox sizing.
 *
 * Ported from the sister project NoteDraft/textboxHelper (TextboxMetricsModule.kt,
 * package com.textboxhelper) - only `measureTextLayout`; the word-level hit-testing
 * variant (`measureTextLayoutDetailed`) is deliberately not ported, nothing in gtdpara
 * needs it. Builds an Android StaticLayout for (text, width, fontSize[, fontPath]) so
 * callers get the real wrapped height / line count / widest line instead of the
 * char-width guess in ui/textLineEstimator.ts.
 *
 * JS side: supernote/textboxMetrics.ts (bridge name "TextboxMetrics"). Registered in
 * GtdParaFilePackage.createNativeModules. Shared by the "Link email as note" feature
 * and (later) the textbox-metrics feature - see docs/dev/technical-design-gmail-email-note.md 3.3/3.9.
 */
class TextboxMetricsModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    PluginRuntimeGuard.onModuleCreated("TextboxMetrics")
  }

  override fun getName(): String = "TextboxMetrics"

  override fun invalidate() {
    PluginRuntimeGuard.onModuleInvalidated("TextboxMetrics")
    super.invalidate()
  }

  @ReactMethod
  fun measureTextLayout(options: ReadableMap, promise: Promise) {
    PluginRuntimeGuard.trace("TextboxMetrics.measureTextLayout")
    try {
      val text = options.getString("text") ?: ""
      val width = options.getInt("width")
      val fontSize = options.getDouble("fontSize").toFloat()
      val includePad = if (options.hasKey("includePad")) {
        options.getBoolean("includePad")
      } else {
        true
      }
      val fontPath = if (options.hasKey("fontPath") && !options.isNull("fontPath")) {
        options.getString("fontPath")
      } else {
        null
      }

      if (width < 0) {
        throw IllegalArgumentException("width must be >= 0")
      }

      val paint = TextPaint().apply {
        isAntiAlias = true
        textSize = fontSize
        typeface = loadTypeface(fontPath)
      }

      val layout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
          .setAlignment(Layout.Alignment.ALIGN_NORMAL)
          .setIncludePad(includePad)
          .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
          .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
          .build()
      } else {
        @Suppress("DEPRECATION")
        StaticLayout(
          text,
          paint,
          width,
          Layout.Alignment.ALIGN_NORMAL,
          1.0f,
          0.0f,
          includePad
        )
      }

      var maxLineWidth = 0.0
      for (index in 0 until layout.lineCount) {
        maxLineWidth = maxOf(maxLineWidth, layout.getLineWidth(index).toDouble())
      }

      val result = Arguments.createMap().apply {
        putInt("requestedWidth", width)
        putDouble("requestedFontSize", fontSize.toDouble())
        putBoolean("includePad", includePad)
        putInt("layoutHeight", layout.height)
        putInt("lineCount", layout.lineCount)
        putDouble("maxLineWidth", maxLineWidth)
      }

      promise.resolve(result)
    } catch (error: Throwable) {
      promise.reject("E_MEASURE_TEXT", error)
    }
  }

  private fun loadTypeface(fontPath: String?): Typeface? {
    if (fontPath.isNullOrBlank()) {
      return null
    }

    val file = File(fontPath)
    if (!file.exists()) {
      return null
    }

    return try {
      Typeface.createFromFile(file)
    } catch (_: Throwable) {
      null
    }
  }
}
