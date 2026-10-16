package eu.embodyagile.gtdpara

import android.os.Build
import android.os.Process
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

/**
 * JS surface for PluginRuntimeGuard (docs/dev/technical-design-host-update-crash.md):
 * lets the debug bundle and the start log ask "is an older gtdpara build
 * still loaded in this host process?".
 *
 * JS side: supernote/pluginRuntime.ts (bridge name "GtdParaRuntime").
 */
class GtdParaRuntimeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        PluginRuntimeGuard.onModuleCreated(NAME)
    }

    companion object {
        private const val NAME = "GtdParaRuntime"
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        PluginRuntimeGuard.onModuleInvalidated(NAME)
        super.invalidate()
    }

    /**
     * Resolves {buildId, versionCode, loaderId, pid, processAgeMs, npkPath,
     * staleBuilds: string[], mappedFiles: string[], registry: string[],
     * scanError: string|null, model, manufacturer, display, androidRelease}. `staleBuilds` non-empty = an older build is
     * still loaded next to this one.
     */
    @ReactMethod
    fun getRuntimeDiagnostics(promise: Promise) {
        PluginRuntimeGuard.trace("$NAME.getRuntimeDiagnostics")
        try {
            val mapped = PluginRuntimeGuard.scanMappedBuilds()
            PluginRuntimeGuard.logMapped("diagnostics", mapped)
            val map = WritableNativeMap()
            map.putString("buildId", PluginRuntimeGuard.buildId)
            map.putString("versionCode", PluginRuntimeGuard.versionCode)
            map.putString("loaderId", PluginRuntimeGuard.loaderId)
            map.putInt("pid", Process.myPid())
            map.putDouble("processAgeMs", PluginRuntimeGuard.processAgeMs().toDouble())
            map.putString("npkPath", PluginRuntimeGuard.npkPath)
            map.putArray("staleBuilds", WritableNativeArray().apply { mapped.otherBuilds.forEach { pushString(it) } })
            map.putArray("mappedFiles", WritableNativeArray().apply { mapped.files.forEach { pushString(it) } })
            map.putArray("registry", WritableNativeArray().apply { PluginRuntimeGuard.registryEntries().forEach { pushString(it) } })
            map.putString("scanError", mapped.error)
            // Device facts for the debug bundle (docs/dev/technical-design-about-debug-experimental.md §3.4).
            map.putString("model", Build.MODEL ?: "")
            map.putString("manufacturer", Build.MANUFACTURER ?: "")
            map.putString("display", Build.DISPLAY ?: "")
            map.putString("androidRelease", Build.VERSION.RELEASE ?: "")
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("E_DIAGNOSTICS", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }
}
