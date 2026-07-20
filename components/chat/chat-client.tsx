"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { DocumentInfoButton } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";
import { copyMarkdownForEmail } from "@/lib/chat/copy-format";

type ChatSource = {
  id: number;
  title: string | null;
  category: string | null;
  shortSummary: string | null;
};

type TriliumNoteSource = {
  noteId: string;
  title: string;
  scopeLabel: string;
  url: string;
};

type GuideSource = {
  id: number;
  title: string;
  excerpt: string;
  score: number;
  pageStart?: number | null;
  pageEnd?: number | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  noteSources?: TriliumNoteSource[];
  guideSources?: GuideSource[];
};

type Correction = {
  id: number;
  topic: string | null;
  content: string;
  active: number;
  created_at: string;
  updated_at: string;
};

const SUGGESTIONS = [
  "Welche Garantien laufen in den nächsten 6 Monaten ab?",
  "Welche Versicherungen habe ich und wann sind die Fristen?",
  "Zeige mir grössere Ausgaben aus diesem Jahr.",
  "Welche Reiseunterlagen sind gespeichert?",
];

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [showCorrections, setShowCorrections] = useState(false);
  const [draftTopic, setDraftTopic] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [editingFromMessageId, setEditingFromMessageId] = useState<string | null>(
    null
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(0);
  const copiedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCorrections() {
    try {
      const res = await fetch("/api/corrections");
      const data = await res.json();
      if (res.ok) setCorrections(data.corrections || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadCorrections();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
    };
  }, []);

  async function copyAssistantMessage(message: Message) {
    try {
      await copyMarkdownForEmail(message.content);
      setCopiedId(message.id);
      if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
      copiedResetRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Kopieren fehlgeschlagen: ${err.message}`
          : "Kopieren in die Zwischenablage fehlgeschlagen."
      );
    }
  }

  function startCorrectionFromMessage(message: Message) {
    setEditingFromMessageId(message.id);
    setDraftTopic("");
    setDraftContent("");
    setShowCorrections(true);
    setStatus(
      "Formuliere die Korrektur knapp und faktisch (z. B. «Erste Kreuzfahrt: Legend of the Seas, Abfahrt 23.10.2026»)."
    );
    setError(null);
  }

  async function saveCorrection() {
    const content = draftContent.trim();
    if (content.length < 3 || savingCorrection) return;

    setSavingCorrection(true);
    setError(null);
    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          topic: draftTopic.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      setCorrections(data.corrections || []);
      setDraftContent("");
      setDraftTopic("");
      setEditingFromMessageId(null);
      setStatus("Korrektur gespeichert — gilt ab der nächsten Frage.");
      setShowCorrections(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCorrection(false);
    }
  }

  async function removeCorrection(id: number) {
    if (!window.confirm("Korrektur wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/corrections/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen");
      setCorrections(data.corrections || []);
      setStatus("Korrektur gelöscht.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    setError(null);
    setStatus(null);
    setInput("");
    messageSequence.current += 1;
    const userMsg: Message = {
      id: `u-${messageSequence.current}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: history.slice(0, -1),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Chat fehlgeschlagen");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${messageSequence.current}`,
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          noteSources: data.noteSources,
          guideSources: data.guideSources,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="shrink-0">
        <PageHeader
          title="Chat"
          description="Fragen zu Dokumenten, Notizen und importierten Guides"
          icon={pageVisuals.chat.icon}
          tone={pageVisuals.chat.tone}
        />
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Korrekturen überschreiben bei Widerspruch die Dokumentdaten.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCorrections((open) => !open)}
            >
              Korrekturen ({corrections.length})
            </Button>
          </div>

          {showCorrections ? (
            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="space-y-2">
                <Label htmlFor="correctionTopic">Thema (optional)</Label>
                <Input
                  id="correctionTopic"
                  value={draftTopic}
                  onChange={(e) => setDraftTopic(e.target.value)}
                  placeholder="z. B. Kreuzfahrt Oktober 2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correctionContent">Korrektur</Label>
                <Textarea
                  id="correctionContent"
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="z. B. Die erste Kreuzfahrt ist mit der Legend of the Seas (nicht Independence)."
                  className="min-h-[72px]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={savingCorrection || draftContent.trim().length < 3}
                  onClick={() => void saveCorrection()}
                >
                  {savingCorrection ? "Speichert…" : "Korrektur speichern"}
                </Button>
                {editingFromMessageId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingFromMessageId(null);
                      setDraftContent("");
                      setDraftTopic("");
                    }}
                  >
                    Abbrechen
                  </Button>
                ) : null}
              </div>

              {corrections.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Noch keine Korrekturen gespeichert.
                </p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {corrections.map((correction) => (
                    <div
                      key={correction.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2"
                    >
                      <div className="min-w-0 text-xs">
                        {correction.topic ? (
                          <div className="font-medium">{correction.topic}</div>
                        ) : null}
                        <div className="whitespace-pre-wrap text-muted-foreground">
                          {correction.content}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Löschen"
                        onClick={() => void removeCorrection(correction.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                <IconCircle icon={Sparkles} tone="indigo" size="lg" />
                <div>
                  <p className="font-medium">Frage deine Dokumentenbasis</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Antworten basieren auf Paperless, Trilium, Guides und deinen
                    gespeicherten Korrekturen.
                  </p>
                </div>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="min-h-11 rounded-full border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user" ? "flex justify-end" : "flex justify-start"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[92%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground sm:max-w-[85%]"
                        : "max-w-[min(100%,42rem)] rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm"
                    }
                  >
                    {message.role === "assistant" ? (
                      <ChatMarkdown content={message.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                    {(message.sources && message.sources.length > 0) ||
                    (message.noteSources && message.noteSources.length > 0) ||
                    (message.guideSources && message.guideSources.length > 0) ? (
                      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          Verwendete Quellen
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.sources?.map((source) => (
                            <div
                              key={`doc-${source.id}`}
                              className="flex max-w-full items-center gap-1.5"
                            >
                              <Link
                                href={`/documents/${source.id}`}
                                title="Quelldokument öffnen"
                                className="max-w-full"
                              >
                                <Badge
                                  variant="secondary"
                                  className="max-w-full cursor-pointer gap-1.5 hover:bg-accent"
                                >
                                  <span className="truncate">
                                    {source.title || `Dokument #${source.id}`}
                                    {source.category
                                      ? ` · ${source.category}`
                                      : ""}
                                  </span>
                                  <ExternalLink className="size-3 shrink-0" />
                                </Badge>
                              </Link>
                              <DocumentInfoButton
                                documentId={source.id}
                                size="icon-sm"
                              />
                            </div>
                          ))}
                          {message.noteSources?.map((note) => (
                            <a
                              key={`note-${note.noteId}`}
                              href={note.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Trilium-Notiz öffnen"
                              className="max-w-full"
                            >
                              <Badge
                                variant="outline"
                                className="max-w-full cursor-pointer gap-1.5 hover:bg-accent"
                              >
                                <span className="truncate">
                                  {note.title} · {note.scopeLabel}
                                </span>
                                <ExternalLink className="size-3 shrink-0" />
                              </Badge>
                            </a>
                          ))}
                          {message.guideSources?.map((guide) => (
                            <Link
                              key={`guide-${guide.id}`}
                              href={`/guides#guide-${guide.id}`}
                              title="Guide öffnen"
                              className="max-w-full"
                            >
                              <Badge
                                variant="secondary"
                                className="max-w-full cursor-pointer gap-1.5 hover:bg-accent"
                              >
                                <span className="truncate">
                                  {guide.title}
                                  {guide.pageStart
                                    ? ` · S. ${guide.pageStart}`
                                    : " · Guide"}
                                </span>
                                <ExternalLink className="size-3 shrink-0" />
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {message.role === "assistant" ? (
                      <div
                        className={
                          (message.sources && message.sources.length > 0) ||
                          (message.noteSources &&
                            message.noteSources.length > 0) ||
                          (message.guideSources && message.guideSources.length > 0)
                            ? "mt-2 flex flex-wrap justify-end gap-1"
                            : "mt-3 flex flex-wrap justify-end gap-1 border-t border-border/60 pt-2"
                        }
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground"
                          onClick={() => startCorrectionFromMessage(message)}
                          title="Faktische Korrektur speichern für künftige Antworten"
                        >
                          <BookmarkPlus className="size-3.5" />
                          Korrigieren
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-muted-foreground"
                          onClick={() => void copyAssistantMessage(message)}
                          title="Antwort formatiert in die Zwischenablage kopieren (für E-Mail)"
                        >
                          {copiedId === message.id ? (
                            <>
                              <Check className="size-3.5" />
                              Kopiert
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" />
                              Kopieren
                            </>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Suche in Dokumenten, Notizen, Guides und Korrekturen…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {status ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <form
            className="flex shrink-0 items-end gap-2 pb-[env(safe-area-inset-bottom)]"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="z. B. Wann endet die Garantie der Waschmaschine?"
              className="min-h-[48px] max-h-40 flex-1 resize-none"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  window.matchMedia("(pointer: fine)").matches
                ) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              size="icon"
              className="size-11"
              aria-label="Nachricht senden"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
