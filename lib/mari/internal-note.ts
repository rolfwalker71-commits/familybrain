import { MariApiError, mariJson } from "@/lib/mari/client";
import type { MariTicketAnalysis } from "@/lib/mari/analyze-ticket";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function preBlock(text: string): string {
  return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(text)}</pre>`;
}

function listHtml(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

/** HTML-Kommentar wie Maringo-Desktop-Notizen (AttachmentTyp 1). */
export function formatAnalysisAsInternalCommentHtml(
  analysis: MariTicketAnalysis,
  opts?: { issueId?: number }
): string {
  const parts: string[] = [
    `<!DOCTYPE HTML>`,
    `<div><b>Buddy AI-Analyse</b> (nur intern — nicht für Kunden)</div>`,
  ];
  if (opts?.issueId) {
    parts.push(`<div>Ticket #${opts.issueId}</div>`);
  }
  parts.push(`<div><br/></div>`);
  parts.push(`<div><b>Zusammenfassung</b></div>`);
  parts.push(`<div>${escapeHtml(analysis.summary).replace(/\n/g, "<br/>")}</div>`);

  parts.push(`<div><br/></div>`);
  parts.push(
    `<div><b>Vollständigkeit:</b> ${analysis.completeness.score}/100</div>`
  );
  if (analysis.completeness.missing.length > 0) {
    parts.push(`<div>Fehlend:</div>`);
    parts.push(listHtml(analysis.completeness.missing));
  }
  if (analysis.completeness.notes) {
    parts.push(`<div>${escapeHtml(analysis.completeness.notes)}</div>`);
  }

  if (analysis.suggestedTasks.length > 0) {
    parts.push(`<div><br/></div><div><b>Aufgaben</b></div>`);
    parts.push(
      listHtml(
        analysis.suggestedTasks.map((t) =>
          t.reason ? `${t.title} — ${t.reason}` : t.title
        )
      )
    );
  }

  if (analysis.suggestions.length > 0) {
    parts.push(`<div><br/></div><div><b>Vorschläge</b></div>`);
    parts.push(listHtml(analysis.suggestions));
  }

  if (
    analysis.solutionSketch?.problemStillOpen &&
    analysis.solutionSketch.outline
  ) {
    parts.push(`<div><br/></div><div><b>Möglicher Lösungsansatz</b></div>`);
    if (analysis.solutionSketch.vendors.length > 0) {
      parts.push(
        `<div>Hersteller: ${escapeHtml(analysis.solutionSketch.vendors.join(" · "))}</div>`
      );
    }
    parts.push(preBlock(analysis.solutionSketch.outline));
    if (analysis.solutionSketch.steps.length > 0) {
      parts.push(`<div><br/></div><div><b>Schritte</b></div>`);
      parts.push("<ol>");
      for (const s of analysis.solutionSketch.steps) {
        const detail = s.detail ? `<br/><i>${escapeHtml(s.detail)}</i>` : "";
        parts.push(
          `<li><b>${escapeHtml(s.where)}</b> — ${escapeHtml(s.action)}${detail}</li>`
        );
      }
      parts.push("</ol>");
    }
    if (analysis.solutionSketch.artifacts.length > 0) {
      parts.push(`<div><br/></div><div><b>Queries / Code-Vorschläge</b></div>`);
      for (const a of analysis.solutionSketch.artifacts) {
        parts.push(
          `<div><b>${escapeHtml(a.title)}</b> <span>(${escapeHtml(a.kind)})</span></div>`
        );
        if (a.note) {
          parts.push(`<div><i>${escapeHtml(a.note)}</i></div>`);
        }
        parts.push(
          `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;margin:4px 0 12px;">${escapeHtml(a.code)}</pre>`
        );
      }
    }
    if (analysis.solutionSketch.caveats) {
      parts.push(
        `<div><i>${escapeHtml(analysis.solutionSketch.caveats)}</i></div>`
      );
    }
  }

  if (analysis.nextReplyDraft) {
    parts.push(`<div><br/></div><div><b>Antwort-Entwurf</b></div>`);
    parts.push(preBlock(analysis.nextReplyDraft));
  }

  parts.push(
    `<div><br/></div><div><i>Automatisch aus Buddy · nur für internes Support-Personal sichtbar.</i></div>`
  );
  return parts.join("");
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
    AttachmentSubject: params.subject?.trim() || "Buddy AI (intern)",
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
    subject: "Buddy AI-Analyse (intern)",
    commentHtml: formatAnalysisAsInternalCommentHtml(analysis, { issueId }),
  });
}
