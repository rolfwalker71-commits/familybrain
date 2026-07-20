"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { DocumentInfoButton } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-primitives";
import { IconCircle, pageVisuals } from "@/components/layout/icon-circle";

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

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  noteSources?: TriliumNoteSource[];
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    setError(null);
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
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-3 sm:gap-4 lg:h-[calc(100dvh-4rem)]">
      <PageHeader
        title="Chat"
        description="Stelle Fragen zu deinen synchronisierten und analysierten Dokumenten"
        icon={pageVisuals.chat.icon}
        tone={pageVisuals.chat.tone}
      />

      <Card className="flex min-h-0 flex-1 flex-col border-border/80 shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                <IconCircle icon={Sparkles} tone="indigo" size="lg" />
                <div>
                  <p className="font-medium">Frage deine Dokumentenbasis</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Antworten basieren auf lokalen OCR-Texten und AI-Zusammenfassungen.
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
                    (message.noteSources && message.noteSources.length > 0) ? (
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
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Suche in Dokumenten und Notizen…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <form
            className="flex items-end gap-2 pb-[env(safe-area-inset-bottom)]"
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
