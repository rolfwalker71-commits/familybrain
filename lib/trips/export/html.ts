import { toSwissDate, toTimeInputValue } from "@/lib/utils/dates";
import type { TripExportEvent, TripExportModel } from "@/lib/trips/export/model";

function esc(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eventWhen(event: TripExportEvent): string {
  const start = event.start_date ? toSwissDate(event.start_date) : "";
  const end =
    event.end_date && event.end_date !== event.start_date
      ? ` – ${toSwissDate(event.end_date)}`
      : "";
  const st = toTimeInputValue(event.start_time);
  const et = toTimeInputValue(event.end_time);
  const times =
    st || et
      ? ` · ${[st, et].filter(Boolean).join(" – ")}`
      : "";
  return `${start}${end}${times}`.trim() || "ohne Datum";
}

function eventDetailsHtml(event: TripExportEvent): string {
  const rows: Array<[string, string | null | undefined]> = [
    ["Ort", event.place_name || event.location],
    [
      "Route",
      event.origin_place || event.destination_place
        ? `${event.origin_place || "—"} → ${event.destination_place || "—"}`
        : event.departure_airport || event.arrival_airport
          ? `${event.departure_airport || "—"} → ${event.arrival_airport || "—"}`
          : null,
    ],
    ["Adresse", event.address],
    ["Anbieter", event.provider],
    ["Buchung", event.booking_reference],
    ["Flugnr.", event.flight_number],
    ["Airline", event.airline],
    [
      "Flugzeug",
      [event.aircraft_type, event.aircraft_reg].filter(Boolean).join(" · ") ||
        null,
    ],
    [
      "Abflug",
      [
        event.departure_terminal ? `Terminal ${event.departure_terminal}` : null,
        event.departure_gate ? `Gate ${event.departure_gate}` : null,
        event.check_in_desk ? `Check-in ${event.check_in_desk}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    [
      "Ankunft",
      [
        event.arrival_terminal ? `Terminal ${event.arrival_terminal}` : null,
        event.arrival_gate ? `Gate ${event.arrival_gate}` : null,
        event.baggage_belt ? `Gepäck ${event.baggage_belt}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    [
      "Dauer",
      event.duration_minutes != null ? `${event.duration_minutes} Min.` : null,
    ],
    ["Telefon", event.phone],
    ["Web", event.website],
    ["Notizen", event.notes],
  ];

  const lines = rows
    .filter(([, v]) => Boolean(v && String(v).trim()))
    .map(
      ([k, v]) =>
        `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(
          String(v)
        )}</span></div>`
    );
  return lines.join("");
}

function eventDocsHtml(event: TripExportEvent): string {
  const docs = event.documents || [];
  if (docs.length === 0) return "";
  return `<p class="docs"><strong>Belege:</strong> ${docs
    .map((d) => esc(d.title || `Dokument #${d.id}`))
    .join(", ")}</p>`;
}

export function renderTripExportHtml(
  model: TripExportModel,
  options?: { absoluteOrigin?: string; forPrint?: boolean }
): string {
  const origin = options?.absoluteOrigin?.replace(/\/$/, "") || "";
  const abs = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return origin ? `${origin}${url}` : url;
  };

  const cover = abs(model.coverUrl);
  const eventsHtml = model.events
    .map((event) => {
      const map = abs(event.map_image_url);
      const aircraft = abs(event.aircraft_image_url);
      return `
<section class="event">
  <header>
    <span class="type">${esc(event.event_type)}</span>
    <h2>${esc(event.title)}</h2>
    <p class="when">${esc(eventWhen(event))}</p>
  </header>
  <div class="details">${eventDetailsHtml(event)}</div>
  ${eventDocsHtml(event)}
  ${
    event.show_document_notes !== 0 &&
    event.document_notes_md?.trim()
      ? `<div class="beleg-md"><strong>Beleg-Details</strong><pre class="md">${esc(
          event.document_notes_md
        )}</pre></div>`
      : ""
  }
  ${
    aircraft
      ? `<figure class="media"><img src="${esc(aircraft)}" alt="Flugzeug" /></figure>`
      : ""
  }
  ${
    map
      ? `<figure class="media"><img src="${esc(map)}" alt="Karte" /></figure>`
      : ""
  }
</section>`;
    })
    .join("\n");

  const belegeList =
    model.documents.length > 0
      ? `<section class="belege">
  <h2>Belege (${model.documents.length})</h2>
  <ol>
    ${model.documents
      .map(
        (d) =>
          `<li>${esc(d.title || `Dokument #${d.id}`)} <span class="muted">— ${esc(
            d.firstEventTitle
          )}</span></li>`
      )
      .join("\n")}
  </ol>
  <p class="muted">Im PDF-Export sind die Belege als Anhang angehängt (jedes Dokument nur einmal).</p>
</section>`
      : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(model.trip.title)} — TravelBrain</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    color: #1a1a1a;
    background: #f7f5f1;
    line-height: 1.45;
  }
  .sheet {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
    background: #fff;
    min-height: 100vh;
  }
  .hero {
    border-bottom: 1px solid #ddd;
    padding-bottom: 1.25rem;
    margin-bottom: 1.5rem;
  }
  .hero img.cover {
    width: 100%;
    max-height: 14rem;
    object-fit: cover;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  h1 {
    font-size: 1.85rem;
    margin: 0 0 0.35rem;
    letter-spacing: -0.02em;
  }
  .meta { color: #555; font-size: 0.95rem; margin: 0.15rem 0; }
  .summary { margin-top: 0.75rem; white-space: pre-wrap; }
  .event {
    break-inside: avoid;
    border-top: 1px solid #eee;
    padding: 1rem 0 1.25rem;
  }
  .event .type {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #2563eb;
    margin-bottom: 0.25rem;
  }
  .event h2 { font-size: 1.15rem; margin: 0 0 0.2rem; }
  .when { color: #666; margin: 0 0 0.6rem; font-size: 0.9rem; }
  .row { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.35rem; font-size: 0.9rem; margin: 0.15rem 0; }
  .k { color: #777; }
  .v { white-space: pre-wrap; }
  .docs { font-size: 0.85rem; margin-top: 0.6rem; }
  .beleg-md { margin-top: 0.75rem; font-size: 0.85rem; }
  .beleg-md pre.md {
    white-space: pre-wrap;
    font-family: inherit;
    margin: 0.35rem 0 0;
    color: #333;
  }
  .media { margin: 0.75rem 0 0; }
  .media img { max-width: 100%; max-height: 12rem; border-radius: 0.35rem; border: 1px solid #e5e5e5; }
  .belege { margin-top: 2rem; border-top: 2px solid #ddd; padding-top: 1rem; }
  .muted { color: #777; font-size: 0.85rem; }
  .toolbar {
    display: flex; gap: 0.5rem; flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .toolbar a, .toolbar button {
    font-family: system-ui, sans-serif;
    font-size: 0.85rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 0.4rem;
    background: #fafafa;
    color: #111;
    text-decoration: none;
    cursor: pointer;
  }
  @media print {
    body { background: #fff; }
    .sheet { max-width: none; padding: 0; }
    .toolbar { display: none !important; }
    .event { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${
      options?.forPrint
        ? `<div class="toolbar no-print">
      <button type="button" onclick="window.print()">Drucken</button>
      <a href="/trips/${model.trip.id}">Zurück zur Reise</a>
    </div>`
        : ""
    }
    <header class="hero">
      ${cover ? `<img class="cover" src="${esc(cover)}" alt="" />` : ""}
      <p class="meta">TravelBrain</p>
      <h1>${esc(model.trip.title)}</h1>
      ${
        model.trip.destination
          ? `<p class="meta">${esc(model.trip.destination)}</p>`
          : ""
      }
      <p class="meta">${esc(model.dateRangeLabel)} · ${esc(model.statusLabel)}</p>
      ${
        model.trip.summary
          ? `<p class="summary">${esc(model.trip.summary)}</p>`
          : ""
      }
      ${
        model.trip.notes
          ? `<p class="summary muted">${esc(model.trip.notes)}</p>`
          : ""
      }
    </header>
    <main>
      ${eventsHtml || `<p class="muted">Keine Aktivitäten.</p>`}
      ${belegeList}
    </main>
  </div>
</body>
</html>`;
}
