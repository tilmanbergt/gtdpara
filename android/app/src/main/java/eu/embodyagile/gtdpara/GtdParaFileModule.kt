package eu.embodyagile.gtdpara

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import java.io.File
import java.io.FileOutputStream

/**
 * Minimal native file surface for GtdPara.
 *
 * sn-plugin-lib's own FileUtils has no folder-listing call, and opening a
 * file already goes through the official PluginFileAPI.openFile from JS -
 * so this module only needs to cover what's left: listing a folder, and
 * plain-text read/write for project.txt/area.txt (technical-draft.md §4).
 *
 * Logs under the "GtdParaFile" tag - pair with the JS-side "[GtdPara]"
 * console logs when debugging via:
 *   adb logcat -c; <reproduce>; adb logcat -d -s ReactNativeJS:V GtdParaFile:V
 */
class GtdParaFileModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "GtdParaFile"

        /**
         * The plugin's private folder (`.../files/plugins/<pluginID>`), the
         * one place exempt from every plugin permission (Supernote docs,
         * plugin-base/permission). Derived from the installed npk's own
         * folder; falls back to `<host filesDir>/plugins/<pluginID>`.
         */
        fun privateDir(context: Context): File {
            val fromNpk = PluginRuntimeGuard.npkPath?.let { File(it).parentFile }
            if (fromNpk != null && fromNpk.isDirectory) return fromNpk
            return File(context.filesDir, "plugins/${PluginRuntimeGuard.pluginId}")
        }

        /** gtdpara's temp folder inside [privateDir] - rendered PDF pages, PDF .part files. */
        fun privateTmpDir(context: Context): File = File(privateDir(context), "tmp")
    }

    init {
        PluginRuntimeGuard.onModuleCreated("GtdParaFile")
    }

    override fun getName(): String = "GtdParaFile"

    override fun invalidate() {
        PluginRuntimeGuard.onModuleInvalidated("GtdParaFile")
        super.invalidate()
    }

    /**
     * Lists one folder level, non-recursive. Hidden dotfiles and Supernote's
     * internal .mark files are filtered out. A .note "folder" (Supernote
     * stores notebooks as package-like directories on disk) is reported as
     * a file, not a folder, so callers don't try to descend into it.
     */
    @ReactMethod
    fun listFolderEntries(folderPath: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.listFolderEntries")
        if (folderPath.isNullOrEmpty()) {
            Log.w(TAG, "listFolderEntries: no path given")
            promise.reject("E_PATH", "No folder path given")
            return
        }
        Log.d(TAG, "listFolderEntries: start path=$folderPath")
        val startedAt = System.currentTimeMillis()
        try {
            val folder = File(folderPath)
            val exists = folder.exists()
            Log.d(TAG, "listFolderEntries: exists=$exists path=$folderPath")
            if (!exists) {
                promise.resolve(WritableNativeArray())
                return
            }
            if (!folder.isDirectory) {
                Log.w(TAG, "listFolderEntries: not a directory path=$folderPath")
                promise.reject("E_NOT_DIRECTORY", "Path is not a folder: $folderPath")
                return
            }
            val children = folder.listFiles()
            if (children == null) {
                Log.w(TAG, "listFolderEntries: listFiles() returned null path=$folderPath")
                promise.reject("E_LIST", "Could not read folder: $folderPath")
                return
            }
            Log.d(TAG, "listFolderEntries: raw children=${children.size} path=$folderPath")
            children.sortWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })

            val entries: WritableArray = WritableNativeArray()
            for (child in children) {
                val name = child.name
                val lower = name.lowercase()
                if (name.startsWith(".") || lower.endsWith(".mark")) continue

                val entry: WritableMap = WritableNativeMap()
                entry.putString("name", name)
                entry.putString("path", child.absolutePath)
                entry.putBoolean("isFolder", child.isDirectory && !lower.endsWith(".note"))
                entries.pushMap(entry)
            }
            val elapsedMs = System.currentTimeMillis() - startedAt
            Log.d(TAG, "listFolderEntries: done entries=${entries.size()} elapsedMs=$elapsedMs path=$folderPath")
            promise.resolve(entries)
        } catch (error: Throwable) {
            Log.e(TAG, "listFolderEntries: failed path=$folderPath", error)
            promise.reject("E_LIST", error.message, error)
        }
    }

    /**
     * Reads a whole text file (project.txt/area.txt). Resolves `null` if the
     * file doesn't exist yet - the JS side treats that as "no data file
     * created for this Project/Area yet" rather than an error, since that's
     * the normal state for a folder nobody has added a todo/meeting to.
     */
    @ReactMethod
    fun readTextFile(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.readTextFile")
        if (path.isNullOrEmpty()) {
            Log.w(TAG, "readTextFile: no path given")
            promise.reject("E_PATH", "No file path given")
            return
        }
        Log.d(TAG, "readTextFile: start path=$path")
        try {
            val file = File(path)
            if (!file.exists()) {
                Log.d(TAG, "readTextFile: missing path=$path")
                promise.resolve(null)
                return
            }
            if (!file.isFile) {
                Log.w(TAG, "readTextFile: not a file path=$path")
                promise.reject("E_NOT_FILE", "Path is not a file: $path")
                return
            }
            val content = file.readText(Charsets.UTF_8)
            Log.d(TAG, "readTextFile: done chars=${content.length} path=$path")
            promise.resolve(content)
        } catch (error: Throwable) {
            Log.e(TAG, "readTextFile: failed path=$path", error)
            promise.reject("E_READ", error.message, error)
        }
    }

    /**
     * Writes a whole text file, replacing its content, creating the file
     * (and any missing parent folders) if it doesn't exist yet. Callers on
     * the JS side (domain/markdown.ts) always compute the *entire* new file
     * content before calling this - the span-scoped safe-write logic lives
     * there, not here, so this native method stays a plain overwrite.
     */
    @ReactMethod
    fun writeTextFile(path: String?, content: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.writeTextFile")
        if (path.isNullOrEmpty()) {
            Log.w(TAG, "writeTextFile: no path given")
            promise.reject("E_PATH", "No file path given")
            return
        }
        Log.d(TAG, "writeTextFile: start path=$path chars=${content?.length ?: 0}")
        try {
            val file = File(path)
            file.parentFile?.mkdirs()
            file.writeText(content ?: "", Charsets.UTF_8)
            Log.d(TAG, "writeTextFile: done path=$path")
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "writeTextFile: failed path=$path", error)
            promise.reject("E_WRITE", error.message, error)
        }
    }

    /**
     * Moves a Project/Area folder from [fromPath] to [toPath] - the
     * physical half of archiving (JS side: storage/archive.ts's
     * archiveItem, via supernote/fileSystem.ts's moveFolder). Plain
     * `File.renameTo()`: atomic and effectively instant here because
     * source and destination are always under the same base root (just a
     * different top-level PARA folder), so no cross-filesystem copy is
     * involved - this is a small addition to a native module we already
     * own, not a dependency on any part of sn-plugin-lib.
     *
     * Rejects rather than silently no-oping when the destination already
     * exists (no overwrite, no merge - the caller surfaces this as a
     * plain "a folder with that name already exists" error) or when
     * `renameTo` itself returns false, which is possible for OS-level
     * reasons even though it's rare on plain external storage.
     */
    @ReactMethod
    fun moveFolder(fromPath: String?, toPath: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.moveFolder")
        if (fromPath.isNullOrEmpty() || toPath.isNullOrEmpty()) {
            Log.w(TAG, "moveFolder: missing path fromPath=$fromPath toPath=$toPath")
            promise.reject("E_PATH", "Both a source and destination path are required")
            return
        }
        Log.d(TAG, "moveFolder: start fromPath=$fromPath toPath=$toPath")
        try {
            val source = File(fromPath)
            if (!source.exists() || !source.isDirectory) {
                Log.w(TAG, "moveFolder: source is not a folder fromPath=$fromPath")
                promise.reject("E_NOT_DIRECTORY", "Source is not a folder: $fromPath")
                return
            }
            val dest = File(toPath)
            if (dest.exists()) {
                Log.w(TAG, "moveFolder: destination already exists toPath=$toPath")
                promise.reject("E_DEST_EXISTS", "A folder named \"${dest.name}\" already exists at the destination")
                return
            }
            dest.parentFile?.mkdirs()
            val moved = source.renameTo(dest)
            if (!moved) {
                Log.w(TAG, "moveFolder: renameTo returned false fromPath=$fromPath toPath=$toPath")
                promise.reject("E_MOVE", "Could not move the folder")
                return
            }
            Log.d(TAG, "moveFolder: done fromPath=$fromPath toPath=$toPath")
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "moveFolder: failed fromPath=$fromPath toPath=$toPath", error)
            promise.reject("E_MOVE", error.message, error)
        }
    }

    /**
     * Moves one FILE from [fromPath] to [toPath] (close-out outcome moves and
     * the project PDF - docs/dev/technical-design-project-close-out.md §2.2).
     * Creates missing parent folders. Never overwrites: rejects with
     * E_DEST_EXISTS if [toPath] exists. Same `renameTo` approach as
     * moveFolder - source and destination are always under the same base
     * root, so no cross-filesystem copy.
     */
    @ReactMethod
    fun moveFile(fromPath: String?, toPath: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.moveFile")
        if (fromPath.isNullOrEmpty() || toPath.isNullOrEmpty()) {
            promise.reject("E_PATH", "Both a source and destination path are required")
            return
        }
        Log.d(TAG, "moveFile: start fromPath=$fromPath toPath=$toPath")
        try {
            val source = File(fromPath)
            if (!source.exists() || !source.isFile) {
                promise.reject("E_NOT_FILE", "Source is not a file: $fromPath")
                return
            }
            val dest = File(toPath)
            if (dest.exists()) {
                promise.reject("E_DEST_EXISTS", "A file named \"${dest.name}\" already exists at the destination")
                return
            }
            dest.parentFile?.mkdirs()
            if (!source.renameTo(dest)) {
                promise.reject("E_MOVE", "Could not move the file")
                return
            }
            Log.d(TAG, "moveFile: done")
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "moveFile: failed fromPath=$fromPath toPath=$toPath", error)
            promise.reject("E_MOVE", error.message, error)
        }
    }

    /**
     * Moves folder [fromPath] to [toPath], MERGING into [toPath] when it
     * already exists (Area archive into an existing Archive/<year>/<Area>/
     * that already holds archived projects - close-out design §2.2, decision
     * 23). Checks every top-level child for a name collision FIRST and
     * rejects with E_COLLISION listing them before anything moves; only then
     * moves each child. The (now empty) source folder is left in place -
     * removing it is the caller's job, after the user confirmed it
     * ([deleteEmptyFolder]). When [toPath] doesn't exist this is a plain
     * rename, like moveFolder.
     */
    @ReactMethod
    fun moveFolderMerge(fromPath: String?, toPath: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.moveFolderMerge")
        if (fromPath.isNullOrEmpty() || toPath.isNullOrEmpty()) {
            promise.reject("E_PATH", "Both a source and destination path are required")
            return
        }
        Log.d(TAG, "moveFolderMerge: start fromPath=$fromPath toPath=$toPath")
        try {
            val source = File(fromPath)
            if (!source.exists() || !source.isDirectory) {
                promise.reject("E_NOT_DIRECTORY", "Source is not a folder: $fromPath")
                return
            }
            val dest = File(toPath)
            if (!dest.exists()) {
                dest.parentFile?.mkdirs()
                if (!source.renameTo(dest)) {
                    promise.reject("E_MOVE", "Could not move the folder")
                    return
                }
                promise.resolve(true)
                return
            }
            if (!dest.isDirectory) {
                promise.reject("E_NOT_DIRECTORY", "Destination exists and is not a folder: $toPath")
                return
            }
            val children = source.listFiles() ?: emptyArray()
            val collisions = children.filter { File(dest, it.name).exists() }.map { it.name }
            if (collisions.isNotEmpty()) {
                promise.reject("E_COLLISION", "Already in the destination: ${collisions.joinToString(", ")}")
                return
            }
            for (child in children) {
                if (!child.renameTo(File(dest, child.name))) {
                    promise.reject("E_MOVE", "Could not move \"${child.name}\" - earlier items were already moved")
                    return
                }
            }
            // The now-empty source folder is NOT deleted here: deleting is a
            // separate, user-confirmed step (JS: confirm, request
            // FILE:DELETE, then deleteEmptyFolder) - InkHub design §3.4.
            Log.d(TAG, "moveFolderMerge: merged ${children.size} entries, source left in place")
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "moveFolderMerge: failed fromPath=$fromPath toPath=$toPath", error)
            promise.reject("E_MOVE", error.message, error)
        }
    }

    private fun privateTmpDir(): File = privateTmpDir(reactApplicationContext)

    /** Resolves the absolute path of gtdpara's private temp folder (created if missing). */
    @ReactMethod
    fun getPrivateTempDir(promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.getPrivateTempDir")
        try {
            val tmp = privateTmpDir()
            if (!tmp.exists()) tmp.mkdirs()
            Log.d(TAG, "getPrivateTempDir: path=${tmp.absolutePath} exists=${tmp.isDirectory}")
            promise.resolve(tmp.absolutePath)
        } catch (error: Throwable) {
            Log.e(TAG, "getPrivateTempDir: failed", error)
            promise.reject("E_PRIVATE_DIR", error.message, error)
        }
    }

    private fun isInsidePrivateTmp(path: String): Boolean {
        val tmp = privateTmpDir().canonicalPath
        val target = File(path).canonicalPath
        return target == tmp || target.startsWith("$tmp/")
    }

    /**
     * Recursively deletes [path] - but ONLY inside gtdpara's private temp
     * folder ([privateTmpDir]), which needs no permission and is never shared
     * storage. Anything else rejects without touching the disk, so this can
     * structurally never reach a user file.
     */
    @ReactMethod
    fun deleteTempTree(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.deleteTempTree")
        if (path.isNullOrEmpty() || !isInsidePrivateTmp(path)) {
            promise.reject("E_NOT_TEMP", "Refusing to delete outside the private temp folder: $path")
            return
        }
        try {
            val target = File(path)
            val ok = !target.exists() || target.deleteRecursively()
            Log.d(TAG, "deleteTempTree: ok=$ok path=$path")
            promise.resolve(ok)
        } catch (error: Throwable) {
            Log.e(TAG, "deleteTempTree: failed path=$path", error)
            promise.reject("E_DELETE", error.message, error)
        }
    }

    /**
     * Deletes [path] only if it is an EMPTY folder (InkHub design §3.4).
     * Called by JS only after the user confirmed the delete and FILE:DELETE
     * was granted. Refuses files and non-empty folders (E_NOT_EMPTY), so a
     * bug can never delete user content. Resolves true when the folder is
     * gone (or was already gone).
     */
    @ReactMethod
    fun deleteEmptyFolder(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.deleteEmptyFolder")
        if (path.isNullOrEmpty()) {
            promise.reject("E_PATH", "No folder path given")
            return
        }
        try {
            val folder = File(path)
            if (!folder.exists()) {
                promise.resolve(true)
                return
            }
            if (!folder.isDirectory) {
                promise.reject("E_NOT_DIRECTORY", "Not a folder: $path")
                return
            }
            val children = folder.list()
            if (children == null || children.isNotEmpty()) {
                Log.w(TAG, "deleteEmptyFolder: not empty (${children?.size}) path=$path")
                promise.reject("E_NOT_EMPTY", "Folder is not empty: $path")
                return
            }
            val ok = folder.delete()
            Log.d(TAG, "deleteEmptyFolder: ok=$ok path=$path")
            if (!ok) {
                promise.reject("E_DELETE", "Could not delete the folder")
                return
            }
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "deleteEmptyFolder: failed path=$path", error)
            promise.reject("E_DELETE", error.message, error)
        }
    }

    /**
     * Writes base64-encoded bytes to [path] as a binary file, creating any
     * missing parent folders first - the binary counterpart of writeTextFile
     * above. Added for the Gmail inbox review step (JS side:
     * supernote/fileSystem.ts's writeBinaryFile / storage/
     * gmailAttachments.ts's saveGmailAttachment): PluginFileAPI has no
     * generic binary-file write, only .note pages/elements, so attachment
     * bytes fetched over IMAP have nowhere else to land. Same small-addition
     * pattern as moveFolder above - a plain File operation this module
     * already owns, not a dependency on sn-plugin-lib.
     */
    @ReactMethod
    fun writeBinaryFile(path: String?, base64Content: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.writeBinaryFile")
        if (path.isNullOrEmpty()) {
            Log.w(TAG, "writeBinaryFile: no path given")
            promise.reject("E_PATH", "No file path given")
            return
        }
        Log.d(TAG, "writeBinaryFile: start path=$path base64Chars=${base64Content?.length ?: 0}")
        try {
            val bytes = android.util.Base64.decode(base64Content ?: "", android.util.Base64.DEFAULT)
            val file = File(path)
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            Log.d(TAG, "writeBinaryFile: done path=$path bytes=${bytes.size}")
            promise.resolve(true)
        } catch (error: Throwable) {
            Log.e(TAG, "writeBinaryFile: failed path=$path", error)
            promise.reject("E_WRITE", error.message, error)
        }
    }

    /**
     * Creates a folder (and any missing parents) if it doesn't already
     * exist. Used before PluginFileAPI.createNote() when linking a note to a
     * todo/meeting - that SDK call's own folder-creation behavior for a
     * brand-new "Meetings"/"Todos" subfolder isn't documented, so this makes
     * sure the destination folder is there first rather than relying on it.
     * Resolves true whether the folder already existed or was just created;
     * only a genuine filesystem failure rejects.
     */
    @ReactMethod
    fun ensureFolder(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.ensureFolder")
        if (path.isNullOrEmpty()) {
            Log.w(TAG, "ensureFolder: no path given")
            promise.reject("E_PATH", "No folder path given")
            return
        }
        Log.d(TAG, "ensureFolder: start path=$path")
        try {
            val folder = File(path)
            if (folder.exists()) {
                if (!folder.isDirectory) {
                    Log.w(TAG, "ensureFolder: path exists and is not a folder path=$path")
                    promise.reject("E_NOT_DIRECTORY", "Path exists and is not a folder: $path")
                    return
                }
                promise.resolve(true)
                return
            }
            val created = folder.mkdirs()
            Log.d(TAG, "ensureFolder: created=$created path=$path")
            promise.resolve(created)
        } catch (error: Throwable) {
            Log.e(TAG, "ensureFolder: failed path=$path", error)
            promise.reject("E_MKDIR", error.message, error)
        }
    }

    /**
     * Appends text to a file, creating it (and missing parent folders) if
     * needed - the optional debug-log sink (utils/logSink.ts,
     * docs/dev/technical-design-about-debug-experimental.md §3.3). When the
     * file would grow beyond [maxBytes] (> 0), its content is first copied
     * over "<name>.1.<ext>" and the file is truncated - writes only, no
     * delete or rename - so at most two log files exist. Resolves to the
     * file's new length in bytes.
     */
    @ReactMethod
    fun appendTextFile(path: String?, content: String?, maxBytes: Double, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaFile.appendTextFile")
        if (path.isNullOrEmpty()) {
            promise.reject("E_PATH", "No file path given")
            return
        }
        try {
            val file = File(path)
            file.parentFile?.mkdirs()
            val bytes = (content ?: "").toByteArray(Charsets.UTF_8)
            val limit = maxBytes.toLong()
            if (limit > 0 && file.exists() && file.length() + bytes.size > limit) {
                val dot = path.lastIndexOf('.')
                val rotatedPath = if (dot > path.lastIndexOf('/')) path.substring(0, dot) + ".1" + path.substring(dot) else "$path.1"
                // Rotate by OVERWRITING, never deleting or renaming (no
                // FILE:DELETE needed): copy the full log over the ".1" file,
                // then truncate the current one.
                file.inputStream().use { input ->
                    FileOutputStream(File(rotatedPath), false).use { output -> input.copyTo(output) }
                }
                FileOutputStream(file, false).use { }
                Log.d(TAG, "appendTextFile: rotated path=$path")
            }
            FileOutputStream(file, true).use { it.write(bytes) }
            promise.resolve(file.length().toDouble())
        } catch (error: Throwable) {
            Log.e(TAG, "appendTextFile: failed path=$path", error)
            promise.reject("E_WRITE", error.message, error)
        }
    }
}
