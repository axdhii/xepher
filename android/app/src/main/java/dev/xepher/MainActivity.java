package dev.xepher;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

// Asks for the two permissions Xepher needs (draw over apps, microphone),
// then starts the floating bubble and gets out of the way.
public class MainActivity extends Activity {
    private TextView text;
    private Button button;
    private boolean askedRuntime;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        text = new TextView(this);
        text.setTextSize(17);
        text.setGravity(Gravity.CENTER);
        button = new Button(this);
        layout.addView(text);
        layout.addView(button);
        setContentView(layout);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Settings.canDrawOverlays(this)) {
            text.setText("Xepher floats over your other apps.\n\nTap below, find Xepher, and turn on \"Allow display over other apps\".");
            button.setText("Allow floating");
            button.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))));
            return;
        }
        if (!askedRuntime) {
            askedRuntime = true;
            String[] perms = Build.VERSION.SDK_INT >= 33
                    ? new String[] {Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS}
                    : new String[] {Manifest.permission.RECORD_AUDIO};
            requestPermissions(perms, 1);
            return;
        }
        start();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        start(); // the voice button explains itself if the mic was refused
    }

    private void start() {
        startForegroundService(new Intent(this, OverlayService.class));
        finish();
    }
}
