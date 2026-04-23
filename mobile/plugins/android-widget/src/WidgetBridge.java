package com.otter.finance;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class WidgetBridge extends ReactContextBaseJavaModule {
    private static final String PREFS_NAME = "OtterWidgetPrefs";
    private static final String KEY_BALANCE = "total_balance";

    public WidgetBridge(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "WidgetBridge";
    }

    @ReactMethod
    public void updateBalance(String balance) {
        Context context = getReactApplicationContext();
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        editor.putString(KEY_BALANCE, balance);
        editor.apply();

        // Notify the widget provider to refresh the UI
        Intent intent = new Intent(context, OtterWidget.class);
        intent.setAction("com.otter.finance.UPDATE_WIDGET");
        context.sendBroadcast(intent);
    }
}
