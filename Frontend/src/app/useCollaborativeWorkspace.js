import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SocketIOProvider } from "y-socket.io";
import * as Y from "yjs";

export const ROOT_FILE_ID = "main";
const FILES_MAP = "ideFiles";

export function languageForFilename(name) {
  const extension = name.split(".").pop()?.toLowerCase();
  const languages = {
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    go: "go",
    html: "html",
    java: "java",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    php: "php",
    py: "python",
    rs: "rust",
    sh: "shell",
    sql: "sql",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension] || "plaintext";
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function readFiles(fileMap) {
  return Array.from(fileMap.entries(), ([id, item]) => ({ ...item, id })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
}

export function useCollaborativeWorkspace(username, room) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [synced, setSynced] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const saveTimer = useRef(null);

  useEffect(() => {
    const storageKey = `browser-ide:${room}`;
    try {
      const cached = window.localStorage.getItem(storageKey);
      if (cached) Y.applyUpdate(ydoc, Uint8Array.from(JSON.parse(cached)));
    } catch {
      window.localStorage.removeItem(storageKey);
    }

    const persist = () => {
      setSaveState("saving");
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try {
          const update = Array.from(Y.encodeStateAsUpdate(ydoc));
          window.localStorage.setItem(storageKey, JSON.stringify(update));
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 350);
    };

    ydoc.on("update", persist);
    return () => {
      ydoc.off("update", persist);
      window.clearTimeout(saveTimer.current);
    };
  }, [room, ydoc]);

  useEffect(() => {
    if (!username) return undefined;

    const fileMap = ydoc.getMap(FILES_MAP);
    const updateFiles = () => setFiles(readFiles(fileMap));
    if (!fileMap.has(ROOT_FILE_ID)) {
      fileMap.set(ROOT_FILE_ID, {
        name: "main.js",
        type: "file",
        parentId: null,
        language: "javascript",
      });
    }
    updateFiles();
    fileMap.observe(updateFiles);

    const provider = new SocketIOProvider("/", room, ydoc, {
      autoConnect: true,
      resyncInterval: 5000,
    });
    const updateUsers = () => {
      const nextUsers = Array.from(provider.awareness.getStates().entries())
        .filter(([, state]) => state.user?.username?.trim())
        .map(([clientId, state]) => ({
          username: state.user.username.trim(),
          clientId,
          isLocal: clientId === provider.awareness.clientID,
        }));
      setUsers(nextUsers);
    };
    const handleStatus = ({ status }) => setConnection(status);
    const handleSynced = (nextSynced) => setSynced(nextSynced);

    provider.awareness.setLocalStateField("user", { username });
    provider.awareness.on("change", updateUsers);
    provider.on("status", handleStatus);
    provider.on("synced", handleSynced);
    setConnection("connecting");
    setSynced(Boolean(provider.synced));
    updateUsers();

    const handleBeforeUnload = () => {
      provider.awareness.setLocalStateField("user", null);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      fileMap.unobserve(updateFiles);
      provider.awareness.off("change", updateUsers);
      provider.off("status", handleStatus);
      provider.off("synced", handleSynced);
      provider.destroy();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [room, username, ydoc]);

  const getText = useCallback(
    (fileId) =>
      ydoc.getText(fileId === ROOT_FILE_ID ? "monaco" : `ide-file:${fileId}`),
    [ydoc],
  );

  const createFile = useCallback(
    (name, parentId = null) => {
      const id = makeId();
      ydoc.getMap(FILES_MAP).set(id, {
        name,
        type: "file",
        parentId,
        language: languageForFilename(name),
      });
      return id;
    },
    [ydoc],
  );

  const createFolder = useCallback(
    (name, parentId = null) => {
      const id = makeId();
      ydoc.getMap(FILES_MAP).set(id, { name, type: "folder", parentId });
      return id;
    },
    [ydoc],
  );

  const renameItem = useCallback(
    (item, name) => {
      const next = { ...item, name };
      if (item.type === "file") next.language = languageForFilename(name);
      ydoc.getMap(FILES_MAP).set(item.id, next);
    },
    [ydoc],
  );

  const updateLanguage = useCallback(
    (item, language) => {
      const fileMap = ydoc.getMap(FILES_MAP);
      const current = fileMap.get(item.id);
      if (current) fileMap.set(item.id, { ...current, language });
    },
    [ydoc],
  );

  const deleteItem = useCallback(
    (itemId) => {
      const fileMap = ydoc.getMap(FILES_MAP);
      const removeBranch = (id) => {
        const descendants = readFiles(fileMap).filter(
          (item) => item.parentId === id,
        );
        descendants.forEach((item) => removeBranch(item.id));
        const item = fileMap.get(id);
        if (item?.type === "file") {
          const text = getText(id);
          text.delete(0, text.length);
        }
        if (id !== ROOT_FILE_ID) fileMap.delete(id);
      };
      removeBranch(itemId);
    },
    [getText, ydoc],
  );

  const saveNow = useCallback(() => {
    try {
      const update = Array.from(Y.encodeStateAsUpdate(ydoc));
      window.localStorage.setItem(
        `browser-ide:${room}`,
        JSON.stringify(update),
      );
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [room, ydoc]);

  return {
    ydoc,
    files,
    users,
    connection,
    synced,
    saveState,
    getText,
    createFile,
    createFolder,
    renameItem,
    updateLanguage,
    deleteItem,
    saveNow,
  };
}
