# Тело в цифрах iOS

Native SwiftUI client for the existing web app.

## Current state

This first scaffold verifies the shared Firebase loop:

```text
iOS app -> Firebase Auth -> Firestore -> healthUsers/{uid}/entries
```

HealthKit sync will be added after the iOS app can sign in and read the same entries as the web app.

## App settings

```text
Display name: Тело в цифрах
Bundle ID: com.avanesov-ux.ba
Firebase project: body-analysis-2edac
```

`BodyAnalysis/GoogleService-Info.plist` is copied from Firebase Console and must be included in the app target.

## Open the Xcode project

The project has already been generated from `project.yml`:

```text
ios/BodyAnalysis/BodyAnalysis.xcodeproj
```

To regenerate it after editing `project.yml`:

```bash
cd ios/BodyAnalysis
xcodegen generate
```

The local machine still needs full Xcode, not only Command Line Tools, to build and run the app on iPhone.
