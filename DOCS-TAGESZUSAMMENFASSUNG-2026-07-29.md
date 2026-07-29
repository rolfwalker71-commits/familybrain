# Tageszusammenfassung — 29. Juli 2026

Überblick über alles, was heute an **FamilyBrain / Buddy** geändert, angepasst oder neu gebaut wurde.  
Branch: `main` · Letzter Stand: `e1ad0c2`

---

## In einem Satz

Heute ging es vor allem um **Action-first UX** (was wirklich offen/fällig ist), **Admin-Navigation**, **Paperless-Tiefintegration**, **KI-Dokumentenicons** und **übersichtlichere Listen** (Sheet, Zeitgruppen, Zoom).

---

## 1. Action-first UX (Dashboard, Sidebar, Finanzen)

**Ziel:** Weniger Inventar, mehr Prioritäten — „Was muss ich tun?“ statt „Wie viele Dokumente habe ich?“

### Neu / angepasst
- Relative Fälligkeitstexte („In 4 Tagen fällig“, „Morgen fällig“, …) und Dringlichkeitsfarben
- Deterministisches **Briefing** auf dem Dashboard
- Finance-Buckets und Action-Inbox stärker auf Handlungsbedarf ausgerichtet
- Hilfsmodul: `lib/utils/due-urgency.ts`

### KPI-Korrekturen (wichtig!)
| Bereich | Vorher (Problem) | Nachher |
|--------|------------------|---------|
| **Offene Beträge** | Viele historische Extrakte mit Fälligkeit | Nur Rechnungen wie in der Action-Inbox: Paperless **Zu bezahlen** / nicht bezahlt |
| **Fristen** | Alle offenen / überfälligen | Überfällig nur mit begrenztem Lookback (ca. 30 Tage) |
| **Garantien** | Breite Zählung | Fokus auf relevantes Fenster (nächste ~90 Tage) |

**Commits:** `d0afb5e`, `dd55494`, `d6e9716`

---

## 2. Admin-Navigation (BuddyApp-Switcher)

**Ziel:** Als Admin nicht alle Menüpunkte auf einmal sehen.

### Verhalten
- Admin startet bei **BuddyApp** mit drei Bereichen:
  - **MyBrain**
  - **TravelBuddy**
  - **FinanzBuddy**
- Klick auf einen Bereich wechselt die Sidebar-Inhalte
- Gewählter Bereich wird lokal gemerkt
- Nicht-Admins: unverändertes Menü

**Neu:** `components/layout/admin-nav-provider.tsx`, `lib/navigation/admin-nav.ts`

**Commit:** `f52f366`

---

## 3. Offene Rechnungen: Filter + „Als beglichen“

**Ziel:** Keine bereits bezahlten Alt-Belege als „überfällig“ in der Finanz-Dringlichkeit.

### Änderungen
- Due-/Overdue-Liste filtert auf **zahlungspflichtig** (Zu bezahlen / nicht Bezahlt)
- **Mehrfachauswahl** + Batch **„Als beglichen“**
- Schreibt lokal **und** zurück nach **Paperless** (Bezahlt-UDF)

**Neu:** `lib/finance/mark-paid.ts`, `app/api/finance/mark-paid/route.ts`

**Commit:** `6b7cb88`

---

## 4. Paperless Deep Integration

Fünf Bausteine für mehr als „nur syncen“:

| Feature | Was es tut |
|--------|------------|
| **Deep Writeback** | Buddy-Felder (Status, Bezahlt, …) zurück nach Paperless Custom Fields |
| **Webhook** | Paperless kann Buddy benachrichtigen (`/api/paperless/webhook`) |
| **Dokument-Status-API** | Status-Abfrage Richtung Paperless |
| **Batch-Writeback** | Mehrere Dokumente gebündelt zurückschreiben |
| **Sync-Protokoll** | Sichtbares Log in der Sync-/Automation-UI |

Später ergänzt: **Feldprotokoll** für Push **und** Pull (was wurde wann geschrieben/gelesen).

### Hinweis Paperless
Falls noch nicht geschehen: benötigte **benutzerdefinierte Felder** in Paperless müssen existieren (wie im Plan besprochen), sonst schlägt Writeback fehl.

**Wichtige Dateien:**  
`lib/paperless/writeback.ts`, `sync-log.ts`, `webhook-parse.ts`, Sync-UI-Panels, Schema/Bootstrap

**Commits:** `c6b1e5b`, `99b0943`

---

## 5. KI-Dokumentenicons

**Ziel:** Pro Dokument ein kleines, erkennbares KI-Bild — einzeln, batchweise, in Listen sichtbar.

### Funktionen
- Generierung mit **gpt-image-1.5** (bunt auf weißem Grund)
- **Einzeln** (Dokument-Detail / Icon-Button) und **Batch** (fehlende Icons)
- Global in **Einstellungen** schaltbar
- Auf der **Dokumente-Seite** einschaltbar; Status sichtbar
- Neu-Generierung erzwingen + Overlay „Generierung…“
- Bugfix: Einschalten per **PUT** (nicht POST) auf `/api/settings`

### Hintergrundjobs
Damit der Tab schließen darf:
- `analyze_pending` — ausstehende Analysen
- `ai_icons_missing` — fehlende Icons nachziehen
- `paperless_writeback` — Writeback als Server-Job  
→ `lib/jobs/background-runners.ts`, Job-APIs (run / status / cancel)

### Icons überall in Listen
Gemeinsame Komponente `DocumentAiIcon` + optional in `DocumentTitleLink`:
- Action-Inbox / Offene Rechnungen
- Finanzlisten
- Garantien, Summaries, Travel, Dashboard-relevante Stellen

### UX-Feinschliff (Abend)
- Icons **etwas größer**
- **Zoom** (Lightbox) per Tippen
- Offene-Rechnungen-Karten: Icon unten links
- Fristenradar / Garantien: eigener Icon-Bereich **vorne links**

**Commits:** `661b9f2`, `d6df021`, `daf5afc`, `f1f007b`, `674eec5`, `559266d`, `4577dc8`, `964d9a9`, `e1ad0c2`

---

## 6. Reise-Texte: kein „Anlaufhafen“-Jargon

Anzeige und Prompt-Logik streichen bzw. ersetzen den Cruise-Begriff „Anlaufhafen“ bei Zug-/normalen Stops.  
Hilfsmodul: `lib/extraction/itinerary-labels.ts`  
→ **Keine Neu-Analyse nötig**, nur Anzeige/Labels.

**Commit:** Teil von `964d9a9`

---

## 7. Finanzblick: Suche + Sheet statt Endlos-Kacheln

Unter **Nach Lieferant** (und vergleichbarer Detail-Navigation):
- Kompakte, **durchsuchbare** Liste
- Sortierung (Betrag / A–Z)
- Details im rechten **Sheet** (kein Scrollen „50 Seiten nach unten“)
- Unbenutzte ShareBar entfernt

**Commits:** `7dcddae`, `6fa369b`

---

## 8. Fristenradar & Garantien: Zeitgruppen

Lange Endloslisten unterteilt in klappbare Horizonte:

1. Überfällig  
2. Nächste Woche  
3. Nächste 2 Wochen  
4. Nächster Monat  
5. Nächstes halbes Jahr  
6. Nächstes Jahr  
7. Später / ohne Datum  

Gleicher Bucket-Ansatz auch bei den **fälligen Rechnungen** im Finanzblick (statt nur „7 / 30 Tage“).

**Neu:** `lib/utils/time-buckets.ts`, `components/layout/time-bucket-section.tsx`  
Listenzeilen: optionales `leading`-Slot für Icons (`data-list.tsx`)

**Commit:** `e1ad0c2`

---

## Chronologie der Commits (heute)

| Zeit | Commit | Kurz |
|------|--------|------|
| 07:45 | `d0afb5e` | Action-first UX Dashboard/Sidebar/Finanzen |
| 08:08 | `dd55494` | Offene Beträge nur Action-Inbox |
| 08:18 | `d6e9716` | Fristen-/Garantie-KPIs begrenzen |
| 12:32 | `f52f366` | Admin BuddyApp-Navigation |
| 12:32* | `6b7cb88` | Offene Rechnungen + Batch beglichen + Paperless |
| 13:07 | `c6b1e5b` | Paperless Deep Writeback / Webhook / Sync-Log |
| 13:32 | `661b9f2` | KI-Icons selektiv + Batch |
| 13:46 | `99b0943` | Paperless-Feldprotokoll Push/Pull |
| 14:08 | `d6df021` | Icon-Stil gpt-image-1.5 |
| 14:42 | `daf5afc` | Icons global schaltbar, Analyse stoppen |
| 14:52 | `f1f007b` | Icon-Neu-Generierung mit Feedback |
| 15:21 | `674eec5` | Icons auf Dokumente-Seite einschaltbar |
| 15:26 | `559266d` | Fix: Settings-PUT für Icons |
| 15:42 | `4577dc8` | Hintergrundjobs Analyse/Icons/Writeback |
| 15:58 | `964d9a9` | Icons in Listen + Anlaufhafen-Cleanup |
| 16:02 | `7dcddae` | Finanz-Details als Sheet + Suche |
| 16:03 | `6fa369b` | ShareBar-Cleanup |
| 16:19 | `e1ad0c2` | Größere zoombare Icons + Zeitgruppen |

\*Ungefähre Reihenfolge laut Commit-Log; Admin-Nav und Mark-Paid lagen nahe beieinander.

---

## Was du als User heute „spüren“ solltest

1. **Dashboard/Sidebar** melden eher echte To-dos, nicht Altlasten.  
2. **Admin:** BuddyApp → Bereich wählen → fokussiertes Menü.  
3. **Finanzen:** nur wirklich offene Rechnungen; Batch „beglichen“ inkl. Paperless.  
4. **Sync:** Writeback, Webhook, Protokoll sichtbar.  
5. **Dokumente:** KI-Icons erzeugen, steuern, in Listen sehen, antippen = Zoom.  
6. **Fristen & Garantien:** nach Zeithorizonten statt endloser Liste.  
7. **Lieferanten-Details:** Sheet + Suche statt Scroll-Marathon.

---

## Nicht Teil der Code-Commits (Setup heute früh)

- Repo geklont / Workspace eingerichtet  
- Abhängigkeiten in WSL geprüft  
- Push-Auth für GitHub zwischenzeitlich geklärt (früh 403, später erfolgreich)

---

*Erstellt am 29.07.2026 als Orientierungshilfe — kein Produkt-Changelog für Endnutzer, sondern Entwickler-/Projektüberblick.*
