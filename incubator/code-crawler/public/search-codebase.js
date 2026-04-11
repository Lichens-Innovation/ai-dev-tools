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
const getDetailLineGutterEl = () => document.getElementById("detail-line-gutter");
const getDetailRepoEl = () => document.getElementById("detail-repo");
const getDetailPathEl = () => document.getElementById("detail-path");

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

const normalizeSearchMatch = ({ match }) => {
  const meta = match?.metadata ?? {};
  return {
    pathRelative: typeof meta.pathRelative === "string" ? meta.pathRelative : "",
    repository: typeof meta.repository === "string" ? meta.repository : "",
    fullPath: typeof meta.fullPath === "string" ? meta.fullPath : "",
    startLine: typeof match.startLine === "number" ? match.startLine : null,
    endLine: typeof match.endLine === "number" ? match.endLine : null,
    documentPreview: typeof match.documentPreview === "string" ? match.documentPreview : "",
    distance: match.distance,
  };
};

const formatMatchCardLinesShort = ({ startLine, endLine }) =>
  startLine !== null && endLine !== null ? `L${startLine}–${endLine}` : "";

const buildMatchCardMarkup = ({ repository, pathRelative, linesShort, distanceLabel, previewLine }) => `
    <span class="search-match-card__row">
      <span class="search-match-card__badge">${escapeHtml(repository || "—")}</span>
      <span class="search-match-card__path">${escapeHtml(pathRelative || "(no path)")}</span>
    </span>
    <span class="search-match-card__row search-match-card__row--meta">
      <span class="search-match-card__lines">${escapeHtml(linesShort)}</span>
      <span class="search-match-card__distance">${escapeHtml(distanceLabel)}</span>
    </span>
    <span class="search-match-card__preview">${escapeHtml(previewLine)}</span>
  `;

const formatMatchCountStatusHtml = ({ count }) =>
  `${count} match${count === 1 ? "" : "es"} <span class="search-status-bar__hint">(lower distance is closer)</span>`;

const rejectInvalidSuccessPayload = () => {
  setSearchError({ message: "Unexpected response shape." });
  clearResultsUi();
};

const rejectUnexpectedOutcomeShape = () => {
  setSearchError({ message: "Unexpected outcome in response (expected a list of matches or an error object)." });
  clearResultsUi();
};

const showSemanticSearchOutcomeError = ({ outcome }) => {
  getResultsListEl().innerHTML = "";
  setSearchError({ message: outcome.error });
  setSearchStatus({ html: "Search finished with an error.", isBusy: false });
  showDetailPlaceholder();
};

const renderMatchOutcomeList = ({ outcome }) => {
  const listEl = getResultsListEl();
  listEl.innerHTML = "";

  if (outcome.length === 0) {
    setSearchStatus({ html: "No matches.", isBusy: false });
    showDetailPlaceholder();
    return;
  }

  setSearchStatus({
    html: formatMatchCountStatusHtml({ count: outcome.length }),
    isBusy: false,
  });

  outcome.forEach((match, index) => {
    listEl.appendChild(buildMatchCardButton({ match, index }));
  });

  showDetailPlaceholder();
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

const deselectAllMatchCards = () => {
  document.querySelectorAll(".search-match-card--selected").forEach((card) => {
    card.classList.remove("search-match-card--selected");
    card.setAttribute("aria-selected", "false");
  });
};

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
  const gutterEl = getDetailLineGutterEl();
  if (gutterEl) {
    gutterEl.textContent = "";
  }
  deselectAllMatchCards();
};

const buildLineGutterText = ({ codeText, startLine }) => {
  const lines = codeText.split("\n");
  const baseLine =
    typeof startLine === "number" && Number.isFinite(startLine) ? Math.trunc(startLine) : 1;
  const numbers = lines.map((_, i) => baseLine + i);
  const padWidth = String(numbers[numbers.length - 1] ?? baseLine).length;
  return numbers.map((n) => String(n).padStart(padWidth, " ")).join("\n");
};

const applySyntaxHighlight = ({ codeEl, language, codeText }) => {
  const hljs = globalThis.hljs;
  codeEl.className = "hljs";
  if (!hljs || typeof hljs.highlight !== "function") {
    codeEl.textContent = codeText;
    return;
  }

  const hasRegisteredLanguage = typeof hljs.getLanguage === "function" && hljs.getLanguage(language) !== undefined;
  const resolvedLanguage = hasRegisteredLanguage ? language : null;
  if (resolvedLanguage !== null) {
    try {
      const { value } = hljs.highlight(codeText, { language: resolvedLanguage });
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
  const m = normalizeSearchMatch({ match });

  lastDetailFullPath = m.fullPath;

  getDetailRepoEl().textContent = m.repository || "—";
  const pathEl = getDetailPathEl();
  pathEl.textContent = m.pathRelative || "—";
  pathEl.title = m.fullPath.length > 0 ? m.fullPath : m.pathRelative;

  const body = extractBodyFromDocumentPreview({ documentPreview: m.documentPreview });
  const language = resolveHljsLanguage({ pathRelative: m.pathRelative });

  getDetailPlaceholderEl().hidden = true;
  getDetailContentEl().hidden = false;

  const codeEl = getDetailCodeEl();
  const gutterEl = getDetailLineGutterEl();
  if (gutterEl) {
    gutterEl.textContent = buildLineGutterText({ codeText: body, startLine: m.startLine });
  }
  applySyntaxHighlight({ codeEl, language, codeText: body });

  deselectAllMatchCards();
  const selectedCard = document.querySelector(`[data-match-index="${index}"]`);
  if (selectedCard) {
    selectedCard.classList.add("search-match-card--selected");
    selectedCard.setAttribute("aria-selected", "true");
  }
};

const buildMatchCardButton = ({ match, index }) => {
  const m = normalizeSearchMatch({ match });
  const body = extractBodyFromDocumentPreview({ documentPreview: m.documentPreview });
  const previewLine = truncateOneLine({ text: body, maxLen: 96 });
  const distanceLabel = formatDistanceLabel({ distance: m.distance });
  const linesShort = formatMatchCardLinesShort({ startLine: m.startLine, endLine: m.endLine });

  const li = document.createElement("li");
  li.className = "search-results-list__item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-match-card";
  btn.dataset.matchIndex = String(index);
  btn.setAttribute("aria-selected", "false");
  btn.title = `${m.pathRelative} (${distanceLabel})`;
  btn.innerHTML = buildMatchCardMarkup({
    repository: m.repository,
    pathRelative: m.pathRelative,
    linesShort,
    distanceLabel,
    previewLine,
  });

  btn.addEventListener("click", () => {
    renderDetailForMatch({ match, index });
  });

  li.appendChild(btn);
  return li;
};

const renderSuccessPayload = ({ payload }) => {
  clearSearchError();

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    rejectInvalidSuccessPayload();
    return;
  }

  const { outcome } = payload;

  if (isOutcomeError({ outcome })) {
    showSemanticSearchOutcomeError({ outcome });
    return;
  }

  if (!isMatchArray({ outcome })) {
    rejectUnexpectedOutcomeShape();
    return;
  }

  renderMatchOutcomeList({ outcome });
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
