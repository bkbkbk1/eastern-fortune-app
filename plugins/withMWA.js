const { withAndroidManifest } = require('expo/config-plugins');

function withMWA(config) {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    const mainActivity = mainApplication.activity[0];

    // Add intent filter for Solana Mobile Wallet Adapter
    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    // Add solana-wallet intent filter for MWA callback
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [
        { $: { 'android:scheme': 'easternfortune' } },
      ],
    });

    // Ensure launchMode is singleTask for proper MWA redirect
    mainActivity.$['android:launchMode'] = 'singleTask';

    return config;
  });
}

module.exports = withMWA;
