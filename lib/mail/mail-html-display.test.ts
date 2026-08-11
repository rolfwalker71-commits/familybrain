import assert from "node:assert/strict";
import test from "node:test";
import {
  blockRemoteMailImages,
  countExternalMailImages,
  prepareMailHtmlForDisplay,
  sanitizeMailHtml,
} from "./mail-html-display.ts";

test("sanitizeMailHtml strips script and handlers", () => {
  const out = sanitizeMailHtml(
    `<p onclick="alert(1)">Hi</p><script>x()</script><a href="javascript:alert(1)">x</a>`
  );
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("onclick"), false);
  assert.equal(out.includes("javascript:"), false);
});

test("blockRemoteMailImages blocks http images", () => {
  const { html, blockedCount } = blockRemoteMailImages(
    `<p>Hi</p><img src="https://evil.test/t.png" alt="x"><img src="data:image/png;base64,xx">`
  );
  assert.equal(blockedCount, 1);
  assert.equal(html.includes("https://evil.test"), false);
  assert.equal(html.includes("data:image/png"), true);
});

test("prepareMailHtmlForDisplay opt-in loads remote images", () => {
  const raw = `<div><img src="https://cdn.example/a.png"></div>`;
  const blocked = prepareMailHtmlForDisplay(raw, { loadRemoteImages: false });
  assert.ok(blocked.externalImageCount >= 1);
  assert.equal(blocked.html.includes("https://cdn.example"), false);

  const open = prepareMailHtmlForDisplay(raw, { loadRemoteImages: true });
  assert.equal(open.html.includes("https://cdn.example"), true);
});

test("countExternalMailImages", () => {
  assert.equal(
    countExternalMailImages(`<img src='http://a'><img src="//b"><img src="data:image/gif;base64,x">`),
    2
  );
});
