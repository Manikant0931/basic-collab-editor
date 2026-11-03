const PREVIEW_CHANNEL = "codetogether-preview";
const MAX_PREVIEW_SCRIPT_LENGTH = 100_000;
const MAX_PREVIEW_STYLESHEET_LENGTH = 250_000;

export function getWorkspacePath(fileId, files) {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const item = fileById.get(fileId);
  if (!item || item.type !== "file") return null;

  const parts = [item.name];
  const visited = new Set([item.id]);
  let parentId = item.parentId;
  while (parentId) {
    if (visited.has(parentId)) return null;
    visited.add(parentId);
    const parent = fileById.get(parentId);
    if (!parent || parent.type !== "folder") return null;
    parts.push(parent.name);
    parentId = parent.parentId;
  }
  return parts.reverse().join("/");
}

export function normalizeWorkspaceReference(reference, currentFilePath) {
  if (typeof reference !== "string" || isExternalReference(reference)) {
    return null;
  }
  try {
    const base = new URL(currentFilePath, "https://workspace.invalid/");
    const url = new URL(reference, base);
    if (url.origin !== "https://workspace.invalid") return null;
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

export function buildPreviewDocument({
  html,
  activeFileId,
  files,
  getText,
  runId,
}) {
  if (typeof DOMParser === "undefined") {
    throw new Error("HTML preview requires a browser DOMParser.");
  }

  const warnings = [];
  const fileByPath = new Map();
  for (const file of files) {
    if (file.type !== "file") continue;
    const path = getWorkspacePath(file.id, files);
    if (path) fileByPath.set(path, file);
  }
  const entryPath = getWorkspacePath(activeFileId, files);
  const document = new DOMParser().parseFromString(html, "text/html");
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const resolveLocalFile = (reference, ownerPath, resourceKind) => {
    if (isExternalReference(reference)) return { external: true };
    const path = normalizeWorkspaceReference(reference, ownerPath);
    if (!path) {
      warn(`Unsupported ${resourceKind} reference: ${reference}`);
      return { missing: true };
    }
    const file = fileByPath.get(path);
    if (!file) {
      warn(`Could not find ${resourceKind} file: ${path}`);
      return { missing: true };
    }
    return { file, path };
  };

  const inlineStylesheet = (file, path, ancestry = new Set()) => {
    if (ancestry.has(path)) {
      warn(`Circular CSS @import was skipped: ${path}`);
      return "";
    }
    const contents = getText(file.id).toString();
    if (contents.length > MAX_PREVIEW_STYLESHEET_LENGTH) {
      warn(`Stylesheet is too large to preview: ${path}`);
      return "";
    }
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(path);

    const withImports = contents.replace(
      /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)?\s*([^;]*);/gi,
      (statement, quote, quotedReference, bareReference, media) => {
        const reference = quotedReference || bareReference;
        if (isExternalReference(reference)) return statement;
        const resolved = resolveLocalFile(reference, path, "CSS import");
        if (!resolved.file || !isCssFile(resolved.file)) {
          if (resolved.file) warn(`Imported file is not CSS: ${resolved.path}`);
          return "";
        }
        const imported = inlineStylesheet(
          resolved.file,
          resolved.path,
          nextAncestry,
        );
        return media.trim()
          ? `@media ${media.trim()} { ${imported} }`
          : imported;
      },
    );

    return withImports.replace(
      /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      (statement, _quote, rawReference) => {
        const reference = rawReference.trim();
        if (isExternalReference(reference)) return statement;
        const resolved = resolveLocalFile(reference, path, "stylesheet asset");
        if (!resolved.file) return 'url("about:blank")';
        const asset = getText(resolved.file.id).toString();
        if (isSvgFile(resolved.file)) {
          return `url("${createDataUrl("image/svg+xml", asset)}")`;
        }
        if (/^data:image\//i.test(asset)) return `url("${asset}")`;
        warn(
          `Binary CSS asset is not available in the text workspace: ${resolved.path}`,
        );
        return 'url("about:blank")';
      },
    );
  };

  for (const baseElement of document.querySelectorAll("base")) {
    baseElement.remove();
    warn(
      "The preview ignores <base> elements to keep local paths inside the workspace.",
    );
  }

  for (const link of document.querySelectorAll(
    'link[rel~="stylesheet"][href]',
  )) {
    const href = link.getAttribute("href");
    const resolved = resolveLocalFile(href, entryPath, "stylesheet");
    if (resolved.external) continue;
    if (!resolved.file || !isCssFile(resolved.file)) {
      link.remove();
      if (resolved.file) warn(`Linked stylesheet is not CSS: ${resolved.path}`);
      continue;
    }
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = createDataUrl(
      "text/css",
      inlineStylesheet(resolved.file, resolved.path),
    );
    link.replaceWith(stylesheet);
  }

  const bundledScripts = [];
  for (const script of document.querySelectorAll("script[src]")) {
    const source = script.getAttribute("src");
    const resolved = resolveLocalFile(source, entryPath, "script");
    if (resolved.external) {
      script.remove();
      warn(`External script was blocked in the preview: ${source}`);
      continue;
    }
    if (!resolved.file || !isJavaScriptFile(resolved.file)) {
      script.remove();
      if (resolved.file)
        warn(`Linked script is not JavaScript: ${resolved.path}`);
      continue;
    }
    const contents = getText(resolved.file.id).toString();
    if (contents.length > MAX_PREVIEW_SCRIPT_LENGTH) {
      script.remove();
      warn(`Linked script is too large to preview: ${resolved.path}`);
      continue;
    }
    if (script.type === "module" && /^\s*import\s/m.test(contents)) {
      script.remove();
      warn(`Module imports are not bundled for preview: ${resolved.path}`);
      continue;
    }
    const bundledScript = document.createElement("script");
    if (script.type) bundledScript.type = script.type;
    bundledScript.async = false;
    bundledScript.src = createDataUrl("text/javascript", contents);
    bundledScripts.push(bundledScript);
    script.remove();
  }
  bundledScripts.forEach((script) => document.body.append(script));

  for (const element of document.querySelectorAll("[src]")) {
    if (element.localName === "script") continue;
    const source = element.getAttribute("src");
    const resolved = resolveLocalFile(source, entryPath, "asset");
    if (resolved.external) continue;
    if (!resolved.file) {
      element.removeAttribute("src");
      continue;
    }
    const contents = getText(resolved.file.id).toString();
    if (isSvgFile(resolved.file)) {
      element.src = createDataUrl("image/svg+xml", contents);
    } else if (/^data:image\//i.test(contents)) {
      element.src = contents;
    } else {
      element.removeAttribute("src");
      warn(
        `Binary preview asset is not available in the text workspace: ${resolved.path}`,
      );
    }
  }

  for (const element of document.querySelectorAll("[srcset]")) {
    const srcset = element.getAttribute("srcset");
    if (
      srcset
        .split(",")
        .some((entry) => !isExternalReference(entry.trim().split(/\s+/)[0]))
    ) {
      element.removeAttribute("srcset");
      warn("Relative srcset assets are not supported in the preview.");
    }
  }

  for (const frame of document.querySelectorAll("iframe, object, embed")) {
    frame.remove();
    warn("Nested frames and embedded objects are blocked in the preview.");
  }

  const contentPolicy = document.createElement("meta");
  contentPolicy.httpEquiv = "Content-Security-Policy";
  contentPolicy.content =
    "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data: https:; img-src data: blob: https:; font-src data: blob: https:; media-src data: blob: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
  document.head.prepend(contentPolicy);
  document.head.prepend(createPreviewBridge(document, runId));

  return {
    srcDoc: `<!doctype html>\n${document.documentElement.outerHTML}`,
    warnings,
  };
}

export function buildCssPreviewDocument(css, runId) {
  const document = new DOMParser().parseFromString(
    '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    "text/html",
  );
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob: https:; font-src data: blob: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
  document.head.prepend(policy);
  document.head.prepend(createPreviewBridge(document, runId));
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = createDataUrl("text/css", css);
  document.head.append(stylesheet);
  document.body.innerHTML =
    "<main><h1>CSS preview</h1><p>Your stylesheet is applied to this preview page.</p><button>Preview button</button></main>";
  return {
    srcDoc: `<!doctype html>\n${document.documentElement.outerHTML}`,
    warnings: [],
  };
}

function createPreviewBridge(document, runId) {
  const script = document.createElement("script");
  const serializedRunId = JSON.stringify(runId);
  script.textContent = `(()=>{
    const runId=${serializedRunId};
    const channel="${PREVIEW_CHANNEL}";
    const send=(type,payload)=>{try{parent.postMessage({channel,runId,type,...payload},"*")}catch{}};
    const seen=new WeakSet();
    const serialize=(value,depth=0)=>{
      if(value===undefined)return {kind:"undefined"};
      if(value===null)return {kind:"null"};
      if(typeof value==="string")return {kind:"string",value:value.slice(0,4000)};
      if(typeof value==="number"||typeof value==="boolean")return {kind:typeof value,value};
      if(typeof value==="bigint")return {kind:"bigint",value:String(value)+"n"};
      if(typeof value==="function")return {kind:"function",value:value.name||"anonymous"};
      if(value instanceof Error)return {kind:"error",name:value.name,message:value.message,stack:value.stack||""};
      if(depth>=5)return {kind:"truncated",value:"<max depth>"};
      if(seen.has(value))return {kind:"circular"};
      seen.add(value);
      try{
        if(Array.isArray(value))return {kind:"array",value:value.slice(0,100).map(item=>serialize(item,depth+1)),truncated:value.length>100};
        const output={};
        for(const key of Object.keys(value).slice(0,100)){try{output[key.slice(0,4000)]=serialize(value[key],depth+1)}catch{output[key]={kind:"unavailable",value:"<throws>"}}}
        return {kind:"object",value:output,truncated:Object.keys(value).length>100};
      }catch{return {kind:"unavailable",value:"<serialization failed>"}}
    };
    const originalConsole=globalThis.console;
    const wrapped=Object.create(originalConsole);
    for(const level of ["log","info","warn","error","table","debug"]){wrapped[level]=(...args)=>send("console",{level,args:args.map(value=>serialize(value))})}
    try{globalThis.console=wrapped}catch{}
    addEventListener("error",event=>send("error",{error:{name:event.error?.name||"Error",message:event.message||"Preview script failed",stack:event.error?.stack||""}}));
    addEventListener("unhandledrejection",event=>{const reason=event.reason;send("error",{error:{name:reason?.name||"UnhandledRejection",message:reason?.message||String(reason),stack:reason?.stack||""}})});
    setInterval(()=>send("heartbeat",{}),1000);
  })();`;
  return script;
}

function createDataUrl(mimeType, text) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(text)}`;
}

function isExternalReference(reference) {
  const value = String(reference || "").trim();
  return !value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);
}

function isCssFile(file) {
  return file.language === "css" || file.name.toLowerCase().endsWith(".css");
}

function isJavaScriptFile(file) {
  return (
    ["javascript", "typescript"].includes(file.language) ||
    /\.(?:[cm]?js|jsx|ts|tsx)$/i.test(file.name)
  );
}

function isSvgFile(file) {
  return file.name.toLowerCase().endsWith(".svg");
}
