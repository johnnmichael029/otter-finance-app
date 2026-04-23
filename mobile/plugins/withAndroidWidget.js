const { withAndroidManifest, withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * OTTER Finance — Android Widget Config Plugin
 * Injects native widget code and resources into the built Android project.
 */

const withWidgetManifest = (config) => {
    return withAndroidManifest(config, async (config) => {
        let androidManifest = config.modResults;

        const mainActivity = androidManifest.manifest.application[0].activity.find(
            (a) => a.$['android:name'] === '.MainActivity'
        );

        // 1. Add Intent Filter for Deep Linking (otter://add)
        if (mainActivity) {
            if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
            
            const hasDeepLink = mainActivity['intent-filter'].some(filter => 
                filter.data && filter.data.some(d => d.$['android:scheme'] === 'otter')
            );

            if (!hasDeepLink) {
                mainActivity['intent-filter'].push({
                    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                    category: [
                        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
                        { $: { 'android:name': 'android.intent.category.BROWSABLE' } }
                    ],
                    data: [{ $: { 'android:scheme': 'otter', 'android:host': 'add' } }]
                });
            }
        }

        // 2. Add the Widget Receiver
        const receiver = {
            $: {
                'android:name': '.OtterWidget',
                'android:exported': 'false',
                'android:label': 'OTTER Balance'
            },
            'intent-filter': [
                {
                    action: [
                        { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
                        { $: { 'android:name': 'com.otter.finance.UPDATE_WIDGET' } }
                    ]
                }
            ],
            'meta-data': [
                {
                    $: {
                        'android:name': 'android.appwidget.provider',
                        'android:resource': '@xml/otter_widget_info'
                    }
                }
            ]
        };

        if (!androidManifest.manifest.application[0].receiver) {
            androidManifest.manifest.application[0].receiver = [];
        }

        const existing = androidManifest.manifest.application[0].receiver.find(
            (r) => r.$['android:name'] === '.OtterWidget'
        );

        if (!existing) {
            androidManifest.manifest.application[0].receiver.push(receiver);
        }

        return config;
    });
};

const withWidgetResources = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const resDir = path.join(projectRoot, 'android/app/src/main/res');
            const javaDir = path.join(projectRoot, 'android/app/src/main/java/com/otter/finance');

            const widgetPluginRoot = path.join(projectRoot, 'plugins/android-widget');

            // 1. Copy Native Java Files
            if (!fs.existsSync(javaDir)) fs.mkdirSync(javaDir, { recursive: true });
            ['OtterWidget.java', 'WidgetBridge.java', 'WidgetPackage.java'].forEach(file => {
                const src = path.join(widgetPluginRoot, 'src', file);
                const dest = path.join(javaDir, file);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, dest);
                }
            });

            // 2. Copy XML Layouts & Metadata
            const copyDir = (sub) => {
                const src = path.join(widgetPluginRoot, 'res', sub);
                const dest = path.join(resDir, sub);
                if (fs.existsSync(src)) {
                    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                    const files = fs.readdirSync(src);
                    files.forEach(f => fs.copyFileSync(path.join(src, f), path.join(dest, f)));
                }
            };

            copyDir('layout');
            copyDir('xml');
            copyDir('drawable');

            return config;
        }
    ]);
};

// 3. Register WidgetPackage in MainApplication.java
const withWidgetPackage = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const mainAppPath = path.join(projectRoot, 'android/app/src/main/java/com/otter/finance/MainApplication.java');
            
            if (fs.existsSync(mainAppPath)) {
                let content = fs.readFileSync(mainAppPath, 'utf8');
                
                if (!content.includes('new WidgetPackage()')) {
                    // Try to find the packages list in MainApplication
                    content = content.replace(
                        /return PackageList\(this\)\.getPackages\(\)\.apply \{/,
                        'List<ReactPackage> packages = new PackageList(this).getPackages();\n      packages.add(new WidgetPackage());\n      return packages;'
                    );
                    
                    // Fallback for newer RN versions
                    if (!content.includes('new WidgetPackage()')) {
                        content = content.replace(
                            /new PackageList\(this\)\.getPackages\(\)/,
                            'new PackageList(this).getPackages().apply { add(new WidgetPackage()) }'
                        );
                    }

                    // For standard old-style list if any
                    content = content.replace(
                        /return Arrays\.<ReactPackage>asList\(/,
                        'return Arrays.<ReactPackage>asList(\n          new WidgetPackage(),'
                    );

                    fs.writeFileSync(mainAppPath, content);
                }
            }
            return config;
        }
    ]);
};

module.exports = (config) => {
    return withPlugins(config, [withWidgetManifest, withWidgetResources, withWidgetPackage]);
};
