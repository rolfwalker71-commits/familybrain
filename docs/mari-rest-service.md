# MARI Rest Service (Support Issues)

Stand: 2026-08-09 · Probe gegen `https://marirestservice.an-group.international/`

Referenzen:

- Service-Übersicht: <https://marirestservice.an-group.international/>
- Swagger UI: <https://marirestservice.an-group.international/swagger/ui/index>
- SupportIssue: <https://marirestservice.an-group.international/swagger/ui/index#/SupportIssue>
- OpenAPI JSON: `GET /swagger/docs/v1`

Credentials **nicht** in dieses File schreiben. Lokal in `.env.local` (siehe unten).

---

## Credentials

Bevorzugt in der App: **Einstellungen → Maringo** (SQLite). Alternativ `.env.local`:

```bash
MARI_REST_BASE_URL=https://marirestservice.an-group.international
MARI_REST_USERNAME=...
MARI_REST_PASSWORD=...
# Personalnummer (EmployeeNumber), nicht UserCode:
MARI_EMPLOYEE_NUMBER=M1010
```

Gespeicherte Einstellungen haben Vorrang vor Env-Variablen.
Mapping (Beispiel Rolf Walker, Login `RWA`):

| Feld | Wert |
|------|------|
| REST username | `RWA` (= NameInitials) |
| `MARIEmployeeMaster.UserCode` | `12` |
| `MARIEmployeeMaster.EmployeeNumber` | `M1010` |
| Ticket-Feld `HandledBy` / API `Responsible` | `M1010` |
| `EditorType` / API `ResponsibleType` | `3` (= Employee) |

---

## Auth

`POST {BASE}/token`  
`Content-Type: application/x-www-form-urlencoded`

```
username=...&password=...&grant_type=password
```

Antwort:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 3599
}
```

Folgeaufrufe:

```
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json
```

Hinweise:

- Token-URL ist `{BASE}/token` (nicht `/MARIRestService/token` auf diesem Host).
- `SystemInfo` ohne Auth: `GET /api/SystemInfo` → InterfaceVersion, LinkedDatabase (hier HANA `MARI_PROJEKTANG`).

---

## SupportIssue REST API

| Methode | Pfad | Zweck |
|---------|------|--------|
| GET | `/api/SupportIssue/{id}` | Ein Ticket lesen |
| POST | `/api/SupportIssue` | Neues Ticket |
| PATCH | `/api/SupportIssue/{id}` | Ticket aktualisieren (JSON Partial) |
| DELETE | `/api/SupportIssue/{id}` | Ticket + Anhänge löschen |

**Kein Listen-Endpoint.** `GET /api/SupportIssue` → 405.

Relevante Felder (`clsImportSupportIssue`):

| API-Feld | Bedeutung |
|----------|-----------|
| `IssueID` | Ticket-ID |
| `BriefDescription` | Betreff |
| `RequestText` | Text (HTML erlaubt) |
| `Status` | Status-ID (siehe unten) |
| `Priority` | Prioritäts-ID |
| `DueDate` | Fälligkeit (`YYYY-MM-DDTHH:mm:ss`) |
| `Responsible` | Zuständig-Key (z.B. `M1010`) |
| `ResponsibleType` | 3 = Employee, 4 = SupportGroup, … |
| `BusinessPartnerCode` | BP / CardCode |
| `ProductID` | Produkt (oft Pflicht bei PATCH) |
| `ParentType` | Parent-Modus; `-1` kann PATCH blockieren |
| `HotlineClassType` | Ticket-Dimension: **17 = Support** (Buddy-Liste), u.a. **676 = Projektaufgaben** (nicht in Buddy-Liste) |
| List enrichment | `IssueType`→Typ, `ProductID`→`MARISupportProduct.ProductName`, `AddressMatchcode`, `HandledBy`→`MARIEmployeeMaster.Matchcode`, `SupportGroupID`→`MARISupportGroup.Description`, `ContactPerson`, `RequestDate`/`ChangeAtDate`, `ReferenceText`, `USER_U_Std_Freigegeben_Kunde`, AI-Felder |

Attachments (nur mit bekannter Issue-ID):

- `GET /api/SupportIssueAttachmentList/{id}`
- `GET /api/SupportIssueAttachmentListData/{id}` (inkl. Base64)
- `GET|DELETE /api/SupportIssueAttachment/{attachmentId}`
- `POST /api/SupportIssueAttachment` — Anhänge **und Notizen**; `Internal: true` = nur intern (`VisibleInternOnly = -1` in HANA). Notizen ohne Datei: `AttachmentTyp: 1`, HTML in `Comment`.

Parallel existieren `/wopi/...`-Spiegelpfade derselben Operationen.

---

## Listen / SQL: `SystemToolsReadDataFromDB`

Weil SupportIssue keine Liste hat:

`POST /api/SystemToolsReadDataFromDB`

Body:

```json
{ "SQL": "SELECT TOP 10 \"IssueID\", \"BriefDescription\" FROM \"MARISupportIssue\"" }
```

Regeln (dieser Server):

- Nur **ein** `SELECT` — kein `;`, kein UPDATE/DELETE.
- Backend ist **SAP HANA** → Identifier oft **quoted** (`"MARISupportIssue"`), sonst Uppercase-Lookup und „table not found“.
- `TOP n` funktioniert; `LIMIT` wurde vom Validator abgelehnt („not a SELECT / no `;`“).
- Antwort: JSON-Array von Row-Objekten.

Wichtige Views/Tables:

| Objekt | Zweck |
|--------|--------|
| `"MARISupportIssue"` | Tickets (View) |
| `"MPHOTLINEANFRAGE"` | Roh-Tabelle Tickets |
| `"MPHOTLINESETTINGS"` | Status/Typ/Prio-Bezeichnungen (`SETTING` + `ID`) |
| `"MARIEmployeeMaster"` | Mitarbeiter |
| `SYS.TABLES` / `SYS.VIEWS` / `SYS.VIEW_COLUMNS` | Katalog (Schema `MARI_PROJEKTANG`) |

### Meine Tickets (Beispiel)

```sql
SELECT TOP 100
  i."IssueID",
  s."BEZEICHNUNG" AS "StatusName",
  p."BEZEICHNUNG" AS "PriorityName",
  i."BriefDescription",
  i."CardCode",
  i."DueDate",
  i."ChangeAtDate"
FROM "MARISupportIssue" i
LEFT JOIN "MPHOTLINESETTINGS" s
  ON s."SETTING" = 1 AND s."ID" = i."Status"
LEFT JOIN "MPHOTLINESETTINGS" p
  ON p."SETTING" = 3 AND p."ID" = i."Priority"
WHERE i."HandledBy" = 'M1010'
  AND i."EditorType" = 3
  AND i."HotlineClassType" = 17
  AND i."Status" IN (1, 3, 4, 6, 7, 11, 13, 14)
ORDER BY
  CASE WHEN i."DueDate" IS NULL THEN 1 ELSE 0 END,
  i."DueDate",
  i."IssueID"
```

View-Spalten vs. API-Namen (Auswahl):

| View | API |
|------|-----|
| `HandledBy` + `EditorType` | `Responsible` + `ResponsibleType` |
| `CardCode` | `BusinessPartnerCode` |
| `RequestDate` | `IssueDate` |
| `IssueType` | `IssueTyp` |
| `SolutionMethod` | `SolutionApproach` |

---

## Status-IDs (`MPHOTLINESETTINGS`, `SETTING = 1`)

| ID | Bezeichnung |
|---:|-------------|
| 11 | NEU |
| 1 | Offen |
| 3 | In Arbeit |
| 13 | Aktualisiert |
| 6 | Warte auf Kunden Feedback |
| 9 | Beim Kunden nachfassen |
| 7 | Warte auf Hersteller |
| 10 | Beim Hersteller nachfassen |
| 4 | Wieder geöffnet |
| 2 | Gelöst |
| 12 | Gelöst - Wartet |
| 8 | Verrechnet |
| 5 | Geschlossen |
| 14 | Eskalation |
| 15 | On Hold |
| 16 | Abklärung Notwendig |

**Arbeitsfilter (vereinbart 2026-08-09):**  
`Status IN (1, 3, 4, 6, 7, 11, 13, 14)`  
→ Offen, In Arbeit, Wieder geöffnet, Warte auf Kunden Feedback, Warte auf Hersteller, NEU, Aktualisiert, Eskalation.

**Klasse:** nur `HotlineClassType = 17` (Support). Projektaufgaben (z.B. 676, «TESTAUFGABE HZI») erscheinen sonst fälschlich als «meine» Tickets mit Status NEU, obwohl sie in der Support-UI nicht geführt werden.

Andere `SETTING`-Gruppen (Kurz):

| SETTING | Inhalt |
|--------:|--------|
| 2 | Issue-Typen (Bug, Supportanfrage, …) |
| 3 | Prioritäten (Eskalation, Hoch, Normal, …) |
| 4 | SolutionMethod |
| 5 | Medium (Telefon, E-Mail, …) |

---

## Due Date setzen (PATCH)

```http
PATCH /api/SupportIssue/{id}
Authorization: Bearer …
Content-Type: application/json

{ "DueDate": "2026-08-16T00:00:00" }
```

Erfahrungen:

- Bei „normalen“ Tickets reicht oft nur `DueDate`.
- Tickets mit `ProductID = 0` und `ParentType = -1` schlagen fehl (`ParentType unknown`, `ProductID required`).
- Workaround: zusätzlich gültiges Produkt + Parent mitschicken, z.B.:

```json
{
  "DueDate": "2026-08-16T00:00:00",
  "ProductID": 100001,
  "ParentType": 0
}
```

- `IMPORT_Feedback = 0` und leeres `IMPORT_ErrorMessage` = OK.
- SQL-UPDATE über SystemTools ist **nicht** erlaubt (nur SELECT).

Häufige ProductIDs in dieser DB (Orientierung): `100001`, `100000`.

---

## Quick curl-Skizze

```bash
# Token
TOKEN=$(curl -sS -X POST "$MARI_REST_BASE_URL/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "username=$MARI_REST_USERNAME" \
  --data-urlencode "password=$MARI_REST_PASSWORD" \
  --data-urlencode 'grant_type=password' | jq -r .access_token)

# Ein Ticket
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$MARI_REST_BASE_URL/api/SupportIssue/143752"

# Liste via SQL
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"SQL":"SELECT TOP 5 \"IssueID\",\"BriefDescription\",\"Status\",\"DueDate\" FROM \"MARISupportIssue\" WHERE \"HandledBy\"='\''M1010'\'' AND \"EditorType\"=3"}' \
  "$MARI_REST_BASE_URL/api/SystemToolsReadDataFromDB"
```

---

## Buddy-Integration

1. Credentials: Einstellungen → Maringo (oder Env).
2. Client: `lib/mari/*` — Token-Cache, SQL-Liste, GET/PATCH Issue, Timeline, Anhänge (Vision), AI-Analyse.
3. UI: `/maringo` — Liste mit Status-Multiselect + Bearbeiter-Wahl, Detail + Verlauf, Status/Fälligkeit ändern, AI (Text + Screenshots), optional **AI als internen Kommentar** zurückschreiben.
4. Keine Secrets committen; SystemTools-SQL nur lesend.

**AI-Screenshots:** `GET /api/SupportIssueAttachment/{id}` liefert Base64; bis zu 4 Bilder (png/jpeg/webp, kleine GIF-Signaturen werden übersprungen) gehen mit Vision in die Analyse.

**AI → interner Kommentar:** Buddy `POST /api/maringo/tickets/{id}/internal-note` → MARI `POST /api/SupportIssueAttachment` mit `Internal: true`, `AttachmentTyp: 1`. Nie kunden-sichtbare Reply-Pfade.

Menü: `/maringo` («Maringo Support»).
---

## Verlauf / History (Live-Probe 2026-08-09)

Zusätzlich zu `SupportIssue` + Attachments gibt es in HANA:

| View / Table | Zweck |
|--------------|--------|
| `"MARISupportIssueLine"` | Ticket-Positionen / Thread (Mail rein/raus, Notizen) mit `CreateDate`, `RequestPosType`, `RequestText` |
| `"MARISupportIssueChangeLog"` | Feldänderungen Alt→Neu (`Status`, `Bearbeiter`, `Stichtag`, …) mit `ChangeDate` |
| `"MARISupportIssueVersions"` | Produktversionen am Ticket |
| `"MPHOTLINEANFRAGELOG"` | Roh-Log (leer / wenig genutzt in Probe) |

**RequestPosType (Häufigkeit in DB, Interpretation aus Samples):**

| Typ | Beobachtung |
|----:|-------------|
| 1 | Antwort / Bearbeitung (oft `Originator`/`HandledBy` = Employee z.B. M1010) |
| 3 | E-Mail-Eingang |
| 4 | System / Undeliverable |
| 5 | (häufig, Typ noch zu beschriften) |
| 8 | Kundennachricht / RE: |
| 10 / 11 | selten |

Timeline-UI = Lines chronologisch + optional ChangeLog-Einträge als Meta-Events.

**Env-Hinweis:** `MARI_EMPLOYEE_NUMBER` muss die **EmployeeNumber** sein (`M1010`), nicht `UserCode` (`12`). Mit `12` liefert die «Meine Tickets»-Query 0 Zeilen.

---

## Probe 2026-08-09 (Kurz)

- Login OK, Interface `8.0.000.4`, DB `MARI_PROJEKTANG`.
- 12 Tickets für `M1010` mit Arbeitsfilter; Due Date aller 12 auf `2026-08-16` gesetzt.
- Zwei NEU-Tickets (`#130330`, `#131164`) brauchten PATCH mit `ProductID`/`ParentType`.
