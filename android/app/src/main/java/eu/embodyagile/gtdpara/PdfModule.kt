package eu.embodyagile.gtdpara

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.Deflater
import java.util.zip.DeflaterOutputStream

/**
 * gtdpara's own PDF writer (docs/dev/technical-design-project-close-out.md §2.1),
 * grown out of the 2026-09-28 spike's ArchivePdfModule. sn-plugin-lib has no
 * PDF API and Android's PdfDocument can't write link annotations or
 * bookmarks, so this is a small hand-rolled PDF 1.4 writer. Nothing here
 * knows about projects or archives - storage/pdfExport.ts is the generic
 * client, the close-out wizard one caller of that.
 *
 * - buildPdf(jobId, specJson, outPath, overwrite): text pages (Helvetica/WinAnsi),
 *   image pages (PNG/JPEG layers composited on white with DARKEN, Flate
 *   grayscale or JPEG), internal links, nested bookmarks. Emits
 *   "GtdParaPdfProgress" {jobId, done, total} after every image page; stops
 *   on cancelBuild(jobId). Writes `<outPath>.part` and renames at the end -
 *   a cancelled or failed run deletes the .part and leaves nothing behind.
 *   `overwrite` replaces an existing *.pdf at outPath - only after the new
 *   file is complete, so a failed rebuild keeps the old PDF.
 * - pdfInfo / renderPdfPage: groundwork for including existing PDFs (v2) -
 *   unused in v1 (spike decision: PDFs stay separate files).
 * - fileInfo / imageInfo: small helpers (listFolderEntries hides .mark files;
 *   image pages need pixel dimensions).
 *
 * Long calls run on their own thread so they don't block the shared
 * native-module queue. Logs under the "GtdParaPdf" tag.
 */
class PdfModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "GtdParaPdf"
        const val PROGRESS_EVENT = "GtdParaPdfProgress"
        private val cancelled = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicBoolean>()
    }

    init {
        PluginRuntimeGuard.onModuleCreated("GtdParaPdf")
    }

    override fun getName(): String = "GtdParaPdf"

    /**
     * The React instance is going away (plugin reload/update): ask every
     * running buildPdf of THIS build to stop after its current page, so no
     * worker thread keeps running old-build code after teardown
     * (docs/dev/technical-design-host-update-crash.md).
     */
    override fun invalidate() {
        PluginRuntimeGuard.onModuleInvalidated("GtdParaPdf")
        cancelled.values.forEach { it.set(true) }
        super.invalidate()
    }

    /** Required by NativeEventEmitter on the JS side; events go out via DeviceEventEmitter, so nothing to track here. */
    @ReactMethod
    fun addListener(eventName: String?) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /** Asks a running buildPdf to stop after its current page. Resolves false if no such job is running. */
    @ReactMethod
    fun cancelBuild(jobId: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.cancelBuild")
        val flag = cancelled[jobId ?: ""]
        flag?.set(true)
        promise.resolve(flag != null)
    }

    private fun emitProgress(jobId: String, done: Int, total: Int) {
        try {
            val map = WritableNativeMap()
            map.putString("jobId", jobId)
            map.putInt("done", done)
            map.putInt("total", total)
            reactContext
                .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(PROGRESS_EVENT, map)
        } catch (e: Throwable) {
            Log.w(TAG, "emitProgress failed: ${e.message}")
        }
    }

    @ReactMethod
    fun fileInfo(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.fileInfo")
        try {
            val f = File(path ?: "")
            val map = WritableNativeMap()
            map.putBoolean("exists", f.exists())
            map.putBoolean("isFile", f.isFile)
            map.putDouble("bytes", if (f.exists()) f.length().toDouble() else 0.0)
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("E_INFO", e.message, e)
        }
    }

    @ReactMethod
    fun imageInfo(path: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.imageInfo")
        try {
            val f = File(path ?: "")
            val map = WritableNativeMap()
            map.putBoolean("exists", f.exists())
            map.putDouble("bytes", if (f.exists()) f.length().toDouble() else 0.0)
            if (f.exists()) {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(f.absolutePath, opts)
                map.putInt("width", opts.outWidth)
                map.putInt("height", opts.outHeight)
                // Samples a few pixels to tell a transparent background apart
                // from a white one (S1/S2 in the spike doc).
                val bmp = BitmapFactory.decodeFile(f.absolutePath)
                if (bmp != null) {
                    map.putBoolean("hasAlpha", bmp.hasAlpha())
                    val corner = bmp.getPixel(2, 2)
                    map.putInt("cornerAlpha", Color.alpha(corner))
                    map.putInt("cornerGray", (Color.red(corner) + Color.green(corner) + Color.blue(corner)) / 3)
                    bmp.recycle()
                }
            }
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("E_INFO", e.message, e)
        }
    }

    /**
     * Page count and page sizes (points) of an existing PDF, WITHOUT
     * rendering anything - cheap, and lets the caller log sizes before a
     * render that might exhaust memory (spike run 2 died inside
     * renderPdfPages on a large-format "Werkplan" PDF).
     */
    @ReactMethod
    fun pdfInfo(pdfPath: String?, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.pdfInfo")
        Thread {
            var pfd: ParcelFileDescriptor? = null
            var renderer: PdfRenderer? = null
            try {
                pfd = ParcelFileDescriptor.open(File(pdfPath!!), ParcelFileDescriptor.MODE_READ_ONLY)
                renderer = PdfRenderer(pfd)
                val result = WritableNativeMap()
                result.putInt("totalPages", renderer.pageCount)
                val pages = WritableNativeArray()
                for (i in 0 until renderer.pageCount) {
                    val page = renderer.openPage(i)
                    val entry = WritableNativeMap()
                    entry.putInt("widthPt", page.width)
                    entry.putInt("heightPt", page.height)
                    page.close()
                    pages.pushMap(entry)
                }
                result.putArray("pages", pages)
                promise.resolve(result)
            } catch (e: Throwable) {
                Log.e(TAG, "pdfInfo failed $pdfPath", e)
                promise.reject("E_INFO", "${e.javaClass.simpleName}: ${e.message}", e)
            } finally {
                try { renderer?.close() } catch (_: Throwable) {}
                try { pfd?.close() } catch (_: Throwable) {}
            }
        }.start()
    }

    /**
     * Renders ONE page of an existing PDF to [pngPath]. The scale is
     * [dpi]/72, capped so the longer side is at most [maxLongSidePx] pixels:
     * large-format pages (A1/A0 plans) would otherwise need 100+ MB bitmaps.
     * Resolves {png, widthPt, heightPt, pxW, pxH, ms}.
     */
    @ReactMethod
    fun renderPdfPage(pdfPath: String?, pageIndex: Int, pngPath: String?, dpi: Int, maxLongSidePx: Int, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.renderPdfPage")
        Thread {
            var pfd: ParcelFileDescriptor? = null
            var renderer: PdfRenderer? = null
            var bmp: Bitmap? = null
            try {
                val started = System.currentTimeMillis()
                pfd = ParcelFileDescriptor.open(File(pdfPath!!), ParcelFileDescriptor.MODE_READ_ONLY)
                renderer = PdfRenderer(pfd)
                val page = renderer.openPage(pageIndex)
                val wPt = page.width
                val hPt = page.height
                val scale = minOf(dpi / 72.0, maxLongSidePx.toDouble() / maxOf(wPt, hPt).toDouble())
                val pxW = maxOf(1, Math.round(wPt * scale).toInt())
                val pxH = maxOf(1, Math.round(hPt * scale).toInt())
                Log.d(TAG, "renderPdfPage: page $pageIndex ${wPt}x${hPt}pt -> ${pxW}x${pxH}px")
                bmp = Bitmap.createBitmap(pxW, pxH, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                page.close()
                val out = File(pngPath!!)
                out.parentFile?.mkdirs()
                FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                val entry = WritableNativeMap()
                entry.putString("png", out.absolutePath)
                entry.putInt("widthPt", wPt)
                entry.putInt("heightPt", hPt)
                entry.putInt("pxW", pxW)
                entry.putInt("pxH", pxH)
                entry.putDouble("ms", (System.currentTimeMillis() - started).toDouble())
                promise.resolve(entry)
            } catch (e: Throwable) {
                Log.e(TAG, "renderPdfPage failed $pdfPath #$pageIndex", e)
                promise.reject("E_RENDER", "${e.javaClass.simpleName}: ${e.message}", e)
            } finally {
                try { bmp?.recycle() } catch (_: Throwable) {}
                try { renderer?.close() } catch (_: Throwable) {}
                try { pfd?.close() } catch (_: Throwable) {}
            }
        }.start()
    }

    /**
     * Builds a PDF from a JSON spec. Coordinates are in PDF points with a
     * TOP-LEFT origin (converted here):
     *
     * {
     *   title: string,
     *   encoding: "flate" | "jpeg", jpegQuality?: number,
     *   pages: [
     *     {kind: "text", w, h, items: [{text, x, y, size, bold?}],
     *      links?: [{x, y, w, h, page}]},          // page = 0-based target
     *     {kind: "image", w, h, layers: [pngPath, ...]}  // bottom to top
     *   ],
     *   outline?: [{title, page, children?: [...]}]
     * }
     *
     * Resolves {bytes, pages, totalMs, imageMs: [...], missingLayers: n}.
     */
    @ReactMethod
    fun buildPdf(jobId: String?, specJson: String?, outPath: String?, overwrite: Boolean, promise: Promise) {
        PluginRuntimeGuard.trace("GtdParaPdf.buildPdf")
        val id = jobId ?: ""
        val flag = java.util.concurrent.atomic.AtomicBoolean(false)
        cancelled[id] = flag
        Thread {
            val started = System.currentTimeMillis()
            var part: File? = null
            try {
                val spec = JSONObject(specJson ?: "{}")
                val out = File(outPath!!)
                if (out.exists() && !(overwrite && out.isFile && out.name.lowercase().endsWith(".pdf"))) {
                    promise.reject("E_EXISTS", "Output already exists: $outPath")
                    return@Thread
                }
                out.parentFile?.mkdirs()
                // The unfinished file lives in the plugin's private temp folder
                // (no permission needed, never visible to the user). Only the
                // complete PDF is then COPIED to [out] - a write that replaces
                // an existing file's content (the user confirmed that in JS
                // when [overwrite] is set). No delete and no rename in shared
                // storage, so FILE:DELETE is never needed (InkHub design §3.4).
                val tmpDir = GtdParaFileModule.privateTmpDir(reactContext)
                tmpDir.mkdirs()
                val partFile = File(tmpDir, "$id.pdf.part")
                part = partFile
                if (partFile.exists()) partFile.delete()
                val stats = PdfWriter(partFile, spec, { flag.get() }) { done, total -> emitProgress(id, done, total) }.write()
                try {
                    partFile.inputStream().use { input ->
                        FileOutputStream(out, false).use { output -> input.copyTo(output) }
                    }
                } catch (e: Throwable) {
                    Log.e(TAG, "buildPdf: copying the finished PDF to $outPath failed", e)
                    promise.reject("E_WRITE", "Could not write ${out.name}: ${e.message}", e)
                    return@Thread
                } finally {
                    partFile.delete()
                }
                val map = WritableNativeMap()
                map.putDouble("bytes", out.length().toDouble())
                map.putInt("pages", stats.pageCount)
                map.putDouble("totalMs", (System.currentTimeMillis() - started).toDouble())
                val imageMs = WritableNativeArray()
                stats.imageMs.forEach { imageMs.pushDouble(it.toDouble()) }
                map.putArray("imageMs", imageMs)
                map.putInt("missingLayers", stats.missingLayers)
                promise.resolve(map)
            } catch (e: PdfCancelled) {
                part?.delete()
                promise.reject("E_CANCELLED", "PDF creation was cancelled")
            } catch (e: Throwable) {
                part?.delete()
                Log.e(TAG, "buildPdf failed $outPath", e)
                promise.reject("E_BUILD", "${e.javaClass.simpleName}: ${e.message}", e)
            } finally {
                cancelled.remove(id)
            }
        }.start()
    }
}

private class PdfCancelled : RuntimeException("cancelled")

private class PdfStats(val pageCount: Int, val imageMs: List<Long>, val missingLayers: Int)

private class OutlineNode(
    val title: String,
    val page: Int,
    val children: List<OutlineNode>,
) {
    var id = 0
}

/**
 * Two-pass writer: first allocates every object id (so links and bookmarks
 * can reference pages that come later), then streams the objects out with
 * byte offsets recorded for the xref table. Only one page image is held in
 * memory at a time.
 */
private class PdfWriter(
    file: File,
    private val spec: JSONObject,
    private val isCancelled: () -> Boolean,
    private val onImagePage: (done: Int, total: Int) -> Unit,
) {
    private val out = BufferedOutputStream(FileOutputStream(file), 1 shl 16)
    private var pos = 0L
    private val offsets = HashMap<Int, Long>()
    private var nextId = 1
    private fun alloc(): Int = nextId++

    private val winAnsi: Charset = try {
        Charset.forName("windows-1252")
    } catch (_: Throwable) {
        Charsets.ISO_8859_1
    }

    private fun w(s: String) {
        val b = s.toByteArray(Charsets.ISO_8859_1)
        out.write(b)
        pos += b.size
    }

    private fun wb(b: ByteArray) {
        out.write(b)
        pos += b.size
    }

    private fun begin(id: Int) {
        offsets[id] = pos
        w("$id 0 obj\n")
    }

    private fun end() = w("endobj\n")

    private fun num(v: Double): String {
        val r = Math.round(v * 100.0) / 100.0
        return if (r == Math.floor(r)) r.toLong().toString() else r.toString()
    }

    /** WinAnsi hex string; unmappable characters become '?'. */
    private fun ansiHex(s: String): String {
        val enc = winAnsi.newEncoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
            .replaceWith(byteArrayOf('?'.code.toByte()))
        val buf: ByteBuffer = enc.encode(CharBuffer.wrap(s))
        val sb = StringBuilder("<")
        while (buf.hasRemaining()) sb.append(String.format("%02X", buf.get().toInt() and 0xFF))
        return sb.append(">").toString()
    }

    /** UTF-16BE hex string with BOM - used for bookmarks and document info. */
    private fun utf16Hex(s: String): String {
        val sb = StringBuilder("<FEFF")
        for (b in s.toByteArray(Charsets.UTF_16BE)) sb.append(String.format("%02X", b.toInt() and 0xFF))
        return sb.append(">").toString()
    }

    private fun parseOutline(arr: JSONArray?): List<OutlineNode> {
        if (arr == null) return emptyList()
        val list = ArrayList<OutlineNode>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            list.add(OutlineNode(o.optString("title"), o.optInt("page", 0), parseOutline(o.optJSONArray("children"))))
        }
        return list
    }

    private fun assignOutlineIds(nodes: List<OutlineNode>) {
        for (n in nodes) {
            n.id = alloc()
            assignOutlineIds(n.children)
        }
    }

    private fun countAll(nodes: List<OutlineNode>): Int = nodes.sumOf { 1 + countAll(it.children) }

    fun write(): PdfStats {
        val pages = spec.getJSONArray("pages")
        val pageCount = pages.length()
        val encoding = spec.optString("encoding", "flate")
        val jpegQuality = spec.optInt("jpegQuality", 80)

        // Pass 1: ids.
        val catalogId = alloc()
        val pagesId = alloc()
        val fontId = alloc()
        val fontBoldId = alloc()
        val infoId = alloc()
        val outline = parseOutline(spec.optJSONArray("outline"))
        val outlinesId = if (outline.isNotEmpty()) alloc() else 0
        val pageIds = IntArray(pageCount)
        val contentIds = IntArray(pageCount)
        val imageIds = IntArray(pageCount)
        val annotIds = ArrayList<IntArray>()
        for (i in 0 until pageCount) {
            val p = pages.getJSONObject(i)
            pageIds[i] = alloc()
            contentIds[i] = alloc()
            imageIds[i] = if (p.optString("kind") == "image") alloc() else 0
            val links = p.optJSONArray("links")
            annotIds.add(IntArray(links?.length() ?: 0) { alloc() })
        }
        assignOutlineIds(outline)

        // Pass 2: objects.
        w("%PDF-1.4\n")
        wb(byteArrayOf('%'.code.toByte(), 0xE2.toByte(), 0xE3.toByte(), 0xCF.toByte(), 0xD3.toByte(), '\n'.code.toByte()))

        begin(catalogId)
        w("<< /Type /Catalog /Pages $pagesId 0 R")
        if (outlinesId != 0) w(" /Outlines $outlinesId 0 R /PageMode /UseOutlines")
        w(" >>\n")
        end()

        begin(pagesId)
        w("<< /Type /Pages /Count $pageCount /Kids [")
        pageIds.forEach { w("$it 0 R ") }
        w("] >>\n")
        end()

        begin(fontId)
        w("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n")
        end()
        begin(fontBoldId)
        w("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n")
        end()

        begin(infoId)
        val date = SimpleDateFormat("yyyyMMddHHmmss", Locale.US).format(Date())
        w("<< /Title ${utf16Hex(spec.optString("title", ""))} /Producer (gtdpara) /CreationDate (D:$date) >>\n")
        end()

        val imageMs = ArrayList<Long>()
        var missingLayers = 0
        val imageTotal = imageIds.count { it != 0 }
        var imageDone = 0
        for (i in 0 until pageCount) {
            if (isCancelled()) {
                out.close()
                throw PdfCancelled()
            }
            val p = pages.getJSONObject(i)
            val pw = p.getDouble("w")
            val ph = p.getDouble("h")
            val kind = p.optString("kind")

            // Content stream.
            val content = StringBuilder()
            if (kind == "image") {
                content.append("q ${num(pw)} 0 0 ${num(ph)} 0 0 cm /Im0 Do Q\n")
            } else {
                val items = p.optJSONArray("items") ?: JSONArray()
                for (k in 0 until items.length()) {
                    val it = items.getJSONObject(k)
                    val size = it.optDouble("size", 11.0)
                    val font = if (it.optBoolean("bold")) "/F2" else "/F1"
                    val x = it.optDouble("x")
                    val y = ph - it.optDouble("y") - size // top-left -> baseline
                    content.append("BT $font ${num(size)} Tf ${num(x)} ${num(y)} Td ${ansiHex(it.optString("text"))} Tj ET\n")
                }
            }
            val contentBytes = content.toString().toByteArray(Charsets.ISO_8859_1)

            begin(pageIds[i])
            w("<< /Type /Page /Parent $pagesId 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}]")
            w(" /Resources << /Font << /F1 $fontId 0 R /F2 $fontBoldId 0 R >>")
            if (imageIds[i] != 0) w(" /XObject << /Im0 ${imageIds[i]} 0 R >>")
            w(" >> /Contents ${contentIds[i]} 0 R")
            if (annotIds[i].isNotEmpty()) {
                w(" /Annots [")
                annotIds[i].forEach { w("$it 0 R ") }
                w("]")
            }
            w(" >>\n")
            end()

            begin(contentIds[i])
            w("<< /Length ${contentBytes.size} >>\nstream\n")
            wb(contentBytes)
            w("\nendstream\n")
            end()

            if (imageIds[i] != 0) {
                val started = System.currentTimeMillis()
                val layers = p.optJSONArray("layers") ?: JSONArray()
                val composed = composeLayers(layers) { missingLayers++ }
                begin(imageIds[i])
                if (composed == null) {
                    // No usable layer at all: a 1x1 white placeholder keeps the PDF valid.
                    w("<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n")
                    wb(byteArrayOf(0xFF.toByte()))
                    w("\nendstream\n")
                } else if (encoding == "jpeg") {
                    val baos = ByteArrayOutputStream()
                    composed.compress(Bitmap.CompressFormat.JPEG, jpegQuality, baos)
                    val bytes = baos.toByteArray()
                    w("<< /Type /XObject /Subtype /Image /Width ${composed.width} /Height ${composed.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.size} >>\nstream\n")
                    wb(bytes)
                    w("\nendstream\n")
                } else {
                    val bytes = grayFlate(composed)
                    w("<< /Type /XObject /Subtype /Image /Width ${composed.width} /Height ${composed.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${bytes.size} >>\nstream\n")
                    wb(bytes)
                    w("\nendstream\n")
                }
                end()
                composed?.recycle()
                imageMs.add(System.currentTimeMillis() - started)
                imageDone++
                onImagePage(imageDone, imageTotal)
            }

            val links = p.optJSONArray("links")
            for (k in annotIds[i].indices) {
                val l = links!!.getJSONObject(k)
                val x1 = l.getDouble("x")
                val yTop = l.getDouble("y")
                val x2 = x1 + l.getDouble("w")
                val y2 = ph - yTop
                val y1 = y2 - l.getDouble("h")
                val target = l.getInt("page").coerceIn(0, pageCount - 1)
                begin(annotIds[i][k])
                w("<< /Type /Annot /Subtype /Link /Rect [${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)}] /Border [0 0 0] /Dest [${pageIds[target]} 0 R /Fit] >>\n")
                end()
            }
        }

        if (outlinesId != 0) {
            begin(outlinesId)
            w("<< /Type /Outlines /First ${outline.first().id} 0 R /Last ${outline.last().id} 0 R /Count ${countAll(outline)} >>\n")
            end()
            writeOutline(outline, outlinesId, pageIds, pageCount)
        }

        val xrefPos = pos
        val size = nextId
        w("xref\n0 $size\n0000000000 65535 f \n")
        for (id in 1 until size) {
            w(String.format(Locale.US, "%010d 00000 n \n", offsets[id] ?: 0L))
        }
        w("trailer\n<< /Size $size /Root $catalogId 0 R /Info $infoId 0 R >>\nstartxref\n$xrefPos\n%%EOF\n")
        out.flush()
        out.close()
        return PdfStats(pageCount, imageMs, missingLayers)
    }

    private fun writeOutline(nodes: List<OutlineNode>, parentId: Int, pageIds: IntArray, pageCount: Int) {
        for ((idx, n) in nodes.withIndex()) {
            val target = n.page.coerceIn(0, pageCount - 1)
            begin(n.id)
            w("<< /Title ${utf16Hex(n.title)} /Parent $parentId 0 R")
            if (idx > 0) w(" /Prev ${nodes[idx - 1].id} 0 R")
            if (idx < nodes.size - 1) w(" /Next ${nodes[idx + 1].id} 0 R")
            if (n.children.isNotEmpty()) {
                // Negative count = collapsed by default.
                w(" /First ${n.children.first().id} 0 R /Last ${n.children.last().id} 0 R /Count -${countAll(n.children)}")
            }
            w(" /Dest [${pageIds[target]} 0 R /Fit] >>\n")
            end()
            writeOutline(n.children, n.id, pageIds, pageCount)
        }
    }

    /**
     * Composites PNG layers (bottom to top) onto white at the first readable
     * layer's size, using DARKEN rather than plain alpha-over. Spike run 1
     * (2026-09-28) showed generateNotePng's "transparent" type 0 actually
     * comes back opaque white, which would cover the template underneath.
     * DARKEN keeps the darker pixel of each layer, so white content lets the
     * template show through, and it also behaves correctly for genuinely
     * transparent pixels (and .mark overlays).
     */
    private fun composeLayers(layers: JSONArray, onMissing: () -> Unit): Bitmap? {
        var canvasBmp: Bitmap? = null
        var canvas: Canvas? = null
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.DARKEN)
        for (k in 0 until layers.length()) {
            val path = layers.optString(k)
            val f = File(path)
            if (!f.exists()) {
                onMissing()
                continue
            }
            val layer = BitmapFactory.decodeFile(path)
            if (layer == null) {
                onMissing()
                continue
            }
            if (canvasBmp == null) {
                canvasBmp = Bitmap.createBitmap(layer.width, layer.height, Bitmap.Config.ARGB_8888)
                canvasBmp.eraseColor(Color.WHITE)
                canvas = Canvas(canvasBmp)
            }
            canvas!!.drawBitmap(layer, null, Rect(0, 0, canvasBmp.width, canvasBmp.height), paint)
            layer.recycle()
        }
        return canvasBmp
    }

    private fun grayFlate(bmp: Bitmap): ByteArray {
        val w = bmp.width
        val h = bmp.height
        val row = IntArray(w)
        val gray = ByteArray(w)
        val baos = ByteArrayOutputStream()
        DeflaterOutputStream(baos, Deflater(6), 1 shl 16).use { dos ->
            for (y in 0 until h) {
                bmp.getPixels(row, 0, w, 0, y, w, 1)
                for (x in 0 until w) {
                    val c = row[x]
                    gray[x] = ((((c shr 16) and 0xFF) * 299 + ((c shr 8) and 0xFF) * 587 + (c and 0xFF) * 114) / 1000).toByte()
                }
                dos.write(gray)
            }
        }
        return baos.toByteArray()
    }
}
