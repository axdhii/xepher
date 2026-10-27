package dev.xepher;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Self-update from the private GitHub release: download the APK with Aadhil's
// token, hand it to Android's installer, and restart the bubble afterwards.
public class Updater extends BroadcastReceiver {
    static void install(Context ctx, String assetUrl, String token) throws IOException {
        HttpURLConnection api = (HttpURLConnection) new URL(assetUrl).openConnection();
        api.setInstanceFollowRedirects(false); // the redirect goes to signed storage, which must not get the token
        api.setRequestProperty("Authorization", "Bearer " + token);
        api.setRequestProperty("Accept", "application/octet-stream");
        int code = api.getResponseCode();
        HttpURLConnection file = api;
        if (code / 100 == 3) {
            file = (HttpURLConnection) new URL(api.getHeaderField("Location")).openConnection();
            api.disconnect();
        } else if (code != 200) {
            throw new IOException("GitHub answered " + code);
        }

        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        int id = pi.createSession(params);
        try (PackageInstaller.Session session = pi.openSession(id)) {
            try (InputStream in = file.getInputStream(); OutputStream out = session.openWrite("xepher.apk", 0, -1)) {
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                session.fsync(out);
            }
            // Mutable: the installer fills in the status extras.
            PendingIntent done = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, Updater.class),
                    PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            session.commit(done.getIntentSender());
        } finally {
            file.disconnect();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            // The update killed the bubble; bring it back.
            try {
                ctx.startForegroundService(new Intent(ctx, OverlayService.class));
            } catch (Exception ignored) {
                // Not allowed right now: it comes back next time the app is opened.
            }
            return;
        }
        if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1) == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
