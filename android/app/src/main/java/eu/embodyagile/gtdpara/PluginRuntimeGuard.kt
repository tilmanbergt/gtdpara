package eu.embodyagile.gtdpara

import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log
import java.io.File

/**
 * Diagnostics for the "crash shortly after installing a new build" problem
 * (docs/dev/technical-design-host-update-crash.md).
 *
 * Background: the Supernote plugin host installs a new gtdpara build into the
 * ALREADY RUNNING host process. The old build's native code stays loaded next
 * to the new one, and 1-2 minutes later the process dies with a SIGSEGV inside
 * ART on our native-modules thread (crash-log.txt, 2026-09-29). A fresh host
 * process never showed the problem.
 *
 * This object is loaded once PER CLASS LOADER, i.e. once per installed build
 * that is alive in the process - which is exactly the unit we want to track:
 *  - [buildId]: the npk file name the host gave this build ("app_<ms>"),
 *    parsed from this class's own class loader.
 *  - A process-wide registry in a System property (System is loaded by the
 *    boot class loader, so every build's copy of this object sees the same
 *    property) - a history of which builds registered in this process.
 *  - [scanMappedBuilds]: which gtdpara npk/odex/vdex files are mapped in
 *    /proc/self/maps right now - the authoritative "is an older build still
 *    loaded?" signal, and the one that also catches builds that predate this
 *    code (they never registered).
 *  - [trace]: a one-line breadcrumb at the start of every @ReactMethod, so the
 *    next crash log shows the last native call and WHICH build made it.
 *
 * Logs under the "GtdParaRuntime" tag:
 *   adb logcat -d -s GtdParaRuntime:V ReactNativeJS:V
 */
object PluginRuntimeGuard {
    private const val TAG = "GtdParaRuntime"
    private const val REGISTRY_PROPERTY = "eu.embodyagile.gtdpara.loadedBuilds"
    /** PluginConfig.json's pluginID - fallback when it can't be parsed from the class loader. */
    private const val FALLBACK_PLUGIN_ID = "ndx27q77pojfqh6l"

    private val BUILD_FILE_RE = Regex("""(app_\d+)\.(npk|odex|vdex|art)""")
    private val NPK_PATH_RE = Regex("""(/[^\s"',\]\[]*/plugins/([A-Za-z0-9]+)/app_\d+\.npk)""")

    private val loaderDescription: String = try {
        PluginRuntimeGuard::class.java.classLoader?.toString() ?: "null"
    } catch (e: Throwable) {
        "unavailable: ${e.javaClass.simpleName}"
    }

    /** Hex identity of this build's class loader - distinguishes two loads of the same file. */
    val loaderId: String = Integer.toHexString(System.identityHashCode(PluginRuntimeGuard::class.java.classLoader))

    val npkPath: String? = NPK_PATH_RE.find(loaderDescription)?.groupValues?.get(1)

    val pluginId: String = npkPath?.let { NPK_PATH_RE.find(it)?.groupValues?.get(2) } ?: FALLBACK_PLUGIN_ID

    /** "app_1790688024888" - or "unknown" if the class loader didn't reveal the npk path. */
    val buildId: String = npkPath?.let { BUILD_FILE_RE.find(it)?.groupValues?.get(1) } ?: "unknown"

    /** versionCode from the installed PluginConfig.json next to the npk, if the host keeps one there. */
    val versionCode: String = try {
        val dir = npkPath?.let { File(it).parentFile }
        val config = dir?.let { File(it, "PluginConfig.json") }
        if (config != null && config.isFile) {
            Regex(""""versionCode"\s*:\s*"?(\d+)"?""").find(config.readText())?.groupValues?.get(1) ?: "?"
        } else {
            "?"
        }
    } catch (e: Throwable) {
        "?"
    }

    private val loadedAtWallMs = System.currentTimeMillis()

    @Volatile
    private var moduleCount = 0

    init {
        val registry = register()
        val mapped = scanMappedBuilds()
        Log.i(
            TAG,
            "build loaded: build=$buildId versionCode=$versionCode loader=$loaderId pid=${Process.myPid()} " +
                "processAgeMs=${processAgeMs()} npk=${npkPath ?: "?"}",
        )
        Log.i(TAG, "build loaded: registry=$registry")
        logMapped("build loaded", mapped)
        if (npkPath == null) {
            Log.w(TAG, "build loaded: could not parse npk path from class loader: ${loaderDescription.take(400)}")
        }
    }

    /** Called from every native module's init block. */
    fun onModuleCreated(moduleName: String) {
        moduleCount++
        Log.i(TAG, "module created: $moduleName build=$buildId loader=$loaderId thread=${Thread.currentThread().name}")
    }

    /** Called from every native module's invalidate(). */
    fun onModuleInvalidated(moduleName: String) {
        moduleCount--
        Log.i(TAG, "module invalidated: $moduleName build=$buildId loader=$loaderId remaining=$moduleCount thread=${Thread.currentThread().name}")
    }

    /** One-line breadcrumb at the start of every @ReactMethod. */
    fun trace(call: String) {
        Log.i(TAG, "call $call build=$buildId loader=$loaderId thread=${Thread.currentThread().name}")
    }

    /**
     * The builds (other than this one) whose code files are mapped in the
     * process right now, plus every mapped gtdpara code file and whether it
     * was deleted from disk (an old build's files are removed on install but
     * stay mapped while that build is still loaded).
     */
    data class MappedBuilds(val otherBuilds: List<String>, val files: List<String>, val error: String?)

    fun scanMappedBuilds(): MappedBuilds {
        return try {
            val marker = "/plugins/$pluginId/"
            val files = LinkedHashSet<String>()
            File("/proc/self/maps").forEachLine { line ->
                val idx = line.indexOf(marker)
                if (idx < 0) return@forEachLine
                // The path starts at the first '/' of the pathname column.
                val pathStart = line.lastIndexOf(' ', idx).let { if (it < 0) idx else it + 1 }
                val path = line.substring(pathStart).trim()
                if (BUILD_FILE_RE.containsMatchIn(path)) files.add(path)
            }
            val builds = files.mapNotNull { BUILD_FILE_RE.find(it)?.groupValues?.get(1) }.toSortedSet()
            MappedBuilds(builds.filter { it != buildId }, files.toList(), null)
        } catch (e: Throwable) {
            MappedBuilds(emptyList(), emptyList(), "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    fun logMapped(context: String, mapped: MappedBuilds) {
        if (mapped.error != null) {
            Log.w(TAG, "$context: /proc/self/maps scan failed: ${mapped.error}")
            return
        }
        Log.i(TAG, "$context: mapped gtdpara files=${mapped.files.size} otherBuilds=${mapped.otherBuilds}")
        mapped.files.forEach { Log.i(TAG, "$context:   mapped $it") }
        if (mapped.otherBuilds.isNotEmpty()) {
            Log.w(TAG, "$context: STALE BUILD(S) STILL LOADED in pid ${Process.myPid()}: ${mapped.otherBuilds} (this build=$buildId)")
        }
    }

    /** The process-wide registry of builds that registered in this process, oldest first. */
    fun registryEntries(): List<String> =
        (System.getProperty(REGISTRY_PROPERTY) ?: "").split(';').filter { it.isNotBlank() }

    private fun register(): List<String> {
        // Lock on a boot-class-loader object so every build's copy of this code shares the lock.
        synchronized(System::class.java) {
            val entry = "$buildId@$loaderId@$loadedAtWallMs"
            val entries = registryEntries() + entry
            System.setProperty(REGISTRY_PROPERTY, entries.joinToString(";"))
            return entries
        }
    }

    /** Milliseconds since the host process started (-1 if unknown). */
    fun processAgeMs(): Long = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()
        } else {
            -1
        }
    } catch (e: Throwable) {
        -1
    }

    /**
     * Ends the plugin host process - a controlled version of what the crash
     * does. The host is restarted by the system on the next plugin tap and
     * loads only the newest build. Settings and files are untouched.
     */
    fun killHostProcess(reason: String) {
        Log.w(TAG, "killHostProcess: $reason build=$buildId pid=${Process.myPid()}")
        Process.killProcess(Process.myPid())
    }
}
