export async function readNdjsonStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  if (!response.body) {
    throw new Error("Keine Stream-Antwort vom Server.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        onEvent(JSON.parse(line) as Record<string, unknown>);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  }

  const remaining = buffer.trim();
  if (remaining) {
    onEvent(JSON.parse(remaining) as Record<string, unknown>);
  }
}
