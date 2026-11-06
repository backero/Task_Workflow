# Build Android APK - Quick Guide

## Prerequisites

```bash
npm install -g eas-cli
# Login to Expo
eas login
```

## Build Steps

### 1. Install Dependencies
```bash
cd backero-mobile


npm install


```

### 2. Generate APK
```bash
# For local build (requires Android SDK)
npm run build:apk

# OR use Expo Cloud Build (recommended - no local setup needed)
eas build --platform android
```

### 3. Download APK
After build completes:
- APK file location: `./build/` or download from Expo dashboard
- File size: ~100MB
- Android Version: 8.0+
- Permissions: Location, Internet

## Installation on Device

```bash
# Connect Android device with USB debugging enabled
adb install -r backero-attendance-*.apk

# Or transfer APK file and install manually via device file manager
```

## Testing Checklist

- [ ] Login with email/password
- [ ] Check-in successfully marks attendance
- [ ] Location captured correctly
- [ ] Dashboard shows today's stats
- [ ] History displays past records
- [ ] Offline mode works
- [ ] Data syncs when online

## Distribution

### Google Play Store
1. Create Google Play Developer account
2. Prepare screenshots & description
3. Build signed APK
4. Upload to Play Console
5. Set up release schedule

### Direct Distribution
- Share APK file directly
- Use internal app store
- Email to employees

## Next: Biometric Integration

After APK is tested:
1. Install fingerprint detection library
2. Add face recognition (if needed)
3. Update device access
4. Rebuild APK

Estimated time: 2-3 weeks for full biometric integration
