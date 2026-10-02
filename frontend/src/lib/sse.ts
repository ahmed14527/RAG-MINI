export interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * Incremental Server-Sent Events parser: feed it text chunks as they arrive,
 * it returns the complete events found so far and buffers the remainder.
 */
export function createSSEParser() {
  let buffer = "";

  return function feed(chunk: string): SSEEvent[] {
    buffer += chunk.replace(/\r\n/g, "\n");
    const events: SSEEvent[] = [];
    let boundary: number;

    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;

      const raw = dataLines.join("\n");
      try {
        events.push({ event, data: JSON.parse(raw) });
      } catch {
        events.push({ event, data: raw });
      }
    }
    return events;
  };
}
