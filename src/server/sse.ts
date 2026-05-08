/**
 * SSE broadcast hub.
 *
 * Per eng review (D12): server broadcasts an SSE event at every write time;
 * the watcher keeps an in-memory Set of "writes I just made" and consumes
 * its own watcher events silently to avoid double-broadcast. External
 * writes (CLI, git pull) flow through the watcher and broadcast normally.
 */

export type SseEvent = {
  /** Logical event name (e.g. "story-changed", "stories-changed"). */
  type: string;
  /** Path that changed, when applicable. */
  path?: string;
  /** ID that changed, when applicable. */
  id?: string;
  /** Free-form payload. */
  data?: unknown;
};

type Subscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  closed: boolean;
};

const encoder = new TextEncoder();

export class SseHub {
  private subscribers = new Set<Subscriber>();

  /** Open a streaming response for an SSE client. */
  openStream(): Response {
    let sub: Subscriber;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        sub = { controller, closed: false };
        this.subscribers.add(sub);
        // Initial comment to establish the stream
        controller.enqueue(encoder.encode(": connected\n\n"));
      },
      cancel: () => {
        if (sub) {
          sub.closed = true;
          this.subscribers.delete(sub);
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  /** Broadcast an event to every connected client. */
  broadcast(event: SseEvent): void {
    const payload =
      `event: ${event.type}\n` + `data: ${JSON.stringify({ ...event, type: undefined })}\n\n`;
    const bytes = encoder.encode(payload);
    for (const sub of [...this.subscribers]) {
      if (sub.closed) {
        this.subscribers.delete(sub);
        continue;
      }
      try {
        sub.controller.enqueue(bytes);
      } catch {
        // Client closed; remove from set
        sub.closed = true;
        this.subscribers.delete(sub);
      }
    }
  }

  /** Close all open subscriptions; intended for server shutdown. */
  closeAll(): void {
    for (const sub of this.subscribers) {
      if (sub.closed) continue;
      try {
        sub.controller.close();
      } catch {
        /* ignore */
      }
      sub.closed = true;
    }
    this.subscribers.clear();
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
