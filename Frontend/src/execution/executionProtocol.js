export const MAX_CODE_LENGTH = 100_000;
export const MAX_OUTPUT_ENTRIES = 300;
export const MAX_OUTPUT_CHARACTERS = 100_000;
const MAX_STRING_LENGTH = 4_000;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 5;

export function createRunId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function isExecutionRequest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.type === "run" &&
    typeof value.runId === "string" &&
    value.runId.length > 0 &&
    typeof value.code === "string" &&
    value.code.length <= MAX_CODE_LENGTH
  );
}

export function isWorkerMessage(value, runId) {
  if (value === null || typeof value !== "object" || value.runId !== runId) {
    return false;
  }

  if (value.type === "log") {
    return (
      ["log", "info", "warn", "error", "table", "debug"].includes(
        value.level,
      ) && Array.isArray(value.args)
    );
  }

  if (value.type === "complete") {
    return typeof value.durationMs === "number";
  }

  if (value.type === "runtime-error") {
    return (
      value.error !== null &&
      typeof value.error === "object" &&
      typeof value.error.message === "string"
    );
  }

  return false;
}

export function serializeValue(value, seen = new WeakSet(), depth = 0) {
  if (value === undefined) return { kind: "undefined" };
  if (value === null) return { kind: "null" };
  if (typeof value === "string") {
    return { kind: "string", value: limitString(value) };
  }
  if (typeof value === "number") {
    return {
      kind: "number",
      value: Number.isFinite(value) ? value : String(value),
    };
  }
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (typeof value === "bigint") {
    return { kind: "bigint", value: `${value.toString()}n` };
  }
  if (typeof value === "symbol") {
    return { kind: "symbol", value: limitString(String(value)) };
  }
  if (typeof value === "function") {
    return { kind: "function", value: limitString(value.name || "anonymous") };
  }

  try {
    if (value instanceof Error) {
      return {
        kind: "error",
        name: limitString(value.name || "Error"),
        message: limitString(value.message || ""),
        stack: limitString(value.stack || ""),
      };
    }
  } catch {
    return { kind: "unavailable", value: "<unavailable value>" };
  }

  if (seen.has(value)) return { kind: "circular" };
  if (depth >= MAX_DEPTH) return { kind: "truncated", value: "<max depth>" };
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return {
        kind: "array",
        value: value
          .slice(0, MAX_OBJECT_KEYS)
          .map((item) => serializeValue(item, seen, depth + 1)),
        truncated: value.length > MAX_OBJECT_KEYS,
      };
    }

    const result = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      try {
        result[limitString(key)] = serializeValue(value[key], seen, depth + 1);
      } catch {
        result[limitString(key)] = { kind: "unavailable", value: "<throws>" };
      }
    }
    return {
      kind: "object",
      value: result,
      truncated: keys.length > MAX_OBJECT_KEYS,
    };
  } catch {
    return { kind: "unavailable", value: "<serialization failed>" };
  }
}

export function serializeArguments(args) {
  return args.map((value) => serializeValue(value));
}

export function serializeError(error) {
  return {
    name: limitString(error?.name || "Error"),
    message: limitString(error?.message || String(error)),
    stack: limitString(error?.stack || ""),
  };
}

function limitString(value) {
  const text = String(value);
  return text.length > MAX_STRING_LENGTH
    ? `${text.slice(0, MAX_STRING_LENGTH)}…`
    : text;
}
