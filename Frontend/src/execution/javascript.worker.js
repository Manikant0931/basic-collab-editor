import {
  isExecutionRequest,
  serializeArguments,
  serializeError,
} from "./executionProtocol.js";

let hasExecuted = false;

self.onmessage = async (event) => {
  if (hasExecuted || !isExecutionRequest(event.data)) return;
  hasExecuted = true;

  const { code, runId } = event.data;
  const startedAt = performance.now();
  const send = self.postMessage.bind(self);
  const originalConsole = globalThis.console;
  const outputConsole = {};

  for (const api of [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "indexedDB",
    "caches",
    "BroadcastChannel",
    "Worker",
    "SharedWorker",
    "WebTransport",
    "RTCPeerConnection",
    "importScripts",
  ]) {
    try {
      Object.defineProperty(globalThis, api, {
        configurable: false,
        value: undefined,
        writable: false,
      });
    } catch {
      try {
        globalThis[api] = undefined;
      } catch {
        // Some browser-provided globals are read-only.
      }
    }
  }

  for (const level of ["log", "info", "warn", "error", "table", "debug"]) {
    outputConsole[level] = (...args) => {
      try {
        send({
          type: "log",
          runId,
          level,
          args: serializeArguments(args),
        });
      } catch {
        send({
          type: "log",
          runId,
          level: "error",
          args: [
            { kind: "string", value: "[Unable to serialize console output]" },
          ],
        });
      }
    };
  }

  try {
    globalThis.console = outputConsole;
    const execute = new Function(
      `"use strict"; return (async () => {\n${code}\n})();`,
    );
    await execute();
    send({
      type: "complete",
      runId,
      durationMs: performance.now() - startedAt,
    });
  } catch (error) {
    send({
      type: "runtime-error",
      runId,
      error: serializeError(error),
      durationMs: performance.now() - startedAt,
    });
  } finally {
    globalThis.console = originalConsole;
  }
};
