package com.codergautamyt.worldguessr;

import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {

    public static final String PREFS_NAME = "wg_dev";
    public static final String PREFS_URL_KEY = "wg_dev_url";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(WGDevShellPlugin.class);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedUrl = prefs.getString(PREFS_URL_KEY, null);
        if (savedUrl != null && !savedUrl.isEmpty()) {
            // Build a CapConfig with serverUrl set so the bridge boots straight
            // at the dev server. WebView's first load is via Bridge.loadUrl —
            // it does NOT pass through shouldOverrideUrlLoading, so this is
            // immune to the system-browser pop-out problem.
            this.config = new CapConfig.Builder(this)
                .setServerUrl(savedUrl)
                .setHostname("localhost")
                .setAndroidScheme("http")
                .setAllowMixedContent(true)
                .setAllowNavigation(new String[]{"*"})
                .setWebContentsDebuggingEnabled(true)
                .create();
        }

        super.onCreate(savedInstanceState);
    }
}
