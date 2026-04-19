package watch.shiru;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.ViewCompat;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {

    super.onCreate(savedInstanceState);

    // Fixes older Android behavior where status bar prevents true overlay ensuring WebView can render behind the status bar correctly.
    ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (view, insets) -> {
      getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
              | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
      return insets;
    });

    bridge.getWebView().addJavascriptInterface(new NativeBridge(this), "NativeBridge");

    ServiceWorkerController swController = ServiceWorkerController.getInstance();
    swController.setServiceWorkerClient(new ServiceWorkerClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
        if (request.getUrl().toString().contains("index.html")) {
          request.getRequestHeaders().put("Accept", "text/html");
        }
        return bridge.getLocalServer().shouldInterceptRequest(request);
      }
    });
  }
}