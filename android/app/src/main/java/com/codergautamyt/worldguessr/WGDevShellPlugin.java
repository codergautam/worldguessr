package com.codergautamyt.worldguessr;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WGDevShell")
public class WGDevShellPlugin extends Plugin {

    @PluginMethod
    public void getUrl(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            MainActivity.PREFS_NAME, Activity.MODE_PRIVATE);
        String url = prefs.getString(MainActivity.PREFS_URL_KEY, null);
        JSObject ret = new JSObject();
        ret.put("url", url);
        call.resolve(ret);
    }

    @PluginMethod
    public void setUrlAndRestart(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(
            MainActivity.PREFS_NAME, Activity.MODE_PRIVATE);
        prefs.edit().putString(MainActivity.PREFS_URL_KEY, url).commit();
        call.resolve();
        restart();
    }

    @PluginMethod
    public void clearUrl(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            MainActivity.PREFS_NAME, Activity.MODE_PRIVATE);
        prefs.edit().remove(MainActivity.PREFS_URL_KEY).commit();
        call.resolve();
        restart();
    }

    private void restart() {
        // Tiny delay so the JS resolve gets posted before we kill the process.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Activity activity = getActivity();
            if (activity != null) activity.finishAffinity();
            android.os.Process.killProcess(android.os.Process.myPid());
            System.exit(0);
        }, 100);
    }
}
