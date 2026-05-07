#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function log(message) {
  console.log(`[native-auth-patch] ${message}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertBeforePlistDictClose(plist, block) {
  return plist.replace(/\n<\/dict>\s*<\/plist>\s*$/, `${block}\n</dict>\n</plist>\n`);
}

function setPlistString(plist, key, value) {
  const pattern = new RegExp(`(<key>${escapeRegExp(key)}<\\/key>\\s*<string>)([^<]*)(<\\/string>)`);
  if (pattern.test(plist)) {
    return plist.replace(pattern, `$1${value}$3`);
  }

  return insertBeforePlistDictClose(plist, `\n\t<key>${key}</key>\n\t<string>${value}</string>`);
}

function ensurePlistGoogleSkAdNetwork(plist) {
  const googleSkAdNetworkId = 'cstr6suwn9.skadnetwork';
  if (plist.includes(googleSkAdNetworkId)) return plist;

  const skAdNetworkEntry = `\n\t\t<dict>\n\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>${googleSkAdNetworkId}</string>\n\t\t</dict>`;
  if (plist.includes('<key>SKAdNetworkItems</key>')) {
    return plist.replace(/(<key>SKAdNetworkItems<\/key>\s*<array>)/, `$1${skAdNetworkEntry}`);
  }

  return insertBeforePlistDictClose(
    plist,
    `\n\t<key>SKAdNetworkItems</key>\n\t<array>${skAdNetworkEntry}\n\t</array>`
  );
}

function ensurePlistAppleSignInEntitlement(plist) {
  if (plist.includes('<key>com.apple.developer.applesignin</key>')) return plist;

  return insertBeforePlistDictClose(
    plist,
    '\n\t<key>com.apple.developer.applesignin</key>\n\t<array>\n\t\t<string>Default</string>\n\t</array>'
  );
}

function defaultGoogleRedirectUri(clientId) {
  if (!clientId?.endsWith('.apps.googleusercontent.com')) return null;
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}:/oauth2redirect`;
}

function getGoogleRedirectParts(platform) {
  const clientId = platform === 'android'
    ? (process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_CLIENT_ID)
    : (process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_CLIENT_ID);
  const redirectUri = platform === 'android'
    ? (process.env.NEXT_PUBLIC_GOOGLE_ANDROID_REDIRECT_URI || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI || defaultGoogleRedirectUri(clientId))
    : (process.env.NEXT_PUBLIC_GOOGLE_IOS_REDIRECT_URI || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI || defaultGoogleRedirectUri(clientId));

  if (!redirectUri) {
    log(`Skipping ${platform} Google URL scheme patch: native Google client ID or redirect URI is not set.`);
    return null;
  }

  const url = new URL(redirectUri);
  const scheme = url.protocol.replace(/:$/, '');
  const redirectPath = url.pathname || '/oauth2redirect';

  if (!scheme) {
    throw new Error(`Invalid NEXT_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI: ${redirectUri}`);
  }

  return { scheme, redirectPath };
}

function patchIosInfoPlist({ scheme }) {
  const infoPlistPath = path.join(root, 'ios', 'App', 'App', 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) {
    log(`iOS Info.plist not found at ${infoPlistPath}; Appflow may not be building iOS in this job.`);
    return;
  }

  let plist = fs.readFileSync(infoPlistPath, 'utf8');
  if (plist.includes(`<string>${scheme}</string>`)) {
    log(`iOS URL scheme already present: ${scheme}`);
    return;
  }

  const urlTypesBlock = `\n\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t<string>Editor</string>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>com.codergautamyt.worldguessr</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`;

  if (plist.includes('<key>CFBundleURLTypes</key>')) {
    plist = plist.replace(
      /(<key>CFBundleURLTypes<\/key>\s*<array>)/,
      `$1\n\t\t<dict>\n\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t<string>Editor</string>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>com.codergautamyt.worldguessr</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>`
    );
  } else {
    plist = plist.replace(/\n<\/dict>\s*<\/plist>\s*$/, `${urlTypesBlock}\n</dict>\n</plist>\n`);
  }

  fs.writeFileSync(infoPlistPath, plist);
  log(`Added iOS URL scheme: ${scheme}`);
}

function patchAndroidManifest({ scheme, redirectPath }) {
  const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    log(`AndroidManifest.xml not found at ${manifestPath}; Appflow may not be building Android in this job.`);
    return;
  }

  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (manifest.includes(`android:scheme="${scheme}"`)) {
    log(`Android URL scheme already present: ${scheme}`);
    return;
  }

  const intentFilter = `\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n\n                <data android:scheme="${scheme}" android:path="${redirectPath}" />\n            </intent-filter>`;

  const mainActivityPattern = /(<activity\b[^>]*(?:android:name="[^"]*MainActivity"|android:name="\.MainActivity")[^>]*>)([\s\S]*?)(<\/activity>)/;
  const firstActivityPattern = /(<activity\b[^>]*>)([\s\S]*?)(<\/activity>)/;
  const pattern = mainActivityPattern.test(manifest) ? mainActivityPattern : firstActivityPattern;

  if (!pattern.test(manifest)) {
    throw new Error(`Could not find an Android <activity> block in ${manifestPath}`);
  }

  manifest = manifest.replace(pattern, `$1$2${intentFilter}\n        $3`);
  fs.writeFileSync(manifestPath, manifest);
  log(`Added Android URL scheme: ${scheme} with path ${redirectPath}`);
}

function getAdMobAppId(platform) {
  if (platform === 'android') {
    return process.env.NEXT_PUBLIC_ADMOB_ANDROID_APP_ID ||
      process.env.NEXT_PUBLIC_ADMOB_APP_ID;
  }

  return process.env.NEXT_PUBLIC_ADMOB_IOS_APP_ID ||
    process.env.NEXT_PUBLIC_ADMOB_APP_ID;
}

function patchIosAdMobInfoPlist(appId) {
  const infoPlistPath = path.join(root, 'ios', 'App', 'App', 'Info.plist');
  if (!fs.existsSync(infoPlistPath)) {
    log(`iOS Info.plist not found at ${infoPlistPath}; Appflow may not be building iOS in this job.`);
    return;
  }

  let plist = fs.readFileSync(infoPlistPath, 'utf8');
  const before = plist;
  plist = setPlistString(plist, 'GADApplicationIdentifier', appId);
  plist = setPlistString(
    plist,
    'NSUserTrackingUsageDescription',
    process.env.IOS_TRACKING_USAGE_DESCRIPTION ||
      process.env.NEXT_PUBLIC_IOS_TRACKING_USAGE_DESCRIPTION ||
      'This identifier will be used to deliver personalized ads to you.'
  );
  plist = ensurePlistGoogleSkAdNetwork(plist);

  if (plist === before) {
    log(`iOS AdMob Info.plist entries already present for app ID ${appId}`);
    return;
  }

  fs.writeFileSync(infoPlistPath, plist);
  log(`Added iOS AdMob Info.plist entries for app ID ${appId}`);
}

function patchIosAppleSignInEntitlements() {
  const iosAppPath = path.join(root, 'ios', 'App', 'App');
  const entitlementsPath = path.join(iosAppPath, 'App.entitlements');
  const projectPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

  if (!fs.existsSync(iosAppPath)) {
    log(`iOS app directory not found at ${iosAppPath}; Appflow may not be building iOS in this job.`);
    return;
  }

  let entitlements = fs.existsSync(entitlementsPath)
    ? fs.readFileSync(entitlementsPath, 'utf8')
    : '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n';
  const beforeEntitlements = entitlements;
  entitlements = ensurePlistAppleSignInEntitlement(entitlements);
  if (entitlements !== beforeEntitlements || !fs.existsSync(entitlementsPath)) {
    fs.writeFileSync(entitlementsPath, entitlements);
    log('Added iOS Sign in with Apple entitlement.');
  } else {
    log('iOS Sign in with Apple entitlement already present.');
  }

  if (!fs.existsSync(projectPath)) {
    log(`iOS Xcode project not found at ${projectPath}; could not verify entitlements file is referenced.`);
    return;
  }

  let project = fs.readFileSync(projectPath, 'utf8');
  if (project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
    log('iOS Xcode project already references App.entitlements.');
    return;
  }

  project = project.replace(/buildSettings = \{/g, 'buildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
  fs.writeFileSync(projectPath, project);
  log('Added App.entitlements reference to iOS Xcode project.');
}

function patchAndroidAdMobManifest(appId) {
  const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    log(`AndroidManifest.xml not found at ${manifestPath}; Appflow may not be building Android in this job.`);
    return;
  }

  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const metaData = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${appId}" />`;
  if (manifest.includes('android:name="com.google.android.gms.ads.APPLICATION_ID"')) {
    manifest = manifest.replace(
      /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="[^"]*"\s*\/>/,
      metaData
    );
  } else if (manifest.includes('<application')) {
    manifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n        ${metaData}`);
  } else {
    throw new Error(`Could not find an Android <application> block in ${manifestPath}`);
  }

  fs.writeFileSync(manifestPath, manifest);
  log(`Added Android AdMob application ID ${appId}`);
}

const iosGoogleRedirect = getGoogleRedirectParts('ios');
if (iosGoogleRedirect) patchIosInfoPlist(iosGoogleRedirect);

patchIosAppleSignInEntitlements();

const androidGoogleRedirect = getGoogleRedirectParts('android');
if (androidGoogleRedirect) patchAndroidManifest(androidGoogleRedirect);

const iosAdMobAppId = getAdMobAppId('ios');
if (iosAdMobAppId) {
  patchIosAdMobInfoPlist(iosAdMobAppId);
} else {
  log('Skipping iOS AdMob patch: NEXT_PUBLIC_ADMOB_IOS_APP_ID is not set.');
}

const androidAdMobAppId = getAdMobAppId('android');
if (androidAdMobAppId) {
  patchAndroidAdMobManifest(androidAdMobAppId);
} else {
  log('Skipping Android AdMob patch: NEXT_PUBLIC_ADMOB_ANDROID_APP_ID is not set.');
}
