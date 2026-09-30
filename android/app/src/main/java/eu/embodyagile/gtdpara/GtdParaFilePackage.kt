package eu.embodyagile.gtdpara

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class GtdParaFilePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            GtdParaFileModule(reactContext),
            GmailImapModule(reactContext),
            TextboxMetricsModule(reactContext),
            PdfModule(reactContext),
            GtdParaRuntimeModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
