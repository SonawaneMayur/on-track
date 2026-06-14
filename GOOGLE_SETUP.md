# Google Calendar setup (one-time)

onTrack can sign in to Google **once** and then silently import any of your
calendars. It uses OAuth 2.0 **Authorization Code + PKCE** for installed apps —
no client secret, no backend, no re-login. The refresh token is stored in the
iOS Keychain / Android Keystore.

This is opt-in and sits **alongside** the ICS feeds; you don't need it if ICS is
enough. Google sign-in works on the **iOS/Android app only** (it needs the secure
in-app browser + Keychain), not the browser dev preview.

You only have to do this once, and only because Google requires every app to use
its own OAuth client — there's no way for the app to ship a shared one safely.

## 1. Create an OAuth client in Google Cloud

1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen:**
   - User type: **External**. Fill in the app name + your email.
   - **Scopes:** add `.../auth/calendar.readonly` (and `openid`, `email`).
   - **Test users:** add every family Google account that will sign in.
     (You can leave the app in "Testing" — no Google verification needed for a
     handful of test users.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - For iOS: application type **iOS**, bundle id `app.ontrack.family`.
   - For Android: application type **Android**, package `app.ontrack.family`,
     plus your signing-key SHA-1.
   - (You can use one **iOS** client for both platforms during development, since
     onTrack uses a custom-scheme redirect rather than the native SDK.)
5. Copy the **client ID**. It looks like
   `123456789-abcdefg.apps.googleusercontent.com`.

## 2. Register the redirect scheme in the native projects

The redirect is your client id **reversed**:
`123456789-abcdefg.apps.googleusercontent.com`
→ scheme `com.googleusercontent.apps.123456789-abcdefg`

- **iOS** — `ios/App/App/Info.plist`: replace
  `com.googleusercontent.apps.REPLACE-WITH-YOUR-CLIENT-ID` under
  `CFBundleURLTypes` with your reversed scheme.
- **Android** — `android/app/src/main/AndroidManifest.xml`: replace the same
  placeholder in the OAuth `<intent-filter>`'s `<data android:scheme=...>`.

Then rebuild: `npm run build && npx cap sync`.

## 3. Connect in the app

1. Open **Settings → Google Calendar**.
2. Paste your **client ID** (the app shows the exact redirect URI to confirm it
   matches what you registered).
3. Tap **Connect Google account** → consent once in the in-app browser.
4. Pick which calendars to import. Events appear on the Calendar tab and Today,
   and (if enabled) silence task reminders that fall inside an event.

To revoke: **Settings → Google Calendar → ✕** on the account, and/or remove
onTrack at <https://myaccount.google.com/permissions>.

## Notes

- **Live, not laggy.** Unlike the secret ICS feed (which Google can delay by
  hours), the Calendar API is fresh — this was the one case BUILD.md said would
  justify OAuth.
- **Refresh token.** onTrack requests offline access once; if Google ever returns
  no refresh token (because you previously consented), revoke onTrack at the
  permissions link above and reconnect.
- **Nothing leaves the device** except the direct, read-only calls to Google's
  own API. onTrack runs no server and holds no secret but your refresh token,
  which stays in the OS keystore.
