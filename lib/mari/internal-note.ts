import { MariApiError, mariJson } from "@/lib/mari/client";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2brEscaped(text: string): string {
  return escapeHtml(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")).replace(
    /\n/g,
    "<br/>"
  );
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function sectionTitle(title: string): string {
  return `<div style="margin:14px 0 6px;font-weight:700;font-size:14px;">${escapeHtml(title)}</div>`;
}

function codeBlock(code: string): string {
  return `<div style="margin:6px 0 12px;padding:10px;border:1px solid #cbd5e1;background:#f8fafc;font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word;">${escapeHtml(code)}</div>`;
}

/** Maringo-HTML: Zeilenumbrüche als &lt;br/&gt; — CSS white-space wird dort oft ignoriert. */
function proseBlock(text: string): string {
  return `<div style="margin:4px 0 8px;line-height:1.5;">${nl2brEscaped(text)}</div>`;
}

/**
 * HTML-Kommentar 1:1 zur Buddy-Analyse-UI (inkl. Lösungsansatz, Schritte, Code).
 * AttachmentTyp 1 / Maringo-Desktop-Notiz.
 */
export function formatAnalysisAsInternalCommentHtml(
  analysis: MariTicketAnalysis,
  opts?: { issueId?: number }
): string {
  const parts: string[] = [
    `<!DOCTYPE HTML>`,
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#0f172a;line-height:1.45;">`,
    `<div style="font-weight:800;font-size:15px;margin-bottom:4px;">Buddy AI-Analyse</div>`,
    `<div style="color:#9a3412;font-size:12px;margin-bottom:10px;">Nur intern — nicht für Kunden</div>`,
  ];
  if (opts?.issueId) {
    parts.push(`<div style="margin-bottom:8px;">Ticket #${opts.issueId}</div>`);
  }

  parts.push(sectionTitle("Zusammenfassung"));
  parts.push(proseBlock(analysis.summary));

  parts.push(sectionTitle(`Vollständigkeit: ${analysis.completeness.score}/100`));
  if (analysis.completeness.missing.length > 0) {
    parts.push(`<div>Fehlend:</div>`);
    parts.push(listHtml(analysis.completeness.missing));
  } else {
    parts.push(
      `<div style="color:#64748b;">Keine kritischen Lücken erkannt.</div>`
    );
  }
  if (analysis.completeness.notes) {
    parts.push(proseBlock(analysis.completeness.notes));
  }

  if (analysis.suggestedTasks.length > 0) {
    parts.push(sectionTitle("Aufgaben"));
    parts.push("<ul>");
    for (const t of analysis.suggestedTasks) {
      const reason = t.reason ? ` — ${escapeHtml(t.reason)}` : "";
      const due = t.dueHint ? ` <i>(fällig ${escapeHtml(t.dueHint)})</i>` : "";
      parts.push(
        `<li><b>${escapeHtml(t.title)}</b>${reason}${due}</li>`
      );
    }
    parts.push("</ul>");
  }

  if (analysis.suggestions.length > 0) {
    parts.push(sectionTitle("Vorschläge"));
    parts.push(listHtml(analysis.suggestions));
  }

  if (analysis.recommendedStatus) {
    const rs = analysis.recommendedStatus;
    const label =
      rs.label ||
      (rs.statusId != null ? `Status-ID ${rs.statusId}` : "Status-Empfehlung");
    parts.push(sectionTitle("Empfohlener Status"));
    parts.push(
      `<div><b>${escapeHtml(label)}</b>${
        rs.reason ? ` — ${escapeHtml(rs.reason)}` : ""
      }</div>`
    );
  }

  const sketch = analysis.solutionSketch;
  if (sketch?.problemStillOpen && sketch.outline) {
    parts.push(sectionTitle("Lösungsansatz (ausführlich)"));
    if (sketch.vendors.length > 0) {
      parts.push(
        `<div style="color:#0369a1;font-size:12px;margin-bottom:6px;">Hersteller: ${escapeHtml(sketch.vendors.join(" · "))}</div>`
      );
    }
    parts.push(proseBlock(sketch.outline));

    if (sketch.steps.length > 0) {
      parts.push(sectionTitle("Schritte"));
      parts.push("<ol>");
      for (const s of sketch.steps) {
        const detail = s.detail
          ? `<div style="margin-top:2px;color:#475569;font-size:12px;">${nl2brEscaped(s.detail)}</div>`
          : "";
        parts.push(
          `<li style="margin-bottom:8px;"><b>${escapeHtml(s.where)}</b> — ${escapeHtml(s.action)}${detail}</li>`
        );
      }
      parts.push("</ol>");
    }

    if (sketch.artifacts.length > 0) {
      parts.push(sectionTitle("Queries / Skripte / Code"));
      for (const a of sketch.artifacts) {
        const meta = [a.kind, a.language].filter(Boolean).join(" · ");
        parts.push(
          `<div style="margin:10px 0 4px;"><b>${escapeHtml(a.title)}</b>${
            meta ? ` <span style="color:#64748b;">(${escapeHtml(meta)})</span>` : ""
          }</div>`
        );
        if (a.note) {
          parts.push(
            `<div style="color:#64748b;font-size:12px;font-style:italic;margin-bottom:4px;">${escapeHtml(a.note)}</div>`
          );
        }
        parts.push(codeBlock(a.code));
      }
    }

    const caveats =
      sketch.caveats?.trim() ||
      "Vorschlag aus allgemein verfügbarem Herstellerwissen (u.a. SAP Business One, nicht S/4) — bitte mit offizieller Doku abgleichen.";
    parts.push(
      `<div style="margin-top:8px;color:#64748b;font-size:12px;">${escapeHtml(caveats)}</div>`
    );
  }

  if (analysis.nextReplyDraft?.trim()) {
    parts.push(sectionTitle("Antwort-Entwurf"));
    parts.push(proseBlock(analysis.nextReplyDraft));
  }

  parts.push(
    `<div style="margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;font-style:italic;">Automatisch aus Buddy · nur für internes Support-Personal sichtbar. Inhalt 1:1 zur Analyse in Buddy.</div>`
  );
  parts.push(`</div>`);
  return parts.join("");
}

/** Freitext-Notiz als intern sichtbares HTML (wie Desktop-Kommentar). */
export function formatPlainTextAsInternalCommentHtml(
  text: string,
  opts?: { issueId?: number }
): string {
  const body = text.trim();
  const parts: string[] = [
    `<!DOCTYPE HTML>`,
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#0f172a;">`,
    `<div style="font-weight:800;margin-bottom:4px;">Interner Kommentar</div>`,
    `<div style="color:#9a3412;font-size:12px;margin-bottom:10px;">Nur intern — nicht für den Kunden</div>`,
  ];
  if (opts?.issueId) {
    parts.push(`<div style="margin-bottom:8px;">Ticket #${opts.issueId}</div>`);
  }
  parts.push(proseBlock(body));
  parts.push(
    `<div style="margin-top:12px;color:#64748b;font-size:11px;font-style:italic;">Manuell aus Buddy · nur für internes Support-Personal sichtbar.</div>`
  );
  parts.push(`</div>`);
  return parts.join("");
}

/**
 * Kunden-sichtbarer Kommentar-HTML (ohne internes Banner).
 * Mailversand übernimmt Maringo selbst.
 */
export function formatPlainTextAsExternalCommentHtml(text: string): string {
  const body = text.trim();
  return [
    `<!DOCTYPE HTML>`,
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#0f172a;line-height:1.5;">`,
    proseBlock(body),
    `</div>`,
  ].join("");
}

/** Für Timeline-Anzeige: Scripts/Handler aus MARI-HTML entfernen. */
export function sanitizeMariNoteHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function looksLikeMariHtml(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  return (
    /^<!DOCTYPE\s+HTML/i.test(t) ||
    /<(div|p|pre|ul|ol|li|br|b|i|span|table)\b/i.test(t)
  );
}

export type MariInternalNotePostResult = {
  attachmentId: number;
  issueId: number;
  internal: boolean;
  importFeedback: number | null;
  importErrorMessage: string | null;
};

type MariAttachmentPostResponse = {
  AttachmentID?: number;
  IssueID?: number;
  Internal?: boolean;
  IMPORT_Feedback?: number;
  IMPORT_ErrorMessage?: string | null;
};

/**
 * Schreibt eine Notiz als SupportIssueAttachment (Typ 1) mit Internal=true.
 * In HANA landet VisibleInternOnly = -1 (nur intern).
 */
export async function postMariInternalNote(params: {
  issueId: number;
  commentHtml: string;
  subject?: string;
}): Promise<MariInternalNotePostResult> {
  const issueId = params.issueId;
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new MariApiError("Ungültige Issue-ID", 400);
  }
  const comment = params.commentHtml.trim();
  if (!comment) {
    throw new MariApiError("Kommentar leer", 400);
  }

  const body = {
    IssueID: issueId,
    Comment: comment,
    Internal: true,
    AttachmentTyp: 1,
    AttachmentSubject: params.subject?.trim() || "Interner Kommentar",
    DisableNotificationSettings: true,
  };

  const res = await mariJson<MariAttachmentPostResponse>(
    "/api/SupportIssueAttachment",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const attachmentId = Number(res.AttachmentID);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    throw new MariApiError(
      res.IMPORT_ErrorMessage || "MARI lieferte keine AttachmentID",
      502,
      res
    );
  }
  if (res.Internal === false) {
    throw new MariApiError(
      "MARI hat Internal=false zurückgegeben — Kommentar nicht als intern bestätigt.",
      502,
      res
    );
  }
  const errMsg = (res.IMPORT_ErrorMessage || "").trim();
  if (errMsg) {
    throw new MariApiError(errMsg, 502, res);
  }

  return {
    attachmentId,
    issueId: Number(res.IssueID) || issueId,
    internal: true,
    importFeedback:
      res.IMPORT_Feedback == null ? null : Number(res.IMPORT_Feedback),
    importErrorMessage: errMsg || null,
  };
}

export async function postAnalysisAsInternalNote(
  issueId: number,
  analysis: MariTicketAnalysis
): Promise<MariInternalNotePostResult> {
  return postMariInternalNote({
    issueId,
    subject: "Interner Kommentar",
    commentHtml: formatAnalysisAsInternalCommentHtml(analysis, { issueId }),
  });
}

export async function postPlainInternalNote(
  issueId: number,
  text: string
): Promise<MariInternalNotePostResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new MariApiError("Kommentar leer", 400);
  }
  return postMariInternalNote({
    issueId,
    subject: "Interner Kommentar",
    commentHtml: formatPlainTextAsInternalCommentHtml(trimmed, { issueId }),
  });
}

/**
 * Schreibt einen kunden-sichtbaren Kommentar (Internal=false).
 * Maringo übernimmt ggf. Mailversand — Buddy macht nur den Write.
 */
export async function postMariExternalNote(params: {
  issueId: number;
  commentHtml: string;
  subject?: string;
}): Promise<MariInternalNotePostResult> {
  const issueId = params.issueId;
  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new MariApiError("Ungültige Issue-ID", 400);
  }
  const comment = params.commentHtml.trim();
  if (!comment) {
    throw new MariApiError("Kommentar leer", 400);
  }

  const body = {
    IssueID: issueId,
    Comment: comment,
    Internal: false,
    AttachmentTyp: 1,
    AttachmentSubject: params.subject?.trim() || "Info an Kunde",
  };

  const res = await mariJson<MariAttachmentPostResponse>(
    "/api/SupportIssueAttachment",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const attachmentId = Number(res.AttachmentID);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    throw new MariApiError(
      res.IMPORT_ErrorMessage || "MARI lieferte keine AttachmentID",
      502,
      res
    );
  }
  if (res.Internal === true) {
    throw new MariApiError(
      "MARI hat Internal=true zurückgegeben — Kommentar nicht als extern bestätigt.",
      502,
      res
    );
  }
  const errMsg = (res.IMPORT_ErrorMessage || "").trim();
  if (errMsg) {
    throw new MariApiError(errMsg, 502, res);
  }

  return {
    attachmentId,
    issueId: Number(res.IssueID) || issueId,
    internal: false,
    importFeedback:
      res.IMPORT_Feedback == null ? null : Number(res.IMPORT_Feedback),
    importErrorMessage: errMsg || null,
  };
}

export async function postPlainExternalNote(
  issueId: number,
  text: string
): Promise<MariInternalNotePostResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new MariApiError("Kommentar leer", 400);
  }
  return postMariExternalNote({
    issueId,
    subject: "Info an Kunde",
    commentHtml: formatPlainTextAsExternalCommentHtml(trimmed),
  });
}
