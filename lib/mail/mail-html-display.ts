/**
 * Sanitize mail HTML for display and optionally block remote images
 * (tracking pixels / privacy) until the user opts in.
 */

export type PreparedMailHtml = {
  html: string;
  externalImageCount: number;
  hasHtml: boolean;
};

/** Strip scripts/handlers; keep basic formatting for Outlook/Gmail HTML. */
export function sanitizeMailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "data:blocked");
}

function extractImgSrc(attrs: string): string | null {
  const m =
    attrs.match(/\bsrc\s*=\s*"([^"]*)"/i) ||
    attrs.match(/\bsrc\s*=\s*'([^']*)'/i) ||
    attrs.match(/\bsrc\s*=\s*([^\s>]+)/i);
  return m?.[1]?.trim() || null;
}

function isRemoteImageSrc(src: string): boolean {
  return /^(https?:)?\/\//i.test(src) || /^\/\//.test(src);
}

function isSafeInlineSrc(src: string): boolean {
  return /^data:image\//i.test(src);
}

export function countExternalMailImages(html: string): number {
  let count = 0;
  const re = /<img\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = extractImgSrc(m[1] || "");
    if (src && isRemoteImageSrc(src)) count += 1;
  }
  return count;
}

/** Block remote http(s) images; keep data: images. cid: shown as placeholder. */
export function blockRemoteMailImages(html: string): {
  html: string;
  blockedCount: number;
} {
  let blockedCount = 0;
  const next = html.replace(/<img\b([^>]*?)\/?>/gi, (_full, attrs: string) => {
    const src = extractImgSrc(attrs);
    if (!src) {
      blockedCount += 1;
      return `<span class="mail-img-ph" title="Bild">[Bild]</span>`;
    }
    if (isSafeInlineSrc(src)) return `<img${attrs}>`;
    if (src.toLowerCase().startsWith("cid:")) {
      blockedCount += 1;
      return `<span class="mail-img-ph" title="Eingebettetes Bild">[Bild]</span>`;
    }
    if (isRemoteImageSrc(src)) {
      blockedCount += 1;
      return `<span class="mail-img-ph" title="Bild blockiert">[Bild blockiert]</span>`;
    }
    blockedCount += 1;
    return `<span class="mail-img-ph" title="Bild">[Bild]</span>`;
  });
  return { html: next, blockedCount };
}

export function prepareMailHtmlForDisplay(
  rawHtml: string | null | undefined,
  options?: { loadRemoteImages?: boolean }
): PreparedMailHtml {
  const raw = (rawHtml || "").trim();
  if (!raw) {
    return { html: "", externalImageCount: 0, hasHtml: false };
  }
  const sanitized = sanitizeMailHtml(raw);
  const externalImageCount = countExternalMailImages(sanitized);
  if (options?.loadRemoteImages) {
    // Still strip cid: (no attachment proxy yet) and unsafe protocols
    const withCidBlocked = sanitized.replace(
      /<img\b([^>]*?)\/?>/gi,
      (full, attrs: string) => {
        const src = extractImgSrc(attrs);
        if (src && src.toLowerCase().startsWith("cid:")) {
          return `<span class="mail-img-ph" title="Eingebettetes Bild">[Bild]</span>`;
        }
        return full;
      }
    );
    return {
      html: withCidBlocked.slice(0, 80_000),
      externalImageCount,
      hasHtml: true,
    };
  }
  const blocked = blockRemoteMailImages(sanitized);
  return {
    html: blocked.html.slice(0, 80_000),
    externalImageCount: Math.max(externalImageCount, blocked.blockedCount),
    hasHtml: true,
  };
}
