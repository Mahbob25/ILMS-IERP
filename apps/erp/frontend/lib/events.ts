"use client";

import { refreshSession } from "@/lib/api";

/**
 * One SSE connection per browser tab, shared by every realtime feature.
 *
 * Deliberately a module-level singleton. A connection per component would
 * reproduce the duplicate-request problem this replaces, and browsers cap
 * concurrent connections per origin.
 *
 * Payloads are the same envelope the server sends for every event type, so a
 * new feature (chat, presence) subscribes with a new type and no transport work.
 */

export type ConnectionState = "idle" | "connecting" | "open" | "down";

export interface ServerEvent {
  id: string;
  type: string;
  ts: string;
  data: Record<string, unknown>;
}

export type StreamEventHandler = (event: ServerEvent) => void;

// Mirrors the event types in app/modules/events/envelope.py.
export const EVENT_READY = "ready";
export const NOTIFICATION_CREATED = "notification.created";
export const NOTIFICATION_UPDATED = "notification.updated";

const STREAM_URL = "/api/v1/events/stream";
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

class EventStreamClient {
  private source: EventSource | null = null;
  private handlers = new Map<string, Set<StreamEventHandler>>();
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private listened = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private authRetried = false;
  private state: ConnectionState = "idle";

  getState(): ConnectionState {
    return this.state;
  }

  /** Subscribe to connection state. Fires immediately with the current value. */
  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to one event type. Returns an unsubscribe function.
   * Opens the shared connection on first use.
   */
  on(type: string, handler: StreamEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);

    if (this.source) {
      this.attach(type);
    } else {
      this.connect();
    }

    return () => {
      const current = this.handlers.get(type);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.handlers.delete(type);
    };
  }

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    for (const listener of Array.from(this.stateListeners)) listener(next);
  }

  private connect() {
    // Guard SSR: Next renders these modules on the server too.
    if (typeof window === "undefined" || this.source) return;
    this.open();
  }

  private open() {
    this.setState("connecting");

    // withCredentials matters: auth is the standard HttpOnly access_token
    // cookie, same-origin via the Next rewrite.
    const source = new EventSource(STREAM_URL, { withCredentials: true });
    this.source = source;
    this.listened = new Set();

    source.onopen = () => {
      this.attempts = 0;
      this.authRetried = false;
      this.setState("open");
    };

    source.onerror = () => {
      // A transport drop leaves it CONNECTING and the browser retries on its
      // own using the server's retry hint — nothing to do. CLOSED means it has
      // given up, which for this endpoint is normally a non-2xx and in practice
      // an expired session cookie that EventSource cannot refresh itself.
      if (source.readyState === EventSource.CONNECTING) {
        this.setState("connecting");
        return;
      }
      this.setState("down");
      source.close();
      this.source = null;
      this.scheduleReconnect();
    };

    for (const type of Array.from(this.handlers.keys())) this.attach(type);
  }

  private attach(type: string) {
    if (!this.source || this.listened.has(type)) return;
    this.listened.add(type);
    // Named listeners are required: every frame carries an `event:` field, so
    // onmessage would never fire for these.
    this.source.addEventListener(type, (event) =>
      this.dispatch(type, event as MessageEvent),
    );
  }

  private dispatch(type: string, event: MessageEvent) {
    let parsed: ServerEvent;
    try {
      parsed = JSON.parse(event.data) as ServerEvent;
    } catch {
      return;
    }

    const set = this.handlers.get(type);
    if (!set) return;

    for (const handler of Array.from(set)) {
      try {
        handler(parsed);
      } catch {
        // One faulty subscriber must not stop the others from seeing the event.
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(BASE_RECONNECT_MS * 2 ** this.attempts, MAX_RECONNECT_MS);
    this.attempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.recoverAndReopen();
    }, delay);
  }

  private async recoverAndReopen() {
    // Attempted at most once per outage: a CLOSED stream is usually an expired
    // session, but a genuinely down backend also reports CLOSED, and this guard
    // keeps that case from hammering the refresh endpoint. A successful open
    // resets it.
    if (!this.authRetried) {
      this.authRetried = true;
      try {
        await refreshSession();
      } catch {
        // Session really is gone; keep backing off.
      }
    }
    this.open();
  }
}

export const eventStream = new EventStreamClient();
