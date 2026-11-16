package es.compass.movil;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;

/**
 * Compass para Android. La interfaz es la página de assets/www (la misma estética que Compass Launcher);
 * esta clase solo pone lo que una web no puede hacer: escanear el QR, mandar el «paquete mágico»
 * para encender el PC (Wake-on-LAN), guardar los datos del emparejamiento y abrir enlaces.
 */
public class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences prefs;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("compass", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.parseColor("#15111D"));
        getWindow().setNavigationBarColor(Color.parseColor("#15111D"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#15111D"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith("file:")) return false;
                openUrl(u);   // los enlaces de fuera se abren en el navegador
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onResume && window.onResume()", null);
        // volviendo de dar el permiso de «instalar apps de esta fuente»: se sigue con la instalación
        if (pendingApk != null && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) { File f = pendingApk; pendingApk = null; installApk(f); }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? String(window.onBack()) : 'false'", v -> {
            if (v == null || !v.contains("true")) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        IntentResult r = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (r != null) {
            if (r.getContents() != null) js("window.onScan && window.onScan(" + JSONObject.quote(r.getContents()) + ")");
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

    private void openUrl(String u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); }
        catch (Exception e) { Toast.makeText(this, "No hay navegador para abrir el enlace", Toast.LENGTH_SHORT).show(); }
    }

    /** Paquete mágico: 6 bytes 0xFF y la MAC repetida 16 veces. */
    private static byte[] magic(String mac) {
        String hex = mac.replaceAll("[^0-9A-Fa-f]", "");
        if (hex.length() != 12) throw new IllegalArgumentException("MAC no válida");
        byte[] m = new byte[6];
        for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        byte[] p = new byte[6 + 16 * 6];
        for (int i = 0; i < 6; i++) p[i] = (byte) 0xFF;
        for (int i = 6; i < p.length; i += 6) System.arraycopy(m, 0, p, i, 6);
        return p;
    }

    /** Abre el instalador de Android con el APK descargado (si falta el permiso, lleva a activarlo). */
    private void installApk(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingApk = apk;
            js("window.onUpdState && window.onUpdState('permiso')");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        Uri u = FileProvider.getUriForFile(this, getPackageName() + ".archivos", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(u, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        js("window.onUpdState && window.onUpdState('instalando')");
    }
    private File pendingApk = null;

    private class Bridge {
        @JavascriptInterface public String get(String k) { return prefs.getString(k, null); }
        @JavascriptInterface public void set(String k, String v) { prefs.edit().putString(k, v).apply(); }
        @JavascriptInterface public void del(String k) { prefs.edit().remove(k).apply(); }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public String device() { return (Build.MANUFACTURER + " " + Build.MODEL).trim(); }
        @JavascriptInterface public void open(String url) { runOnUiThread(() -> openUrl(url)); }
        @JavascriptInterface public void toast(String m) { runOnUiThread(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show()); }

        @JavascriptInterface public void copy(String t) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Compass", t));
            });
        }

        @JavascriptInterface public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(10, ms), VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(Math.max(10, ms));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface public String net() {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null || cm.getActiveNetwork() == null) return "none";
            NetworkCapabilities c = cm.getNetworkCapabilities(cm.getActiveNetwork());
            if (c == null) return "none";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "wifi";
            return "mobile";
        }

        @JavascriptInterface public void scan() {
            runOnUiThread(() -> {
                IntentIntegrator ii = new IntentIntegrator(MainActivity.this);
                ii.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE);
                ii.setPrompt("Apunta al código de Compass (Ajustes › App del móvil, en tu PC)");
                ii.setBeepEnabled(false);
                ii.setOrientationLocked(false);
                ii.initiateScan();
            });
        }

        /** Manda el paquete mágico a varias direcciones (red de casa y router) varias veces. */
        @JavascriptInterface public String wake(String mac, String targetsJson) {
            final byte[] p;
            try { p = magic(mac); } catch (Exception e) { return "MAC no válida"; }
            new Thread(() -> {
                WifiManager.MulticastLock lock = null;
                try {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) { lock = wm.createMulticastLock("compass-wol"); lock.acquire(); }
                } catch (Exception ignored) { }
                try (DatagramSocket sock = new DatagramSocket()) {
                    sock.setBroadcast(true);
                    JSONArray t = new JSONArray(targetsJson);
                    for (int round = 0; round < 3; round++) {
                        for (int i = 0; i < t.length(); i++) {
                            try {
                                String hp = t.getString(i);
                                int c = hp.lastIndexOf(':');
                                String host = c > 0 ? hp.substring(0, c) : hp;
                                int port = c > 0 ? Integer.parseInt(hp.substring(c + 1)) : 9;
                                sock.send(new DatagramPacket(p, p.length, InetAddress.getByName(host), port));
                            } catch (Exception ignored) { }
                        }
                        Thread.sleep(250);
                    }
                } catch (Exception ignored) {
                } finally { if (lock != null) try { lock.release(); } catch (Exception ignored) { } }
            }).start();
            return "ok";
        }

        /** Descarga la versión nueva de la app (con progreso) y abre el instalador de Android. */
        @JavascriptInterface public void update(String url) {
            new Thread(() -> {
                try {
                    File dir = new File(getCacheDir(), "actualizacion"); dir.mkdirs();
                    File apk = new File(dir, "Compass-Movil.apk"), part = new File(dir, "Compass-Movil.apk.part");
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "CompassMovil/" + BuildConfig.VERSION_NAME);
                    if (c.getResponseCode() != 200) throw new Exception("Error " + c.getResponseCode());
                    long total = c.getContentLengthLong(), got = 0; int last = -1;
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n); got += n;
                            int pct = total > 0 ? (int) (got * 100 / total) : -1;
                            if (pct != last) { last = pct; js("window.onUpdProgress && window.onUpdProgress(" + pct + ")"); }
                        }
                    }
                    if (total > 0 && part.length() != total) throw new Exception("La descarga se cortó");
                    if (apk.exists()) apk.delete();
                    if (!part.renameTo(apk)) throw new Exception("No se pudo guardar");
                    runOnUiThread(() -> installApk(apk));
                } catch (Exception e) {
                    js("window.onUpdState && window.onUpdState(" + JSONObject.quote("error:" + e.getMessage()) + ")");
                }
            }).start();
        }

        /** Lee una URL (la última versión en GitHub) y devuelve el texto a window.onLatest. */
        @JavascriptInterface public void latest(String url) {
            new Thread(() -> {
                String out = "null";
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000); c.setReadTimeout(8000);
                    c.setRequestProperty("Accept", "application/vnd.github+json");
                    c.setRequestProperty("User-Agent", "CompassMovil/" + BuildConfig.VERSION_NAME);
                    if (c.getResponseCode() == 200) {
                        try (InputStream in = c.getInputStream(); ByteArrayOutputStream b = new ByteArrayOutputStream()) {
                            byte[] buf = new byte[8192]; int n;
                            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                            out = b.toString("UTF-8");
                        }
                    }
                } catch (Exception ignored) { }
                js("window.onLatest && window.onLatest(" + JSONObject.quote(out) + ")");
            }).start();
        }
    }
}
