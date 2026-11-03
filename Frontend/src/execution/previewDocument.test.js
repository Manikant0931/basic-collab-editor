import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspacePath,
  normalizeWorkspaceReference,
} from "./previewDocument.js";

const files = [
  { id: "src", name: "src", type: "folder", parentId: null },
  { id: "pages", name: "pages", type: "folder", parentId: "src" },
  { id: "html", name: "index.html", type: "file", parentId: "pages" },
  { id: "styles", name: "styles", type: "folder", parentId: "src" },
  { id: "css", name: "app.css", type: "file", parentId: "styles" },
];

test("derives workspace paths from the shared parent tree", () => {
  assert.equal(getWorkspacePath("html", files), "src/pages/index.html");
  assert.equal(getWorkspacePath("css", files), "src/styles/app.css");
  assert.equal(getWorkspacePath("missing", files), null);
});

test("resolves relative preview assets inside workspace paths", () => {
  assert.equal(
    normalizeWorkspaceReference(
      "../styles/app.css?v=1",
      "src/pages/index.html",
    ),
    "src/styles/app.css",
  );
  assert.equal(
    normalizeWorkspaceReference("/src/styles/app.css", "src/pages/index.html"),
    "src/styles/app.css",
  );
  assert.equal(
    normalizeWorkspaceReference(
      "https://cdn.example/app.css",
      "src/index.html",
    ),
    null,
  );
});

test("rejects malformed or non-workspace resource references", () => {
  assert.equal(normalizeWorkspaceReference("%E0%A4%A", "index.html"), null);
  assert.equal(
    normalizeWorkspaceReference("//cdn.example/app.js", "index.html"),
    null,
  );
});
