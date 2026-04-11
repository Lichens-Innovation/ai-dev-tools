const MAX_NB_RESULTS = 50;

/** @type {string} */
let lastDetailFullPath = "";

const EMBED_PREVIEW_PREFIX = /^File:[^\n]*\nRepo:[^\n]*\n\n/;

const extensionToHljsLanguage = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  php: "php",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  properties: "properties",
  vue: "xml",
  svelte: "javascript",
};

const getSearchStatusEl = () => document.getElementById("search-status");
const getSearchErrorEl = () => document.getElementById("search-error");
const getResultsListEl = () => document.getElementById("search-results-list");
const getDetailPlaceholderEl = () => document.getElementById("search-detail-placeholder");
const getDetailContentEl = () => document.getElementById("search-detail-content");
const getDetailCodeEl = () => document.getElementById("detail-code");

const setSearchStatus = ({ html, isBusy = false }) => {
  const el = getSearchStatusEl();
  el.innerHTML = html;
  el.classList.toggle("search-status-bar--busy", isBusy);
};

const clearSearchError = () => {
  const el = getSearchErrorEl();
  el.hidden = true;
  el.textContent = "";
};

const setSearchError = ({ message }) => {
  const el = getSearchErrorEl();
  el.hidden = false;
  el.textContent = message;
};

const formatPayloadForDisplay = (data) => (typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));

const getTrimmedQueryText = () => document.getElementById("query-text").value.trim();

const getNbResultsInputValue = () => Number.parseInt(document.getElementById("nb-results").value, 10);

const isNbResultsValid = ({ value }) => Number.isFinite(value) && value >= 1 && value <= MAX_NB_RESULTS;

const getTrimmedRepositoryFilter = () => document.getElementById("repository-filter").value.trim();

const buildSemanticSearchBody = ({ queryText, nbResults, repository }) => {
  const body = { queryText, nbResults };
  if (repository.length > 0) {
    body.repository = repository;
  }
  return body;
};

const parsePayloadFromResponseParts = ({ contentType, bodyText }) => {
  if (!contentType.includes("application/json") || bodyText.length === 0) {
    return bodyText;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
};

const extractBodyFromDocumentPreview = ({ documentPreview }) => {
  if (typeof documentPreview !== "string") {
    return "";
  }
  if (EMBED_PREVIEW_PREFIX.test(documentPreview)) {
    return documentPreview.replace(EMBED_PREVIEW_PREFIX, "");
  }
  return documentPreview;
};

const getFileExtension = ({ pathRelative }) => {
  const last = pathRelative.split(/[/\\]/).pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) {
    return "";
  }
  return last.slice(dot + 1).toLowerCase();
};

const resolveHljsLanguage = ({ pathRelative }) => {
  const ext = getFileExtension({ pathRelative });
  if (ext.length === 0) {
    return "plaintext";
  }
  return extensionToHljsLanguage[ext] ?? "plaintext";
};

const truncateOneLine = ({ text, maxLen }) => {
  const line = text.split("\n")[0] ?? "";
  if (line.length <= maxLen) {
    return line;
  }
  return `${line.slice(0, maxLen - 1)}…`;
};

const formatDistanceLabel = ({ distance }) => {
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    return "";
  }
  return `distance ${distance.toFixed(4)}`;
};

const isOutcomeError = ({ outcome }) =>
  outcome !== null && typeof outcome === "object" && !Array.isArray(outcome) && typeof outcome.error === "string";

const isMatchArray = ({ outcome }) => Array.isArray(outcome);

const escapeHtml = (raw) =>
  raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const clearResultsUi = () => {
  lastDetailFullPath = "";
  getResultsListEl().innerHTML = "";
  showDetailPlaceholder();
};

const showDetailPlaceholder = () => {
  getDetailPlaceholderEl().hidden = false;
  getDetailContentEl().hidden = true;
  const codeEl = getDetailCodeEl();
  codeEl.textContent = "";
  codeEl.className = "hljs";
  document.querySelectorAll(".search-match-card--selected").forEach((el) => {
    el.classList.remove("search-match-card--selected");
    el.setAttribute("aria-selected", "false");
  });
};

const applySyntaxHighlight = ({ codeEl, language, codeText }) => {
  const hljs = globalThis.hljs;
  codeEl.className = "hljs";
  if (!hljs || typeof hljs.highlight !== "function") {
    codeEl.textContent = codeText;
    return;
  }
  const tryLanguage = hljs.getLanguage?.(language) != null ? language : null;
  if (tryLanguage != null) {
    try {
      const { value } = hljs.highlight(codeText, { language: tryLanguage });
      codeEl.innerHTML = value;
      return;
    } catch (error) {
      console.error("[search-codebase] highlight failed:", error);
    }
  }
  if (typeof hljs.highlightAuto === "function") {
    const { value } = hljs.highlightAuto(codeText);
    codeEl.innerHTML = value;
    return;
  }
  codeEl.textContent = codeText;
};

const renderDetailForMatch = ({ match, index }) => {
  const meta = match?.metadata ?? {};
  const pathRelative = typeof meta.pathRelative === "string" ? meta.pathRelative : "";
  const repository = typeof meta.repository === "string" ? meta.repository : "";
  const fullPath = typeof meta.fullPath === "string" ? meta.fullPath : "";
  const startLine = typeof match.startLine === "number" ? match.startLine : null;
  const endLine = typeof match.endLine === "number" ? match.endLine : null;
  const documentPreview = typeof match.documentPreview === "string" ? match.documentPreview : "";

  lastDetailFullPath = fullPath;

  document.getElementById("detail-repo").textContent = repository || "—";
  document.getElementById("detail-path").textContent = pathRelative || "—";
  document.getElementById("detail-path").title = fullPath.length > 0 ? fullPath : pathRelative;

  const linesLabel = startLine !== null && endLine !== null ? `lines ${startLine}–${endLine}` : "";
  document.getElementById("detail-lines").textContent = linesLabel;

  document.getElementById("detail-score").textContent = formatDistanceLabel({ distance: match.distance });

  const body = extractBodyFromDocumentPreview({ documentPreview });
  const language = resolveHljsLanguage({ pathRelative });

  getDetailPlaceholderEl().hidden = true;
  getDetailContentEl().hidden = false;

  const codeEl = getDetailCodeEl();
  applySyntaxHighlight({ codeEl, language, codeText: body });

  document.querySelectorAll(".search-match-card--selected").forEach((el) => {
    el.classList.remove("search-match-card--selected");
    el.setAttribute("aria-selected", "false");
  });
  const active = document.querySelector(`[data-match-index="${index}"]`);
  if (active) {
    active.classList.add("search-match-card--selected");
    active.setAttribute("aria-selected", "true");
  }
};

const buildMatchCardButton = ({ match, index }) => {
  const meta = match?.metadata ?? {};
  const pathRelative = typeof meta.pathRelative === "string" ? meta.pathRelative : "";
  const repository = typeof meta.repository === "string" ? meta.repository : "";
  const documentPreview = typeof match.documentPreview === "string" ? match.documentPreview : "";
  const body = extractBodyFromDocumentPreview({ documentPreview });
  const previewLine = truncateOneLine({ text: body, maxLen: 96 });

  const li = document.createElement("li");
  li.className = "search-results-list__item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-match-card";
  btn.dataset.matchIndex = String(index);
  btn.setAttribute("aria-selected", "false");
  btn.title = `${pathRelative} (${formatDistanceLabel({ distance: match.distance })})`;

  const startLine = typeof match.startLine === "number" ? match.startLine : "";
  const endLine = typeof match.endLine === "number" ? match.endLine : "";
  const lines = startLine !== "" && endLine !== "" ? `L${startLine}–${endLine}` : "";

  btn.innerHTML = `
    <span class="search-match-card__row">
      <span class="search-match-card__badge">${escapeHtml(repository || "—")}</span>
      <span class="search-match-card__path">${escapeHtml(pathRelative || "(no path)")}</span>
    </span>
    <span class="search-match-card__row search-match-card__row--meta">
      <span class="search-match-card__lines">${escapeHtml(lines)}</span>
      <span class="search-match-card__distance">${escapeHtml(formatDistanceLabel({ distance: match.distance }))}</span>
    </span>
    <span class="search-match-card__preview">${escapeHtml(previewLine)}</span>
  `;

  btn.addEventListener("click", () => {
    renderDetailForMatch({ match, index });
  });

  li.appendChild(btn);
  return li;
};

const renderSuccessPayload = ({ payload }) => {
  clearSearchError();

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    setSearchError({ message: "Unexpected response shape." });
    clearResultsUi();
    return;
  }

  const outcome = payload.outcome;

  if (isOutcomeError({ outcome })) {
    getResultsListEl().innerHTML = "";
    setSearchError({ message: outcome.error });
    setSearchStatus({ html: "Search finished with an error.", isBusy: false });
    showDetailPlaceholder();
    return;
  }

  if (!isMatchArray({ outcome })) {
    setSearchError({ message: "Unexpected outcome in response (expected a list of matches or an error object)." });
    clearResultsUi();
    return;
  }

  const listEl = getResultsListEl();
  listEl.innerHTML = "";

  if (outcome.length === 0) {
    setSearchStatus({ html: "No matches.", isBusy: false });
    showDetailPlaceholder();
    return;
  }

  setSearchStatus({
    html: `${outcome.length} match${outcome.length === 1 ? "" : "es"} <span class="search-status-bar__hint">(lower distance is closer)</span>`,
    isBusy: false,
  });

  outcome.forEach((match, index) => {
    listEl.appendChild(buildMatchCardButton({ match, index }));
  });

  showDetailPlaceholder();
};

const displayHttpError = ({ status, statusText, payload }) => {
  const bodyText = formatPayloadForDisplay(payload);
  setSearchError({ message: `HTTP ${status} ${statusText}\n${bodyText}` });
  setSearchStatus({ html: "Request failed.", isBusy: false });
  clearResultsUi();
};

const postSemanticSearch = async ({ body }) => {
  setSearchStatus({ html: "Searching…", isBusy: true });
  clearSearchError();

  const response = await fetch("/api/semantic-search-workspace-files", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  const payload = parsePayloadFromResponseParts({ contentType, bodyText });
  if (!response.ok) {
    displayHttpError({ status: response.status, statusText: response.statusText, payload });
    return;
  }
  renderSuccessPayload({ payload });
};

const formatThrownValue = ({ error }) => (error instanceof Error ? error.message : String(error));

const setSearchButtonDisabled = ({ disabled }) => {
  document.getElementById("search-button").disabled = disabled;
};

const readSearchFormOrNotify = () => {
  const queryText = getTrimmedQueryText();
  if (queryText.length === 0) {
    setSearchError({ message: "Enter a query in the text field." });
    setSearchStatus({ html: "", isBusy: false });
    return null;
  }
  const nbResults = getNbResultsInputValue();
  if (!isNbResultsValid({ value: nbResults })) {
    setSearchError({ message: `Invalid number of results (integer between 1 and ${MAX_NB_RESULTS}).` });
    setSearchStatus({ html: "", isBusy: false });
    return null;
  }
  const repository = getTrimmedRepositoryFilter();
  return buildSemanticSearchBody({ queryText, nbResults, repository });
};

const runSearch = async () => {
  const body = readSearchFormOrNotify();
  if (body === null) {
    return;
  }
  setSearchButtonDisabled({ disabled: true });
  try {
    await postSemanticSearch({ body });
  } catch (error) {
    console.error("[search-codebase] search failed:", error);
    setSearchError({ message: formatThrownValue({ error }) });
    setSearchStatus({ html: "Request failed.", isBusy: false });
    clearResultsUi();
  } finally {
    setSearchButtonDisabled({ disabled: false });
  }
};

document.getElementById("search-button").addEventListener("click", runSearch);

document.getElementById("detail-copy-path").addEventListener("click", async () => {
  if (lastDetailFullPath.length === 0) {
    return;
  }
  try {
    await navigator.clipboard.writeText(lastDetailFullPath);
    setSearchStatus({ html: "Full path copied to clipboard.", isBusy: false });
  } catch (error) {
    console.error("[search-codebase] clipboard failed:", error);
    setSearchError({ message: "Could not copy path (clipboard permission denied or unavailable)." });
  }
});

setSearchStatus({ html: "Run a search to see structured matches.", isBusy: false });
