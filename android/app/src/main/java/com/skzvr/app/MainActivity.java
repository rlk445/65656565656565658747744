package com.skzvr.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Mostra o jogo (pasta assets/www) dentro de um WebView, servido em https://appassets.local/ (contexto seguro: câmera, sensores, WebAssembly). */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.local";
    private static final int REQ_CAM = 7;
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("webmanifest", "application/manifest+json");
        MIME.put("wasm", "application/wasm"); MIME.put("png", "image/png"); MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg"); MIME.put("svg", "image/svg+xml"); MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain"); MIME.put("mp3", "audio/mpeg"); MIME.put("wav", "audio/wav");
        MIME.put("woff2", "font/woff2"); MIME.put("glb", "model/gltf-binary");
        MIME.put("tflite", "application/octet-stream"); MIME.put("binarypb", "application/octet-stream");
        MIME.put("data", "application/octet-stream");
    }

    private WebView web;
    private PermissionRequest pendingReq;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (!HOST.equals(r.getUrl().getHost())) return null;      // outros sites passam normalmente
                return serve(r.getUrl().getPath());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(req.getResources());
                    } else {
                        pendingReq = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                    }
                });
            }
        });

        setContentView(web);
        hideBars();
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
        }
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse serve(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return reply(403, "Forbidden", "text/plain", new ByteArrayInputStream("403".getBytes()));
        try {
            InputStream in = getAssets().open("www" + path);
            String name = path.substring(path.lastIndexOf('/') + 1);
            int dot = name.lastIndexOf('.');
            String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
            String type = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            return reply(200, "OK", type, in);
        } catch (IOException e) {
            return reply(404, "Not Found", "text/plain", new ByteArrayInputStream("404".getBytes()));
        }
    }

    private WebResourceResponse reply(int code, String msg, String type, InputStream in) {
        WebResourceResponse r = new WebResourceResponse(type, type.startsWith("text/") || type.contains("json") || type.contains("javascript") ? "utf-8" : null, code, msg, new HashMap<String, String>(), in);
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-cache");
        r.setResponseHeaders(h);
        return r;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_CAM && pendingReq != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingReq.grant(pendingReq.getResources());
            else pendingReq.deny();
            pendingReq = null;
        }
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
