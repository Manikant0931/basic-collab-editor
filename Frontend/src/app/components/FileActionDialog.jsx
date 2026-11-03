import { AlertTriangle, FilePlus2, FolderPlus, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const dialogDetails = {
  "create-file": {
    title: "Create file",
    label: "File name",
    initial: "untitled.js",
    Icon: FilePlus2,
  },
  "create-folder": {
    title: "Create folder",
    label: "Folder name",
    initial: "new-folder",
    Icon: FolderPlus,
  },
  rename: { title: "Rename item", label: "New name", Icon: Pencil },
  delete: { title: "Delete item", Icon: AlertTriangle },
};

export default function FileActionDialog({ dialog, onClose, onConfirm }) {
  const [name, setName] = useState("");
  const inputRef = useRef(null);
  const details = dialog && dialogDetails[dialog.type];

  useEffect(() => {
    setName(dialog?.item?.name || details?.initial || "");
    if (dialog && dialog.type !== "delete") inputRef.current?.focus();
  }, [dialog, details]);

  if (!dialog || !details) return null;
  const { Icon } = details;
  const deleting = dialog.type === "delete";

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-dialog-title"
      >
        <div className="file-dialog-heading">
          <span className={`dialog-icon ${deleting ? "danger" : ""}`}>
            <Icon size={17} />
          </span>
          <div>
            <h2 id="file-dialog-title">{details.title}</h2>
            <p>
              {deleting
                ? `Delete ${dialog.item.name} and its contents? This cannot be undone.`
                : "This change is shared with everyone in the room."}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        {!deleting && (
          <form
            id="file-action-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) onConfirm(name.trim());
            }}
          >
            <label htmlFor="file-action-name">{details.label}</label>
            <input
              ref={inputRef}
              id="file-action-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
            />
          </form>
        )}
        <div className="file-dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type={deleting ? "button" : "submit"}
            form={deleting ? undefined : "file-action-form"}
            className={`dialog-confirm ${deleting ? "danger" : ""}`}
            onClick={deleting ? () => onConfirm("") : undefined}
          >
            {deleting ? "Delete" : "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
