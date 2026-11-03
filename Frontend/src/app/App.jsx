import { Editor } from "@monaco-editor/react";
import { Check, PanelBottomClose, PanelBottomOpen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import { ExecutionController } from "../execution/executionController.js";
import { createRunId } from "../execution/executionProtocol.js";
import {
  buildCssPreviewDocument,
  buildPreviewDocument,
} from "../execution/previewDocument.js";
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
const PREVIEW_WATCHDOG_MS = 5_000;

function expirePreviewRun(runId, refs) {
  if (refs.previewRunIdRef.current !== runId) return;
  refs.previewRunIdRef.current = null;
  window.clearTimeout(refs.previewTimerRef.current);
  refs.setPreviewSrcDoc("");
  refs.setExecutionState("timeout");
  refs.setExecutionEvents((current) => [
    ...current,
    { type: "timeout", timeoutMs: PREVIEW_WATCHDOG_MS, runId },
  ]);
}

function schedulePreviewWatchdog(runId, refs) {
  window.clearTimeout(refs.previewTimerRef.current);
  refs.previewTimerRef.current = window.setTimeout(
    () => expirePreviewRun(runId, refs),
    PREVIEW_WATCHDOG_MS,
  );
}

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
  const [panelTab, setPanelTab] = useState("console");
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(210);
  const [sidebarWidth, setSidebarWidth] = useState(252);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({
    lineNumber: 1,
    column: 1,
  });
  const [executionState, setExecutionState] = useState("idle");
  const [executionEvents, setExecutionEvents] = useState([]);
  const [previewSrcDoc, setPreviewSrcDoc] = useState("");
  const [previewRunId, setPreviewRunId] = useState(null);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [fileDialog, setFileDialog] = useState(null);
  const editorRef = useRef(null);
  const activeFileIdRef = useRef(activeFileId);
  const editorFileIdRef = useRef(null);
  const bindingRef = useRef(null);
  const fileInputRef = useRef(null);
  const executionControllerRef = useRef(null);
  const runHandlerRef = useRef(null);
  const previewFrameRef = useRef(null);
  const previewRunIdRef = useRef(null);
  const previewTimerRef = useRef(null);
  const previewHeartbeatSeenRef = useRef(false);
  const previewOutputRef = useRef({ entries: 0, characters: 0 });
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
    const handlePreviewMessage = (event) => {
      if (
        event.source !== previewFrameRef.current?.contentWindow ||
        event.data?.channel !== "codetogether-preview" ||
        event.data.runId !== previewRunIdRef.current
      ) {
        return;
      }

      const data = event.data;
      if (data.type === "heartbeat") {
        if (!previewHeartbeatSeenRef.current) {
          previewHeartbeatSeenRef.current = true;
          setExecutionEvents((current) => [
            ...current,
            { type: "preview-responsive", runId: data.runId },
          ]);
        }
        schedulePreviewWatchdog(data.runId, {
          previewRunIdRef,
          previewTimerRef,
          setPreviewSrcDoc,
          setExecutionState,
          setExecutionEvents,
        });
        return;
      }
      if (data.type === "console") {
        if (
          !["log", "info", "warn", "error", "table", "debug"].includes(
            data.level,
          ) ||
          !Array.isArray(data.args)
        ) {
          return;
        }
        let size;
        try {
          size = JSON.stringify(data.args).length;
        } catch {
          return;
        }
        if (
          previewOutputRef.current.entries >= 300 ||
          previewOutputRef.current.characters + size > 100_000
        ) {
          if (!previewOutputRef.current.truncated) {
            previewOutputRef.current.truncated = true;
            setExecutionEvents((current) => [
              ...current,
              { type: "output-truncated", runId: data.runId },
            ]);
          }
          return;
        }
        previewOutputRef.current.entries += 1;
        previewOutputRef.current.characters += size;
        setExecutionEvents((current) => [
          ...current,
          {
            type: "log",
            runId: data.runId,
            level: data.level,
            args: data.args,
          },
        ]);
      } else if (
        data.type === "error" &&
        typeof data.error?.message === "string"
      ) {
        setExecutionEvents((current) => [
          ...current,
          { type: "runtime-error", runId: data.runId, error: data.error },
        ]);
      }
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, []);

  useEffect(() => () => window.clearTimeout(previewTimerRef.current), []);

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
      const fallbackFileId =
        workspace.files.find((file) => file.type === "file")?.id ||
        ROOT_FILE_ID;
      activeFileIdRef.current = fallbackFileId;
      setActiveFileId(fallbackFileId);
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

  useEffect(() => {
    const controller = new ExecutionController({
      timeoutMs: 5_000,
      onEvent: (event) => {
        setExecutionEvents((current) => [...current, event].slice(-320));
        if (event.type === "started") setExecutionState("running");
        else if (event.type === "complete") setExecutionState("completed");
        else if (event.type === "stopped") setExecutionState("stopped");
        else if (event.type === "timeout") setExecutionState("timeout");
        else if (["runtime-error", "worker-error"].includes(event.type)) {
          setExecutionState("error");
        }
      },
    });
    executionControllerRef.current = controller;
    return () => {
      controller.dispose();
      executionControllerRef.current = null;
    };
  }, []);

  const notify = useCallback((message) => setToast(message), []);

  const openFile = (fileId) => {
    activeFileIdRef.current = fileId;
    setActiveFileId(fileId);
    setOpenFileIds((current) =>
      current.includes(fileId) ? current : [...current, fileId],
    );
  };

  const closeTab = (fileId) => {
    if (openFileIds.length < 2) return;
    const remaining = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(remaining);
    if (activeFileId === fileId) {
      activeFileIdRef.current = remaining[remaining.length - 1];
      setActiveFileId(remaining[remaining.length - 1]);
    }
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
      editorFileIdRef.current = activeFile?.id || ROOT_FILE_ID;
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
      if (command && event.key === "Enter") {
        event.preventDefault();
        runHandlerRef.current?.();
      } else if (command && event.key.toLowerCase() === "s") {
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
    if (executionState === "running") {
      if (previewRunIdRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewRunIdRef.current = null;
        setPreviewSrcDoc("");
      } else {
        executionControllerRef.current?.stop();
      }
    }
    const executionFileId =
      activeFileIdRef.current || editorFileIdRef.current || activeFileId;
    const file = workspace.files.find((item) => item.id === executionFileId);
    const isPreview = file?.language === "html" || file?.language === "css";
    setPanelTab(isPreview ? "preview" : "console");
    setPanelOpen(true);
    setExecutionEvents([]);
    window.clearTimeout(previewTimerRef.current);
    previewRunIdRef.current = null;
    setPreviewSrcDoc("");
    if (!file || file.type !== "file") {
      setExecutionState("error");
      setExecutionEvents([
        {
          type: "unsupported",
          message: "Select a file before running code.",
        },
      ]);
      return;
    }
    const editorModel = editorRef.current?.getModel();
    const code =
      editorFileIdRef.current === file.id && editorModel
        ? editorModel.getValue()
        : workspace.getText(file.id).toString();

    if (file.language === "html" || file.language === "css") {
      const runId = createRunId();
      try {
        const result =
          file.language === "html"
            ? buildPreviewDocument({
                html: code,
                activeFileId: file.id,
                files: workspace.files,
                getText: workspace.getText,
                runId,
              })
            : buildCssPreviewDocument(code, runId);
        previewOutputRef.current = { entries: 0, characters: 0 };
        previewHeartbeatSeenRef.current = false;
        previewRunIdRef.current = runId;
        setPreviewRunId(runId);
        setPreviewSrcDoc(result.srcDoc);
        setExecutionState("running");
        setExecutionEvents([
          { type: "started", runId },
          ...result.warnings.map((message) => ({
            type: "unsupported",
            message,
            runId,
          })),
        ]);
        schedulePreviewWatchdog(runId, {
          previewRunIdRef,
          previewTimerRef,
          setPreviewSrcDoc,
          setExecutionState,
          setExecutionEvents,
        });
      } catch (error) {
        setExecutionState("error");
        setExecutionEvents([
          {
            type: "runtime-error",
            error: {
              name: error.name || "PreviewError",
              message: error.message || String(error),
              stack: error.stack || "",
            },
          },
        ]);
      }
      return;
    }

    if (file.language !== "javascript") {
      setExecutionState("error");
      setExecutionEvents([
        {
          type: "unsupported",
          message: `JavaScript execution is not available for ${file.language}.`,
        },
      ]);
      return;
    }

    executionControllerRef.current?.run(code);
  };
  runHandlerRef.current = handleRun;

  const handleStop = () => {
    if (executionState === "running" && previewRunIdRef.current) {
      const runId = previewRunIdRef.current;
      previewRunIdRef.current = null;
      window.clearTimeout(previewTimerRef.current);
      setPreviewSrcDoc("");
      setExecutionState("stopped");
      setExecutionEvents((current) => [...current, { type: "stopped", runId }]);
      return;
    }
    executionControllerRef.current?.stop();
  };

  const handlePreviewLoad = () => {
    const runId = previewRunIdRef.current;
    if (!runId) return;
    setExecutionState("completed");
    setExecutionEvents((current) => [
      ...current,
      { type: "preview-ready", runId },
    ]);
    schedulePreviewWatchdog(runId, {
      previewRunIdRef,
      previewTimerRef,
      setPreviewSrcDoc,
      setExecutionState,
      setExecutionEvents,
    });
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
      if (activeFileId === action.item.id) {
        activeFileIdRef.current = ROOT_FILE_ID;
        setActiveFileId(ROOT_FILE_ID);
      }
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
        onStop={handleStop}
        isRunning={executionState === "running"}
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
              executionEvents={executionEvents}
              executionState={executionState}
              previewSrcDoc={previewSrcDoc}
              previewRunId={previewRunId}
              previewFrameRef={previewFrameRef}
              onPreviewLoad={handlePreviewLoad}
              onClear={() => {
                setExecutionEvents([]);
                if (executionState !== "running") setExecutionState("idle");
              }}
              onStop={handleStop}
              onClose={() => {
                if (executionState === "running") handleStop();
                setPanelOpen(false);
              }}
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
