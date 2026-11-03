import { Editor } from "@monaco-editor/react";
import { Check, PanelBottomClose, PanelBottomOpen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import "./App.css";
import Explorer from "./components/Explorer.jsx";
import FileActionDialog from "./components/FileActionDialog.jsx";
import {
  ActivityBar,
  BottomPanel,
  CollaborationPanel,
  JoinScreen,
  StatusBar,
  TopBar,
} from "./components/IdeChrome.jsx";
import {
  ROOT_FILE_ID,
  useCollaborativeWorkspace,
} from "./useCollaborativeWorkspace.js";

const DEFAULT_ROOM = "monaco";
const PREFERENCES_KEY = "browser-ide:preferences";

function readPreferences() {
  try {
    return JSON.parse(window.localStorage.getItem(PREFERENCES_KEY)) || {};
  } catch {
    return {};
  }
}

function App() {
  const initialQuery = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [username, setUsername] = useState(initialQuery.get("username") || "");
  const [room] = useState(initialQuery.get("room") || DEFAULT_ROOM);
  const workspace = useCollaborativeWorkspace(username, room);
  const { getText, saveNow } = workspace;
  const [activeFileId, setActiveFileId] = useState(ROOT_FILE_ID);
  const [openFileIds, setOpenFileIds] = useState([ROOT_FILE_ID]);
  const [activeView, setActiveView] = useState("explorer");
  const [theme, setTheme] = useState("dark");
  const [minimap, setMinimap] = useState(true);
  const [panelTab, setPanelTab] = useState("output");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(210);
  const [sidebarWidth, setSidebarWidth] = useState(252);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({
    lineNumber: 1,
    column: 1,
  });
  const [runNotice, setRunNotice] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [fileDialog, setFileDialog] = useState(null);
  const editorRef = useRef(null);
  const bindingRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeFile = workspace.files.find((file) => file.id === activeFileId);
  const activeLanguage = activeFile?.language || "javascript";

  useEffect(() => {
    const preferences = readPreferences();
    setActiveView(preferences.activeView || "explorer");
    setTheme(preferences.theme || "dark");
    setMinimap(preferences.minimap ?? true);
    setPanelOpen(preferences.panelOpen ?? true);
    setPanelHeight(preferences.panelHeight || 210);
    setSidebarWidth(preferences.sidebarWidth || 252);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        activeView,
        theme,
        minimap,
        panelOpen,
        panelHeight,
        sidebarWidth,
      }),
    );
  }, [activeView, minimap, panelHeight, panelOpen, sidebarWidth, theme]);

  useEffect(() => {
    if (!workspace.files.some((file) => file.id === activeFileId)) {
      setActiveFileId(
        workspace.files.find((file) => file.type === "file")?.id ||
          ROOT_FILE_ID,
      );
    }
  }, [activeFileId, workspace.files]);

  useEffect(() => {
    const fileIds = new Set(
      workspace.files
        .filter((file) => file.type === "file")
        .map((file) => file.id),
    );
    setOpenFileIds((current) => {
      const next = current.filter((id) => fileIds.has(id));
      return next.length
        ? next
        : fileIds.has(ROOT_FILE_ID)
          ? [ROOT_FILE_ID]
          : [];
    });
  }, [workspace.files]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message) => setToast(message), []);

  const openFile = (fileId) => {
    setActiveFileId(fileId);
    setOpenFileIds((current) =>
      current.includes(fileId) ? current : [...current, fileId],
    );
  };

  const closeTab = (fileId) => {
    if (openFileIds.length < 2) return;
    const remaining = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(remaining);
    if (activeFileId === fileId)
      setActiveFileId(remaining[remaining.length - 1]);
  };

  const bindEditor = useCallback(
    (editor, fileId) => {
      const model = editor.getModel();
      if (!model) return;
      bindingRef.current?.destroy();
      bindingRef.current = new MonacoBinding(
        getText(fileId),
        model,
        new Set([editor]),
      );
    },
    [getText],
  );

  const handleEditorMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      bindEditor(editor, activeFile?.id || ROOT_FILE_ID);
      editor.layout();
      editor.onDidChangeCursorPosition(({ position }) =>
        setCursorPosition({
          lineNumber: position.lineNumber,
          column: position.column,
        }),
      );
    },
    [activeFile?.id, bindEditor],
  );

  useEffect(
    () => () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const handleShortcut = (event) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      } else if (command && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setActiveView("search");
      } else if (command && event.key.toLowerCase() === "b") {
        event.preventDefault();
        if (window.matchMedia("(max-width: 620px)").matches) {
          setMobileSidebarOpen((open) => !open);
        } else {
          setSidebarCollapsed((collapsed) => !collapsed);
        }
      } else if (command && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setPanelOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [saveNow]);

  const handleJoin = (event) => {
    event.preventDefault();
    const nextUsername = event.currentTarget.username.value.trim();
    if (!nextUsername) return;
    const params = new URLSearchParams(window.location.search);
    params.set("room", room);
    params.set("username", nextUsername);
    window.history.pushState({}, "", `?${params.toString()}`);
    setUsername(nextUsername);
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    url.searchParams.delete("username");
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      notify("Room invitation link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Clipboard access is unavailable in this browser");
    }
  };

  const handleRun = () => {
    setPanelTab("output");
    setPanelOpen(true);
    setRunNotice("Execution is not available in this frontend-only phase.");
  };

  const handleCreateFile = (parentId) => {
    setFileDialog({ type: "create-file", parentId });
  };

  const handleCreateFolder = (parentId) => {
    setFileDialog({ type: "create-folder", parentId });
  };

  const handleRename = (item) => {
    setFileDialog({ type: "rename", item });
  };

  const handleDelete = (item) => {
    setFileDialog({ type: "delete", item });
  };

  const handleFileDialogConfirm = (name) => {
    const action = fileDialog;
    if (!action) return;
    if (action.type === "create-file") {
      openFile(workspace.createFile(name, action.parentId));
    } else if (action.type === "create-folder") {
      workspace.createFolder(name, action.parentId);
    } else if (action.type === "rename") {
      workspace.renameItem(action.item, name);
    } else if (action.type === "delete") {
      workspace.deleteItem(action.item.id);
      if (activeFileId === action.item.id) setActiveFileId(ROOT_FILE_ID);
    }
    setFileDialog(null);
  };

  const handleExport = () => {
    const payload = {
      format: "codetogether-project",
      version: 1,
      room,
      files: workspace.files.map((file) => ({
        ...file,
        contents:
          file.type === "file"
            ? workspace.getText(file.id).toString()
            : undefined,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workspace-${room}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Workspace exported as JSON");
  };

  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload.format !== "codetogether-project" ||
        !Array.isArray(payload.files)
      ) {
        throw new Error("Unsupported project file");
      }
      const idMap = new Map();
      let pendingFolders = payload.files.filter(
        (item) => item.type === "folder",
      );
      while (pendingFolders.length) {
        const remaining = [];
        pendingFolders.forEach((item) => {
          if (item.parentId && !idMap.has(item.parentId)) {
            remaining.push(item);
            return;
          }
          idMap.set(
            item.id,
            workspace.createFolder(item.name, idMap.get(item.parentId) || null),
          );
        });
        if (remaining.length === pendingFolders.length) {
          throw new Error(
            "Project folders contain an invalid parent reference",
          );
        }
        pendingFolders = remaining;
      }
      let firstImportedFileId = null;
      payload.files
        .filter((item) => item.type === "file")
        .forEach((item) => {
          const id = workspace.createFile(
            item.name,
            idMap.get(item.parentId) || null,
          );
          idMap.set(item.id, id);
          firstImportedFileId ||= id;
          const text = workspace.getText(id);
          if (item.contents) text.insert(0, item.contents);
          if (item.language) workspace.updateLanguage({ id }, item.language);
        });
      openFile(firstImportedFileId || ROOT_FILE_ID);
      notify("Workspace imported");
    } catch {
      notify("Could not import this project file");
    } finally {
      event.target.value = "";
    }
  };

  const beginSidebarResize = (event) => {
    event.preventDefault();
    const move = (moveEvent) =>
      setSidebarWidth(Math.min(420, Math.max(190, moveEvent.clientX - 48)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const beginPanelResize = (event) => {
    event.preventDefault();
    const move = (moveEvent) =>
      setPanelHeight(
        Math.min(
          440,
          Math.max(110, window.innerHeight - moveEvent.clientY - 28),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  if (!username) return <JoinScreen room={room} onJoin={handleJoin} />;

  return (
    <main
      className={`ide-shell theme-${theme} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      <TopBar
        room={room}
        saveState={workspace.saveState}
        onRun={handleRun}
        onShare={handleShare}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleExport}
        username={username}
        onMenu={() => {
          setSidebarCollapsed(false);
          setMobileSidebarOpen((open) => !open);
        }}
        onSettings={() => {
          setActiveView("settings");
          setSidebarCollapsed(false);
        }}
        copied={copied}
      />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={handleImport}
      />
      <FileActionDialog
        dialog={fileDialog}
        onClose={() => setFileDialog(null)}
        onConfirm={handleFileDialogConfirm}
      />
      <div className="ide-body">
        <ActivityBar
          activeView={activeView}
          onChange={(view) => {
            setActiveView(view);
            setSidebarCollapsed(false);
            setMobileSidebarOpen(false);
          }}
        />
        <div className="sidebar-wrap">
          <Explorer
            view={activeView}
            files={workspace.files}
            activeFileId={activeFileId}
            getText={workspace.getText}
            onOpen={openFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
            onDelete={handleDelete}
            theme={theme}
            onThemeChange={setTheme}
            language={activeLanguage}
            onLanguageChange={(language) =>
              activeFile && workspace.updateLanguage(activeFile, language)
            }
            minimap={minimap}
            onMinimapChange={setMinimap}
          />
          <div
            className="sidebar-resize-handle"
            onPointerDown={beginSidebarResize}
            role="separator"
            aria-label="Resize sidebar"
          />
        </div>
        <section className="editor-column">
          <div className="editor-area">
            <div className="editor-main">
              <div className="editor-tabs">
                {openFileIds
                  .map((fileId) =>
                    workspace.files.find((file) => file.id === fileId),
                  )
                  .filter((file) => file?.type === "file")
                  .map((file) => (
                    <div
                      role="tab"
                      tabIndex={0}
                      className={`editor-tab ${file.id === activeFileId ? "active" : ""}`}
                      key={file.id}
                      aria-selected={file.id === activeFileId}
                      onClick={() => openFile(file.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          openFile(file.id);
                      }}
                    >
                      <span className="tab-language-dot" />
                      {file.name}
                      {file.id === activeFileId &&
                        workspace.saveState !== "saved" && (
                          <span
                            className={`tab-dirty ${workspace.saveState}`}
                            title={
                              workspace.saveState === "error"
                                ? "Local save failed"
                                : "Saving locally"
                            }
                          />
                        )}
                      {openFileIds.length > 1 && (
                        <button
                          type="button"
                          className="tab-close"
                          title="Close tab"
                          aria-label={`Close ${file.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            closeTab(file.id);
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                <div className="editor-tab-spacer" />
                <button
                  className="panel-toggle-button"
                  type="button"
                  title={panelOpen ? "Hide bottom panel" : "Show bottom panel"}
                  onClick={() => setPanelOpen((open) => !open)}
                >
                  {panelOpen ? (
                    <PanelBottomClose size={15} />
                  ) : (
                    <PanelBottomOpen size={15} />
                  )}
                </button>
              </div>
              <div className="breadcrumb">
                <span>workspace</span>
                <span>/</span>
                <strong>{activeFile?.name || "main.js"}</strong>
                <span className="breadcrumb-sync">
                  <Check size={12} /> synced
                </span>
              </div>
              <div className="monaco-frame">
                {activeFile ? (
                  <Editor
                    key={activeFile.id}
                    height="100%"
                    path={`inmemory://workspace/${room}/${activeFile.id}`}
                    language={activeLanguage}
                    defaultValue=""
                    keepCurrentModel
                    theme={theme === "dark" ? "vs-dark" : "vs"}
                    options={{
                      automaticLayout: true,
                      minimap: { enabled: minimap },
                      lineNumbers: "on",
                      fontSize: 13,
                      fontFamily:
                        "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
                      lineHeight: 22,
                      padding: { top: 14, bottom: 14 },
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "all",
                      smoothScrolling: true,
                      tabSize: 2,
                      wordWrap: "off",
                      automaticClosingBrackets: "always",
                    }}
                    onMount={handleEditorMount}
                  />
                ) : (
                  <div className="editor-loading">
                    <span className="loading-indicator" />
                    Loading shared workspace
                  </div>
                )}
              </div>
            </div>
            <CollaborationPanel
              users={workspace.users}
              room={room}
              connection={workspace.connection}
              onShare={handleShare}
              copied={copied}
            />
          </div>
          {panelOpen ? (
            <BottomPanel
              tab={panelTab}
              onTabChange={setPanelTab}
              height={panelHeight}
              onResize={beginPanelResize}
              notice={runNotice}
              onClear={() => setRunNotice("")}
              onClose={() => setPanelOpen(false)}
            />
          ) : (
            <div className="collapsed-panel">
              <span>Panel</span>
              <button type="button" onClick={() => setPanelOpen(true)}>
                <PanelBottomOpen size={14} /> Show panel
              </button>
            </div>
          )}
        </section>
      </div>
      <StatusBar
        language={activeLanguage}
        position={cursorPosition}
        connection={workspace.connection}
        room={room}
      />
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      {!workspace.synced && (
        <div className="sync-overlay" aria-live="polite">
          <span className="loading-indicator" />
          {workspace.connection === "connected"
            ? "Syncing room"
            : "Connecting to room"}
        </div>
      )}
    </main>
  );
}

export default App;
