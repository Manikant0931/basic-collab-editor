import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { ExecutionController } from "./executionController.js";
import {
  isWorkerMessage,
  serializeArguments,
  serializeValue,
} from "./executionProtocol.js";

class FakeWorker extends EventEmitter {
  terminated = false;
  posted = [];

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  send(data) {
    this.onmessage?.({ data });
  }
}

test("serializes primitives, nested values, undefined, and circular references", () => {
  const shared = { count: 2 };
  const circular = { shared };
  circular.self = circular;

  assert.deepEqual(serializeValue(undefined), { kind: "undefined" });
  assert.deepEqual(serializeValue(null), { kind: "null" });
  assert.deepEqual(serializeValue([1, "two"]), {
    kind: "array",
    value: [
      { kind: "number", value: 1 },
      { kind: "string", value: "two" },
    ],
    truncated: false,
  });
  assert.equal(serializeValue(circular).value.self.kind, "circular");
  assert.equal(serializeValue(new TypeError("bad input")).name, "TypeError");
});

test("accepts only current-run messages with supported shapes", () => {
  assert.equal(
    isWorkerMessage(
      { type: "complete", runId: "run-1", durationMs: 3 },
      "run-1",
    ),
    true,
  );
  assert.equal(
    isWorkerMessage(
      { type: "complete", runId: "run-0", durationMs: 3 },
      "run-1",
    ),
    false,
  );
  assert.equal(
    isWorkerMessage(
      { type: "log", runId: "run-1", level: "unknown", args: [] },
      "run-1",
    ),
    false,
  );
});

test("forwards console messages and terminates after completion", () => {
  const events = [];
  const worker = new FakeWorker();
  const controller = new ExecutionController({
    onEvent: (event) => events.push(event),
    workerFactory: () => worker,
  });

  const runId = controller.run("console.log('hello')");
  worker.send({
    type: "log",
    runId,
    level: "log",
    args: serializeArguments(["hello"]),
  });
  worker.send({ type: "complete", runId, durationMs: 2 });
  worker.send({ type: "log", runId, level: "log", args: [] });

  assert.equal(worker.posted[0].code, "console.log('hello')");
  assert.deepEqual(
    events.map((event) => event.type),
    ["started", "log", "complete"],
  );
  assert.equal(worker.terminated, true);
});

test("stops the current worker and ignores messages from the stopped run", () => {
  const events = [];
  const worker = new FakeWorker();
  const controller = new ExecutionController({
    onEvent: (event) => events.push(event),
    workerFactory: () => worker,
  });

  const runId = controller.run("while (true) {}");
  assert.equal(controller.stop(), runId);
  worker.send({ type: "complete", runId, durationMs: 1 });

  assert.equal(worker.terminated, true);
  assert.deepEqual(
    events.map((event) => event.type),
    ["started", "stopped"],
  );
});

test("terminates a worker when its timeout expires", async () => {
  const events = [];
  const worker = new FakeWorker();
  const controller = new ExecutionController({
    onEvent: (event) => events.push(event),
    timeoutMs: 15,
    workerFactory: () => worker,
  });

  controller.run("while (true) {}");
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(worker.terminated, true);
  assert.equal(events.at(-1).type, "timeout");
});

test("replaces a previous run without accepting stale results", () => {
  const events = [];
  const workers = [];
  const controller = new ExecutionController({
    onEvent: (event) => events.push(event),
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });

  const previousRun = controller.run("console.log('old')");
  const currentRun = controller.run("console.log('new')");
  workers[0].send({ type: "complete", runId: previousRun, durationMs: 1 });
  workers[1].send({ type: "complete", runId: currentRun, durationMs: 2 });

  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, true);
  assert.equal(events.at(-1).runId, currentRun);
});
