# Backero Attendance Mobile App

React Native mobile application for employee attendance tracking with GPS location verification.

## Features

✅ **Check-In/Check-Out** - Quick attendance marking with location
✅ **GPS Location Tracking** - Real-time location capture
✅ **Dashboard** - Monthly hours, attendance stats, leave balance
✅ **Attendance History** - View past attendance records
✅ **User Profile** - Manage profile information
✅ **Offline Support** - Works offline, syncs when online
✅ **Real-time Sync** - Automatic sync with Backero backend

## Installation

```bash
npm install
# or
yarn install
```

## Running Locally

```bash
# Start development server
npm start

# Run on Android emulator
npm run android

# Run on iOS simulator
npm run ios

# Run on web (for testing)
npm run web
```

## Building APK

### Option 1: Using Expo (Easiest)
```bash
npm install -g eas-cli
eas build --platform android --local
```

This will generate an APK at `./build/backero-attendance-*.apk`

### Option 2: Using GitHub Actions (Automated)
Push to GitHub and the CI/CD pipeline will build the APK automatically.

## Environment

The app connects to:
- **Backend**: `https://backero-backend-7myx.onrender.com`
- **API Endpoints**:
  - `POST /api/auth/login` - User login
  - `POST /api/attendance/checkin` - Check-in/out
  - `GET /api/attendance/today` - Today's status
  - `GET /api/attendance/history` - Attendance history
  - `GET /api/attendance/stats` - Dashboard stats

## Permissions Required

- Location (Fine & Coarse)
- Internet
- Camera (for future biometric integration)

## Architecture

```
src/
├── screens/
│   ├── LoginScreen.js        - Authentication
│   ├── CheckInScreen.js      - Main check-in feature
│   ├── DashboardScreen.js    - Statistics & overview
│   ├── AttendanceHistoryScreen.js - Past records
│   └── ProfileScreen.js      - User profile
├── context/
│   └── AuthContext.js        - Authentication state
├── utils/
│   ├── api.js               - API client
│   └── storage.js           - Local storage helpers
└── components/              - Reusable UI components
```

## Next Steps

1. **Biometric Integration**: Add fingerprint/face recognition
2. **Offline Queue**: Queue check-ins when offline
3. **Push Notifications**: Real-time alerts & reminders
4. **Analytics**: Usage tracking & error reporting

## Support

For issues or feature requests, contact the development team.
