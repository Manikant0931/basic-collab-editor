import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

function FileGlyph({ name }) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (
    ["js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "cpp", "c"].includes(
      extension,
    )
  ) {
    return <FileCode2 size={15} className="file-glyph code" />;
  }
  if (extension === "json")
    return <FileJson2 size={15} className="file-glyph json" />;
  if (["md", "txt"].includes(extension))
    return <FileText size={15} className="file-glyph text" />;
  return <File size={15} className="file-glyph" />;
}

function FileTree({
  items,
  activeFileId,
  expanded,
  onToggle,
  onOpen,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
}) {
  const childrenByParent = useMemo(() => {
    const groups = new Map();
    items.forEach((item) => {
      const key = item.parentId || "root";
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    groups.forEach((children) =>
      children.sort((left, right) => {
        if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
        return left.name.localeCompare(right.name);
      }),
    );
    return groups;
  }, [items]);

  const renderChildren = (parentId, depth = 0) =>
    (childrenByParent.get(parentId || "root") || []).map((item) => {
      const isFolder = item.type === "folder";
      const isExpanded = expanded.has(item.id);
      return (
        <div key={item.id}>
          <div
            className={`tree-row ${activeFileId === item.id ? "active" : ""}`}
            style={{ "--tree-depth": depth }}
          >
            {isFolder ? (
              <button
                className="tree-main"
                type="button"
                onClick={() => onToggle(item.id)}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{item.name}</span>
              </button>
            ) : (
              <button
                className="tree-main"
                type="button"
                onClick={() => onOpen(item.id)}
              >
                <span className="tree-indent" />
                <FileGlyph name={item.name} />
                <span>{item.name}</span>
              </button>
            )}
            <div className="tree-actions">
              {isFolder && (
                <>
                  <button
                    type="button"
                    title="New file in folder"
                    onClick={() => onCreateFile(item.id)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    type="button"
                    title="New folder inside folder"
                    onClick={() => onCreateFolder(item.id)}
                  >
                    <Folder size={13} />
                  </button>
                </>
              )}
              {item.id !== "main" && (
                <>
                  <button
                    type="button"
                    title="Rename"
                    onClick={() => onRename(item)}
                  >
                    <Settings2 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => onDelete(item)}
                  >
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
          {isFolder && isExpanded && renderChildren(item.id, depth + 1)}
        </div>
      );
    });

  return <div className="file-tree">{renderChildren(null)}</div>;
}

export default function Explorer({
  view,
  files,
  activeFileId,
  getText,
  onOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  minimap,
  onMinimapChange,
}) {
  const [expanded, setExpanded] = useState(() => new Set(["root"]));
  const [query, setQuery] = useState("");
  const toggleFolder = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return files
      .filter((item) => item.type === "file")
      .flatMap((item) => {
        const lines = getText(item.id).toString().split("\n");
        return lines.flatMap((line, index) => {
          const found = line.toLowerCase().indexOf(term);
          return found < 0
            ? []
            : [{ item, line: index + 1, preview: line.trim() || "blank line" }];
        });
      })
      .slice(0, 100);
  }, [files, getText, query]);

  const title = {
    explorer: "Explorer",
    search: "Search",
    source: "Source control",
    settings: "Settings",
  }[view];

  return (
    <aside className="sidebar-panel">
      <div className="sidebar-heading">
        <span>{title}</span>
        {view === "explorer" && (
          <div className="sidebar-heading-actions">
            <button
              type="button"
              title="New file"
              onClick={() => onCreateFile(null)}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              title="New folder"
              onClick={() => onCreateFolder(null)}
            >
              <Folder size={15} />
            </button>
          </div>
        )}
      </div>

      {view === "explorer" &&
        (files.length ? (
          <FileTree
            items={files}
            activeFileId={activeFileId}
            expanded={expanded}
            onToggle={toggleFolder}
            onOpen={onOpen}
            onRename={onRename}
            onDelete={onDelete}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
          />
        ) : (
          <div className="empty-panel">No files in this room yet.</div>
        ))}

      {view === "search" && (
        <div className="sidebar-content">
          <label className="field-label" htmlFor="project-search">
            Search files
          </label>
          <div className="search-field">
            <Search size={15} />
            <input
              id="project-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search in files"
            />
          </div>
          <div className="search-results">
            {!query.trim() && (
              <p className="muted-copy">Search the shared project contents.</p>
            )}
            {query.trim() && !searchResults.length && (
              <p className="muted-copy">No matches found.</p>
            )}
            {searchResults.map((result, index) => (
              <button
                className="search-result"
                key={`${result.item.id}-${result.line}-${index}`}
                type="button"
                onClick={() => onOpen(result.item.id)}
              >
                <strong>
                  <FileGlyph name={result.item.name} /> {result.item.name}
                  <small>:{result.line}</small>
                </strong>
                <span>{result.preview}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === "source" && (
        <div className="sidebar-content placeholder-state">
          <span className="placeholder-icon">⌘</span>
          <strong>Source control is not connected</strong>
          <p>
            Git operations need a repository service and backend integration.
          </p>
        </div>
      )}

      {view === "settings" && (
        <div className="sidebar-content settings-form">
          <label className="setting-row">
            <span>Color theme</span>
            <select
              value={theme}
              onChange={(event) => onThemeChange(event.target.value)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label className="setting-row">
            <span>Editor language</span>
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
            >
              {[
                "javascript",
                "typescript",
                "python",
                "java",
                "html",
                "css",
                "json",
                "markdown",
                "plaintext",
              ].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            <span>Show minimap</span>
            <input
              type="checkbox"
              checked={minimap}
              onChange={(event) => onMinimapChange(event.target.checked)}
            />
          </label>
        </div>
      )}
    </aside>
  );
}
