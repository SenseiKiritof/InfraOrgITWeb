import { vi } from "vitest";

/** WebSocket finto: registra i byte inviati e permette di simulare l'output. */
export class FakeSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;
  binaryType = "arraybuffer";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(value: unknown) {
    this.sent.push(value);
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
  }

  emit(text: string) {
    const bytes = new TextEncoder().encode(text);
    this.onmessage?.({ data: bytes.buffer as ArrayBuffer });
  }

  emitText(text: string) {
    (this.onmessage as ((event: { data: string }) => void) | null)?.({
      data: text,
    });
  }
}

export function stubWebSocket() {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
}
