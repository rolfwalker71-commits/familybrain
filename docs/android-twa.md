# Android TWA, Widgets und Push

Buddy bleibt die Web-App. Die Android-APK ist nur eine Hülle (Trusted Web Activity)
plus native Widgets. **Web-Updates brauchen keine neue APK.** Neue APK nur bei
Änderungen an Widgets, Package-Name, Icons in der Hülle oder Notification-Delegation.

## Was schon im Server steckt

| Feature | Endpoint / Ort |
|--------|----------------|
| Asset Links | `GET /.well-known/assetlinks.json` |
| Widget-Daten | `GET /api/mobile/widgets` (Cookie oder `Authorization: Bearer buddy_…`) |
| Geräte-Token | Einstellungen → Notify / Seite `/account` |
| Web Push | VAPID + Subscribe in denselben Einstellungen |
| Reise-Kommentar | Live-Toast + Push (wenn aktiv) + optional E-Mail |

## 1. Server vorbereiten

```bash
npm run push:vapid
# Ausgabe in .env / .env.local einfügen, Buddy neu starten
```

Optional für saubere TWA ohne Browser-Leiste:

```env
ANDROID_PACKAGE_NAME=ch.buddy.app
ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:CC:...
```

SHA-256 kommt vom Release-Keystore (siehe unten).

## 2. APK mit Bubblewrap bauen

Voraussetzungen: JDK 17+, Android SDK, Node.

```bash
npm i -g @bubblewrap/cli
mkdir -p android && cd android
bubblewrap init --manifest https://DEINE-BUDDY-URL/manifest.webmanifest
# Package: ch.buddy.app (oder wie in ANDROID_PACKAGE_NAME)
bubblewrap build
```

APK liegt typischerweise unter `android/app-release-signed.apk` (Pfad laut Bubblewrap-Ausgabe).

**Sideload:** APK aufs Handy kopieren → installieren (unbekannte Quellen erlauben).

**Fingerprint für Asset Links:**

```bash
keytool -list -v -keystore ~/.android/android.keystore -alias android
# SHA256-Zeile kopieren → ANDROID_SHA256_CERT_FINGERPRINTS
```

Nach Setzen der Env Buddy neu deployen, dann TWA erneut öffnen (ohne URL-Leiste).

## 3. Notification Delegation (in der generierten Android-App)

In der von Bubblewrap erzeugten App den DelegationService aktivieren (siehe
[android-browser-helper demo](https://github.com/GoogleChrome/android-browser-helper/tree/main/demos/twa-notification-delegation)).
Referenz-Snippets liegen unter [`android/snippets/`](../android/snippets/).

Danach **neu bauen und APK neu installieren**.

## 4. Push auf dem Handy aktivieren

1. Buddy als PWA oder TWA öffnen und einloggen  
2. Einstellungen → Benachrichtigungen (oder `/account`)  
3. Event «Neuer Reise-Kommentar» aktiv lassen  
4. **Push aktivieren** tippen und erlauben  

Geschlossene App: Web Push liefert den Toast. Offene App: weiterhin Live-Toast.

## 5. Widgets einrichten

### Design (wie sie aussehen)

Drei schlanke **Zähler-/Text-Widgets** (Material hell, Buddy-Grün `#3f6b52`):

1. **Prüfliste** — «3 offen» + Unterzeile Belege  
2. **Finanzen** — offene Paperless-Rechnungen «Zu bezahlen»  
3. **TravelBuddy** — nächste Aktivität (Titel + Zeit)

Kein Dashboard-Wirrwarr: Titel, eine Hauptzeile, eine Nebenzeile, Tap öffnet die Deep-Link-URL in der TWA.

Layout-XML und Kotlin-Stubs: [`android/snippets/`](../android/snippets/). Nach `bubblewrap init` in das Android-Projekt kopieren und registrieren (`AndroidManifest.xml` + `res/xml/*_info.xml`).

### Daten anbinden

1. In Buddy: **Token erzeugen** (Einstellungen oder `/account`) → kopieren  
2. In der Android-App (Widget-Einstellungen / kleine Settings-Activity):  
   - Buddy-Basis-URL (`https://…`)  
   - Geräte-Token  
3. Widget auf Homescreen legen → langer Druck → Buddy-Widget wählen  
4. Widget pollt `GET /api/mobile/widgets` mit `Authorization: Bearer <token>`

### Widgets auf dem Homescreen (Android)

1. Leere Stelle auf dem Homescreen lange drücken  
2. **Widgets** / **Apps & Widgets**  
3. Buddy wählen → Widget-Größe (meist 2×1 oder 2×2) platzieren  

Aktualisierung: periodisch durch `AppWidgetProvider` / WorkManager (Stub: alle 30–60 Min + beim Tap).

## 6. Wann brauche ich eine neue APK?

| Änderung | Neue APK? |
|----------|-----------|
| FinanzBuddy/TravelBuddy UI, Paperless-Sync, neue Web-Features | Nein |
| Push-Texte / Prefs / Widget-JSON vom Server | Nein |
| Neues Widget-Layout, neuer Widget-Typ | Ja |
| Package-Name, App-Icon der Hülle, Delegation | Ja |

## 7. Play Store (optional später)

`bubblewrap build` erzeugt auch ein **AAB**. Developer-Konto, Listing, dieselbe Asset-Links-Config. Sideload reicht für Familie.
