import {
  createRunId,
  isWorkerMessage,
  MAX_CODE_LENGTH,
  MAX_OUTPUT_CHARACTERS,
  MAX_OUTPUT_ENTRIES,
} from "./executionProtocol.js";

const defaultWorkerFactory = () =>
  new Worker(new URL("./javascript.worker.js", import.meta.url), {
    type: "module",
  });

export class ExecutionController {
  constructor({
    onEvent = () => {},
    timeoutMs = 5_000,
    workerFactory = defaultWorkerFactory,
  } = {}) {
    this.onEvent = onEvent;
    this.timeoutMs = timeoutMs;
    this.workerFactory = workerFactory;
    this.active = null;
  }

  run(code) {
    this.cancel("replaced", false);
    if (typeof code !== "string" || code.length > MAX_CODE_LENGTH) {
      this.onEvent({
        type: "runtime-error",
        runId: null,
        error: {
          name: "InputError",
          message: `Code must be a string no longer than ${MAX_CODE_LENGTH} characters.`,
          stack: "",
        },
        durationMs: 0,
      });
      return null;
    }

    const runId = createRunId();
    let worker;
    try {
      worker = this.workerFactory();
    } catch (error) {
      this.onEvent({
        type: "worker-error",
        runId,
        error: normalizeError(error),
      });
      return null;
    }

    const active = {
      runId,
      worker,
      timer: null,
      outputEntries: 0,
      outputCharacters: 0,
      truncationReported: false,
    };
    this.active = active;

    worker.onmessage = ({ data }) => this.handleMessage(active, data);
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (this.active !== active) return;
      this.finish(active, {
        type: "worker-error",
        runId,
        error: {
          name: "WorkerError",
          message: event.message || "The JavaScript worker failed.",
          stack: event.error?.stack || "",
        },
      });
    };

    active.timer = setTimeout(() => {
      if (this.active !== active) return;
      this.finish(active, {
        type: "timeout",
        runId,
        timeoutMs: this.timeoutMs,
      });
    }, this.timeoutMs);

    this.onEvent({ type: "started", runId });
    try {
      worker.postMessage({ type: "run", runId, code });
    } catch (error) {
      this.finish(active, {
        type: "worker-error",
        runId,
        error: normalizeError(error),
      });
    }
    return runId;
  }

  stop() {
    if (!this.active) return false;
    const { runId } = this.active;
    this.cancel("stopped", true);
    return runId;
  }

  dispose() {
    this.cancel("disposed", false);
  }

  cancel(reason, notify) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    clearTimeout(active.timer);
    active.worker.onmessage = null;
    active.worker.onerror = null;
    active.worker.terminate();
    if (notify) this.onEvent({ type: "stopped", runId: active.runId, reason });
  }

  handleMessage(active, message) {
    if (this.active !== active || !isWorkerMessage(message, active.runId)) {
      return;
    }

    if (message.type === "log") {
      const size = safeMessageSize(message);
      if (
        active.outputEntries >= MAX_OUTPUT_ENTRIES ||
        active.outputCharacters + size > MAX_OUTPUT_CHARACTERS
      ) {
        if (!active.truncationReported) {
          active.truncationReported = true;
          this.onEvent({ type: "output-truncated", runId: active.runId });
        }
        return;
      }
      active.outputEntries += 1;
      active.outputCharacters += size;
      this.onEvent(message);
      return;
    }

    this.finish(active, message);
  }

  finish(active, event) {
    if (this.active !== active) return;
    this.active = null;
    clearTimeout(active.timer);
    active.worker.onmessage = null;
    active.worker.onerror = null;
    active.worker.terminate();
    this.onEvent(event);
  }
}

function safeMessageSize(message) {
  try {
    return JSON.stringify(message).length;
  } catch {
    return MAX_OUTPUT_CHARACTERS;
  }
}

function normalizeError(error) {
  return {
    name: error?.name || "WorkerError",
    message: error?.message || String(error),
    stack: error?.stack || "",
  };
}
