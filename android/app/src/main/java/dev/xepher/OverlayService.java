package dev.xepher;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

// The floating bubble: an overlay window holding a WebView that runs the same
// UI as the Windows app (assets/index.html), plus the native half of the bridge.
public class OverlayService extends Service {
    private static final String CHANNEL = "xepher";
    private static final String ACTION_STOP = "dev.xepher.STOP";

    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private WindowManager.LayoutParams params;
    private WebView web;
    private boolean expanded;
    private int bubbleX, bubbleY;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startInForeground();
        if (web == null) showBubble();
        return START_STICKY;
    }

    private void startInForeground() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Xepher bubble", NotificationManager.IMPORTANCE_MIN));
        PendingIntent stop = PendingIntent.getService(this, 0, new Intent(this, OverlayService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Xepher is on screen")
                .addAction(new Notification.Action.Builder(null, "Hide Xepher", stop).build())
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            // The microphone type lets voice keep working while other apps are in front.
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            try {
                startForeground(1, n, type);
            } catch (SecurityException e) {
                // Restarted by the system from the background, where the mic type isn't allowed.
                startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            }
        } else {
            startForeground(1, n);
        }
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    private void showBubble() {
        wm = getSystemService(WindowManager.class);
        params = new WindowManager.LayoutParams(
                dp(110), dp(110),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        DisplayMetrics m = getResources().getDisplayMetrics();
        params.x = bubbleX = m.widthPixels - dp(120);
        params.y = bubbleY = m.heightPixels / 2;

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "XepherAndroid");
        web.setOnTouchListener(new DragListener());
        // Back collapses the panel.
        web.setOnKeyListener((v, code, e) -> {
            if (code == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP && expanded) {
                js("window.__xepherBack && window.__xepherBack()");
                return true;
            }
            return false;
        });
        // An https origin so localStorage works and GitHub's API accepts the requests.
        web.loadDataWithBaseURL("https://xepher.local/", readAsset("index.html"), "text/html", "utf-8", null);
        wm.addView(web, params);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "<body style='color:red'>Xepher UI missing from the APK: " + e + "</body>";
        }
    }

    private void js(String code) {
        main.post(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    private void speech(String kind, String text) {
        js("window.__xepherSpeech && window.__xepherSpeech(" + JSONObject.quote(kind) + "," + JSONObject.quote(text) + ")");
    }

    private void setExpanded(boolean on) {
        if (on == expanded) return;
        expanded = on;
        DisplayMetrics m = getResources().getDisplayMetrics();
        if (on) {
            bubbleX = params.x;
            bubbleY = params.y;
            params.width = Math.min(m.widthPixels - dp(16), dp(440));
            // Upper part of the screen, so the keyboard doesn't cover the input box.
            params.height = Math.round(m.heightPixels * 0.55f);
            params.x = (m.widthPixels - params.width) / 2;
            params.y = dp(40);
            params.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        } else {
            params.width = dp(110);
            params.height = dp(110);
            params.x = bubbleX;
            params.y = bubbleY;
            params.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        }
        wm.updateViewLayout(web, params);
    }

    // Drag the collapsed bubble around; a tap goes through to the page as a click.
    private class DragListener implements android.view.View.OnTouchListener {
        private final int slop = ViewConfiguration.get(OverlayService.this).getScaledTouchSlop();
        private float downX, downY;
        private int startX, startY;
        private boolean dragging;

        @Override
        public boolean onTouch(android.view.View v, MotionEvent e) {
            if (expanded) return false;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getRawX();
                    downY = e.getRawY();
                    startX = params.x;
                    startY = params.y;
                    dragging = false;
                    return false;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                    if (!dragging && Math.hypot(dx, dy) > slop) {
                        dragging = true;
                        MotionEvent cancel = MotionEvent.obtain(e);
                        cancel.setAction(MotionEvent.ACTION_CANCEL);
                        web.onTouchEvent(cancel);
                        cancel.recycle();
                    }
                    if (!dragging) return false;
                    js("window.__xepherFly && window.__xepherFly(true," + (dx >= 0 ? 1 : -1) + ")");
                    params.x = startX + Math.round(dx);
                    params.y = startY + Math.round(dy);
                    wm.updateViewLayout(web, params);
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (!dragging) return false;
                    dragging = false;
                    js("window.__xepherFly && window.__xepherFly(false,1)");
                    return true;
            }
            return false;
        }
    }

    // window.XepherAndroid in the page (see web/src/bridge.ts). Called off the main thread.
    private class Bridge {
        @JavascriptInterface
        public void setExpanded(boolean on) {
            main.post(() -> OverlayService.this.setExpanded(on));
        }

        @JavascriptInterface
        public void openLink(String url) {
            if (url == null || !url.startsWith("https://")) return;
            main.post(() -> {
                OverlayService.this.setExpanded(false);
                js("window.__xepherBack && window.__xepherBack()");
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            });
        }

        @JavascriptInterface
        public void speak(String text) {
            main.post(() -> {
                if (tts == null) {
                    tts = new TextToSpeech(OverlayService.this, status -> {
                        if (status == TextToSpeech.SUCCESS) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "xepher");
                    });
                } else {
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "xepher");
                }
            });
        }

        @JavascriptInterface
        public void listen() {
            main.post(OverlayService.this::listen);
        }
    }

    private void listen() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            speech("error", "Microphone permission is off. Open the Xepher app to allow it.");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speech("error", "No speech recognition on this phone. Install or enable the Google app.");
            return;
        }
        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle b) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float v) {}
            @Override public void onBufferReceived(byte[] b) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int t, Bundle b) {}

            @Override
            public void onPartialResults(Bundle b) {
                String t = first(b);
                if (t != null) speech("partial", t);
            }

            @Override
            public void onResults(Bundle b) {
                String t = first(b);
                speech("final", t == null ? "" : t);
            }

            @Override
            public void onError(int code) {
                // No match / silence just means nothing was said.
                if (code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) speech("final", "");
                else speech("error", "speech error " + code);
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizer.startListening(i);
    }

    private static String first(Bundle b) {
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() ? null : r.get(0);
    }

    @Override
    public void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (tts != null) tts.shutdown();
        if (web != null) {
            wm.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
