export default function ExecutionPreview({ srcDoc, runId, frameRef, onLoad }) {
  if (!srcDoc) {
    return (
      <div className="preview-empty">
        <strong>Preview not started</strong>
        <span>Run an HTML or CSS file to render it here.</span>
      </div>
    );
  }

  return (
    <iframe
      key={runId}
      ref={frameRef}
      className="execution-preview-frame"
      title="Sandboxed code preview"
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={onLoad}
    />
  );
}
