import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  GitBranch,
  Link2,
  Menu,
  Play,
  Search,
  Settings,
  Square,
  Terminal,
  Users,
  X,
} from "lucide-react";
import ExecutionPreview from "./ExecutionPreview.jsx";

export function TopBar({
  room,
  saveState,
  onRun,
  onStop,
  isRunning,
  onShare,
  onImport,
  onExport,
  username,
  onMenu,
  onSettings,
  copied,
}) {
  const initials = username.trim().slice(0, 2).toUpperCase() || "U";
  return (
    <header className="topbar">
      <button
        className="mobile-menu icon-button"
        type="button"
        title="Open panels"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>
      <div className="brand-lockup">
        <div className="brand-mark">
          <Code2 size={18} />
        </div>
        <div className="brand-copy">
          <strong>CodeTogether</strong>
          <span>COLLABORATIVE IDE</span>
        </div>
      </div>
      <div className="topbar-divider" />
      <div className="project-title">
        <FolderOpen size={15} />
        <span>workspace</span>
        <span className="project-branch">
          <GitBranch size={13} /> shared
        </span>
      </div>
      <div className="room-chip">
        <span className="live-dot" />
        ROOM <strong>{room}</strong>
      </div>
      <div className="topbar-spacer" />
      <div
        className={`save-status ${saveState}`}
        title={saveState === "error" ? "Local save failed" : undefined}
      >
        {saveState === "saved" ? <Check size={14} /> : <Activity size={14} />}
        <span>
          {saveState === "saved"
            ? "All changes saved"
            : saveState === "error"
              ? "Save failed"
              : "Saving"}
        </span>
      </div>
      <div className="topbar-actions">
        <button className="text-action" type="button" onClick={onImport}>
          <Download size={15} />
          <span>Import</span>
        </button>
        <button className="text-action" type="button" onClick={onExport}>
          <FileCode2 size={15} />
          <span>Export</span>
        </button>
        <button className="share-button" type="button" onClick={onShare}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span>{copied ? "Copied" : "Share"}</span>
        </button>
        {isRunning ? (
          <button
            className="run-button stop-button"
            type="button"
            onClick={onStop}
          >
            <Square size={12} fill="currentColor" />
            <span>Stop</span>
          </button>
        ) : (
          <button className="run-button" type="button" onClick={onRun}>
            <Play size={14} fill="currentColor" />
            <span>Run</span>
          </button>
        )}
      </div>
      <div className="profile-menu" title={username}>
        <span className="avatar current-user">{initials}</span>
        <ChevronDown size={13} />
      </div>
      <button
        className="icon-button top-settings"
        type="button"
        title="Settings"
        onClick={onSettings}
      >
        <Settings size={17} />
      </button>
      <button className="icon-button help-button" type="button" title="Help">
        <CircleHelp size={17} />
      </button>
    </header>
  );
}

const activityItems = [
  {
    id: "explorer",
    label: "Explorer",
    icon: <FolderOpen size={20} strokeWidth={1.7} />,
  },
  {
    id: "search",
    label: "Search",
    icon: <Search size={20} strokeWidth={1.7} />,
  },
  {
    id: "source",
    label: "Source control",
    icon: <GitBranch size={20} strokeWidth={1.7} />,
  },
];

export function ActivityBar({ activeView, onChange }) {
  return (
    <nav className="activity-bar" aria-label="Primary panels">
      <div className="activity-group">
        {activityItems.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={`activity-button ${activeView === id ? "selected" : ""}`}
            aria-label={label}
            title={label}
            onClick={() => onChange(id)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="activity-group activity-bottom">
        <button
          type="button"
          className={`activity-button ${activeView === "settings" ? "selected" : ""}`}
          aria-label="Settings"
          title="Settings"
          onClick={() => onChange("settings")}
        >
          <Settings size={20} strokeWidth={1.7} />
        </button>
      </div>
    </nav>
  );
}

export function CollaborationPanel({
  users,
  room,
  connection,
  onShare,
  copied,
}) {
  const online = connection === "connected";
  const groupedUsers = Array.from(
    users
      .reduce((groups, session) => {
        const username = session.username.trim();
        const key = username.toLowerCase();
        const group = groups.get(key) || { username, sessions: [] };
        group.sessions.push(session);
        groups.set(key, group);
        return groups;
      }, new Map())
      .values(),
  );
  return (
    <aside className="collaboration-panel">
      <div className="collab-heading">
        <span>COLLABORATORS</span>
        <span
          className={`connection-pip ${online ? "online" : ""}`}
          title={connection}
        />
      </div>
      <div className="online-count">
        <Users size={15} />
        <strong>{groupedUsers.length}</strong>
        <span>{groupedUsers.length === 1 ? "username" : "usernames"}</span>
        <small>
          {users.length} active {users.length === 1 ? "session" : "sessions"}
        </small>
      </div>
      <div className="collaborator-list">
        {groupedUsers.map(({ username, sessions }, index) => {
          const initials = username.slice(0, 2).toUpperCase() || "U";
          const isLocal = sessions.some((session) => session.isLocal);
          return (
            <div
              className="collaborator"
              key={username.toLowerCase()}
              title={`${username}: ${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}`}
            >
              <span className={`avatar avatar-${index % 5}`}>{initials}</span>
              <span className="collaborator-name">{username}</span>
              <span className="collaborator-meta">
                {isLocal && <span className="self-badge">YOU</span>}
                {sessions.length > 1 && (
                  <span className="session-count">{sessions.length}</span>
                )}
              </span>
              <span className="presence-dot" />
            </div>
          );
        })}
        {!groupedUsers.length && (
          <p className="collab-empty">No connected sessions right now.</p>
        )}
      </div>
      <div className="access-note">
        <div>
          <Link2 size={13} />
          <strong>Link-based access</strong>
        </div>
        <p>
          Anyone with this room link can join using a chosen name. Sign-in and
          approval are not enforced.
        </p>
      </div>
      <div className="collab-room">
        <span>ROOM ID</span>
        <code>{room}</code>
        <button type="button" onClick={onShare}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? "Link copied" : "Copy invite link"}</span>
        </button>
      </div>
      <div className="connection-detail">
        <span className={`connection-pip ${online ? "online" : ""}`} />
        {connection === "connected"
          ? "Connected"
          : connection === "connecting"
            ? "Connecting to room"
            : "Reconnecting"}
      </div>
    </aside>
  );
}

export function BottomPanel({
  tab,
  onTabChange,
  height,
  onResize,
  executionEvents,
  executionState,
  previewSrcDoc,
  previewRunId,
  previewFrameRef,
  onPreviewLoad,
  onClear,
  onStop,
  onClose,
}) {
  return (
    <section className="bottom-panel" style={{ height }}>
      <div
        className="panel-resize-handle"
        onPointerDown={onResize}
        role="separator"
        aria-label="Resize bottom panel"
      />
      <div className="bottom-panel-header">
        <div className="panel-tabs">
          {[
            { id: "console", label: "Console", icon: <Activity size={14} /> },
            { id: "preview", label: "Preview", icon: <Eye size={14} /> },
            {
              id: "problems",
              label: "Problems",
              icon: <AlertCircle size={14} />,
            },
            { id: "terminal", label: "Terminal", icon: <Terminal size={14} /> },
          ].map(({ id, label, icon }) => (
            <button
              type="button"
              key={id}
              className={`panel-tab ${tab === id ? "active" : ""}`}
              onClick={() => onTabChange(id)}
            >
              {icon}
              {label}
              {id === "problems" && <span className="tab-count">0</span>}
            </button>
          ))}
        </div>
        <div className="panel-tools">
          {executionState === "running" && (
            <button type="button" title="Stop execution" onClick={onStop}>
              <Square size={12} fill="currentColor" />
              <span>Stop</span>
            </button>
          )}
          <button type="button" title="Clear console" onClick={onClear}>
            <X size={14} />
            <span>Clear</span>
          </button>
          <button type="button" title="Close panel" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div
        className={`bottom-panel-content ${tab === "terminal" ? "terminal-content" : ""} ${tab === "preview" ? "preview-panel-content" : ""}`}
      >
        {tab === "console" && (
          <div className="console-output" aria-live="polite">
            {!executionEvents.length && (
              <p className="panel-message">
                Run JavaScript to see console output here.
              </p>
            )}
            {executionEvents.map((event, index) => (
              <ConsoleEntry
                key={`${event.runId || "local"}-${index}`}
                event={event}
              />
            ))}
          </div>
        )}
        {tab === "problems" && (
          <p className="panel-message">
            Diagnostics are not connected in this phase.
          </p>
        )}
        <div className="preview-pane" hidden={tab !== "preview"}>
          <ExecutionPreview
            srcDoc={previewSrcDoc}
            runId={previewRunId}
            frameRef={previewFrameRef}
            onLoad={onPreviewLoad}
          />
        </div>
        {tab === "terminal" && (
          <>
            <span className="terminal-prompt">$</span>
            <span className="panel-message">
              Terminal backend is not configured.
            </span>
          </>
        )}
      </div>
    </section>
  );
}

function ConsoleEntry({ event }) {
  if (event.type === "log") {
    return (
      <div className={`console-row console-${event.level}`}>
        <span className="console-kind">{event.level}</span>
        <pre>{event.args.map(formatConsoleValue).join(" ")}</pre>
      </div>
    );
  }

  if (event.type === "runtime-error" || event.type === "worker-error") {
    return (
      <div className="console-row console-error">
        <span className="console-kind">error</span>
        <pre>{`${event.error.name}: ${event.error.message}${event.error.stack ? `\n${event.error.stack}` : ""}`}</pre>
      </div>
    );
  }

  let message = "";
  if (event.type === "started") message = "Execution started";
  else if (event.type === "complete") {
    message = `Execution completed in ${Number(event.durationMs || 0).toFixed(1)} ms`;
  } else if (event.type === "timeout") {
    message = `Execution stopped after ${event.timeoutMs} ms timeout`;
  } else if (event.type === "stopped") message = "Execution stopped";
  else if (event.type === "preview-ready") message = "Preview loaded";
  else if (event.type === "preview-responsive") message = "Preview responsive";
  else if (event.type === "output-truncated") {
    message = "Output limit reached; additional entries were omitted.";
  } else if (event.type === "unsupported") message = event.message;
  return message ? (
    <div className={`console-status ${event.type}`} role="status">
      {message}
    </div>
  ) : null;
}

function formatConsoleValue(value) {
  if (value?.kind === "string") return value.value;
  if (value?.kind === "undefined") return "undefined";
  if (value?.kind === "null") return "null";
  if (value?.kind === "error") return `${value.name}: ${value.message}`;
  if (value?.kind === "circular") return "[Circular]";
  if (value?.kind === "unavailable") return value.value;
  if (value?.kind === "function") return `[Function ${value.value}]`;
  if (value?.kind === "symbol") return value.value;
  if (value?.kind === "bigint") return value.value;
  if (value?.kind === "array") {
    return JSON.stringify(value.value, null, 2);
  }
  if (value?.kind === "object") {
    return JSON.stringify(value.value, null, 2);
  }
  return String(value?.value ?? value?.kind ?? value);
}

export function StatusBar({ language, position, connection, room }) {
  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className="status-connection">
          <span
            className={`connection-pip ${connection === "connected" ? "online" : ""}`}
          />
          {connection === "connected"
            ? "Live"
            : connection === "connecting"
              ? "Connecting"
              : "Offline"}
        </span>
        <span>
          <GitBranch size={13} />
          {room}
        </span>
        <span className="status-errors">
          <AlertCircle size={13} />0
        </span>
      </div>
      <div className="status-right">
        <span>
          Ln {position.lineNumber}, Col {position.column}
        </span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span>{language}</span>
      </div>
    </footer>
  );
}

export function JoinScreen({ room, onJoin }) {
  return (
    <main className="join-screen">
      <section className="join-card">
        <div className="brand-mark join-mark">
          <Code2 size={21} />
        </div>
        <p className="eyebrow">COLLABORATIVE IDE</p>
        <h1>Join the workspace</h1>
        <p className="join-copy">
          Choose a name to enter room <code>{room}</code>.
        </p>
        <form onSubmit={onJoin}>
          <label htmlFor="username">Your name</label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="e.g. Alex"
            maxLength={32}
            autoComplete="name"
            required
          />
          <button className="join-button" type="submit">
            Join room <ChevronDown size={15} />
          </button>
        </form>
        <div className="join-footnote">
          <span className="live-dot" /> Your edits sync with people in this room
        </div>
      </section>
    </main>
  );
}
