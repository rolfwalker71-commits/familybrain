import assert from "node:assert/strict";
import test from "node:test";
import { formatPlainTextAsInternalCommentHtml } from "@/lib/mari/internal-note";

test("formats plain internal note as escaped HTML", () => {
  const html = formatPlainTextAsInternalCommentHtml(
    'Check <script> & "quotes"',
    { issueId: 42 }
  );
  assert.match(html, /Buddy Notiz/);
  assert.match(html, /Ticket #42/);
  assert.match(html, /Check &lt;script&gt; &amp; &quot;quotes&quot;/);
  assert.doesNotMatch(html, /<script>/);
});
