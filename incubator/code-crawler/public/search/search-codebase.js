const MAX_NB_RESULTS = 50;

/** Must match API `SourceLanguageId` / Nest Zod schema. */
const SEMANTIC_SEARCH_LANGUAGE_IDS = ["typescript", "javascript", "python", "cpp", "csharp"];

/** @type {string} */
let lastDetailFullPath = "";

/** @type {AbortController | null} */
let activeDetailFileFetchAbortController = null;

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
  pyi: "python",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  "h++": "cpp",
  inl: "cpp",
  ipp: "cpp",
  tpp: "cpp",
  tcc: "cpp",
  cu: "cpp",
  cs: "csharp",
  csx: "csharp",
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
const getDetailPathEl = () => document.getElementById("detail-path");

/** Single header line: `repository/path` without duplicating the repo if path already includes it. */
const formatDetailHeaderPath = ({ repository, pathRelative }) => {
  const repo = typeof repository === "string" ? repository.trim() : "";
  const rel = typeof pathRelative === "string" ? pathRelative.trim() : "";
  const normRepo = repo.replace(/\\/g, "/");
  let normPath = rel.replace(/\\/g, "/");

  if (normRepo.length > 0 && (normPath === normRepo || normPath.startsWith(`${normRepo}/`))) {
    normPath = normPath === normRepo ? "" : normPath.slice(normRepo.length + 1);
  }

  if (normRepo.length === 0) {
    return normPath.length > 0 ? normPath : "—";
  }
  if (normPath.length === 0) {
    return normRepo;
  }
  return `${normRepo}/${normPath}`;
};

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

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const hasMultipleRelatedChunks = (relatedChunkCount) => relatedChunkCount !== null && relatedChunkCount > 1;

const getTrimmedRepositoryFilter = () => document.getElementById("repository-filter").value.trim();

const getSelectedLanguagesOrEmpty = () => {
  const el = document.getElementById("languages-filter");
  if (!el) {
    return [];
  }
  const jQuery = globalThis.jQuery;
  if (typeof jQuery === "function" && typeof jQuery(el).multipleSelect === "function") {
    const raw = jQuery(el).multipleSelect("getSelects");
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((v) => SEMANTIC_SEARCH_LANGUAGE_IDS.includes(v));
  }
  return Array.from(el.selectedOptions)
    .map((o) => o.value)
    .filter((v) => SEMANTIC_SEARCH_LANGUAGE_IDS.includes(v));
};

const buildSemanticSearchBody = ({ queryText, nbResults, repository, languages }) => {
  const body = { queryText, nbResults };
  if (repository.length > 0) {
    body.repository = repository;
  }
  if (languages.length > 0) {
    body.languages = languages;
  }
  return body;
};

const parsePayloadFromResponseParts = ({ contentType, bodyText }) => {
  if (!contentType.includes("application/json") || bodyText.length === 0) {
    return bodyText;
  }

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    console.error("[search-codebase] JSON parse failed:", error);
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

const resolveHljsLanguage = ({ pathRelative, sourceLanguage }) => {
  const trimmed = typeof sourceLanguage === "string" && sourceLanguage.trim().length > 0 ? sourceLanguage.trim() : "";
  if (trimmed.length > 0 && SEMANTIC_SEARCH_LANGUAGE_IDS.includes(trimmed)) {
    const hljs = globalThis.hljs;
    if (typeof hljs?.getLanguage === "function" && hljs.getLanguage(trimmed) !== undefined) {
      return trimmed;
    }
  }

  const ext = getFileExtension({ pathRelative });
  if (ext.length === 0) {
    return "plaintext";
  }

  return extensionToHljsLanguage[ext] ?? "plaintext";
};

const formatDistanceLabel = ({ distance }) => {
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    return "";
  }

  return `distance ${distance.toFixed(4)}`;
};

const normalizeSearchMatch = ({ match }) => {
  const meta = match?.metadata ?? {};
  const fileIdFromMeta = typeof meta.fileId === "string" ? meta.fileId : "";
  const fileIdFromMatch = typeof match?.fileId === "string" ? match.fileId : "";
  const fileId = fileIdFromMeta.length > 0 ? fileIdFromMeta : fileIdFromMatch;

  const rawSourceLanguage = typeof meta.sourceLanguage === "string" ? meta.sourceLanguage.trim() : "";
  const sourceLanguage = SEMANTIC_SEARCH_LANGUAGE_IDS.includes(rawSourceLanguage) ? rawSourceLanguage : "";

  return {
    pathRelative: typeof meta.pathRelative === "string" ? meta.pathRelative : "",
    repository: typeof meta.repository === "string" ? meta.repository : "",
    fullPath: typeof meta.fullPath === "string" ? meta.fullPath : "",
    sourceLanguage,
    fileId,
    startLine: typeof match.startLine === "number" ? match.startLine : null,
    endLine: typeof match.endLine === "number" ? match.endLine : null,
    documentPreview: typeof match.documentPreview === "string" ? match.documentPreview : "",
    distance: match.distance,
    relatedChunkCount: isFiniteNumber(match.relatedChunkCount) ? match.relatedChunkCount : null,
  };
};

const formatMatchCardLinesShort = ({ startLine, endLine }) =>
  startLine !== null && endLine !== null ? `L${startLine}–${endLine}` : "";

const buildMatchCardMarkup = ({ repository, pathRelative, linesShort, distanceLabel }) => `
    <span class="search-match-card__row">
      <span class="search-match-card__badge">${escapeHtml(repository.length > 0 ? repository : "—")}</span>
      <span class="search-match-card__path">${escapeHtml(pathRelative.length > 0 ? pathRelative : "(no path)")}</span>
    </span>
    <span class="search-match-card__row search-match-card__row--meta">
      <span class="search-match-card__lines">${escapeHtml(linesShort)}</span>
      <span class="search-match-card__distance">${escapeHtml(distanceLabel)}</span>
    </span>
  `;

const formatMatchCountStatusHtml = ({ count }) =>
  `${count} file${count === 1 ? "" : "s"} <span class="search-status-bar__hint">(lower distance is closer)</span>`;

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

const isValidLineRange = ({ startLine, endLine }) =>
  typeof startLine === "number" &&
  Number.isFinite(startLine) &&
  typeof endLine === "number" &&
  Number.isFinite(endLine) &&
  startLine <= endLine;

const getDisplayedLineNumberBounds = ({ codeText, firstLine1Based }) => {
  const lineCount = codeText.split("\n").length;
  const first =
    typeof firstLine1Based === "number" && Number.isFinite(firstLine1Based) ? Math.trunc(firstLine1Based) : 1;
  return { displayFirstLine: first, displayLastLine: first + lineCount - 1 };
};

const isLineNoInHighlightRange = ({ lineNo, rangeStart, rangeEnd, displayFirstLine, displayLastLine }) => {
  if (!isValidLineRange({ startLine: rangeStart, endLine: rangeEnd })) {
    return false;
  }
  const visibleRangeStart = Math.max(rangeStart, displayFirstLine);
  const visibleRangeEnd = Math.min(rangeEnd, displayLastLine);
  if (visibleRangeStart > visibleRangeEnd) {
    return false;
  }
  return lineNo >= visibleRangeStart && lineNo <= visibleRangeEnd;
};

const buildGutterLinesHtml = ({ codeText, firstLine1Based, rangeStart, rangeEnd }) => {
  const lines = codeText.split("\n");
  const { displayFirstLine, displayLastLine } = getDisplayedLineNumberBounds({ codeText, firstLine1Based });
  const padWidth = String(displayLastLine).length;
  return lines
    .map((_, lineIndex) => {
      const lineNumber = displayFirstLine + lineIndex;
      const padded = String(lineNumber).padStart(padWidth, " ");
      const inRange = isLineNoInHighlightRange({
        lineNo: lineNumber,
        rangeStart,
        rangeEnd,
        displayFirstLine,
        displayLastLine,
      });
      const cls = inRange
        ? "search-detail-gutter-line search-detail-gutter-line--in-range"
        : "search-detail-gutter-line";
      return `<span class="${cls}" data-line="${lineNumber}">${escapeHtml(padded)}</span>`;
    })
    .join("");
};

const normalizeHighlightedLineParts = ({ highlightedHtml, codeText }) => {
  const nLines = codeText.split("\n").length;
  const parts = highlightedHtml.split("\n");
  if (parts.length > nLines && nLines > 0) {
    const tail = parts.slice(nLines - 1).join("\n");
    return [...parts.slice(0, nLines - 1), tail];
  }
  while (parts.length < nLines) {
    parts.push("");
  }
  return parts;
};

const wrapHighlightedHtmlIntoLineSpans = ({ highlightedHtml, firstLine1Based, rangeStart, rangeEnd, codeText }) => {
  const { displayFirstLine, displayLastLine } = getDisplayedLineNumberBounds({ codeText, firstLine1Based });
  const parts = normalizeHighlightedLineParts({ highlightedHtml, codeText });
  return parts
    .map((fragment, lineIndex) => {
      const lineNo = displayFirstLine + lineIndex;
      const inRange = isLineNoInHighlightRange({ lineNo, rangeStart, rangeEnd, displayFirstLine, displayLastLine });
      const cls = inRange ? "search-detail-code-line search-detail-code-line--in-range" : "search-detail-code-line";
      return `<span class="${cls}" data-line="${lineNo}">${fragment}</span>`;
    })
    .join("");
};

const getDetailPreEl = () => {
  const codeEl = getDetailCodeEl();
  return codeEl?.closest?.(".search-detail-panel__pre") ?? null;
};

const scrollDetailPreToFirstInRange = ({ rangeStart, rangeEnd, codeText, firstLine1Based }) => {
  if (!isValidLineRange({ startLine: rangeStart, endLine: rangeEnd })) {
    return;
  }
  const { displayFirstLine, displayLastLine } = getDisplayedLineNumberBounds({ codeText, firstLine1Based });
  const visibleRangeStart = Math.max(rangeStart, displayFirstLine);
  const visibleRangeEnd = Math.min(rangeEnd, displayLastLine);
  if (visibleRangeStart > visibleRangeEnd) {
    return;
  }
  const pre = getDetailPreEl();
  if (!(pre instanceof window.HTMLElement)) {
    return;
  }
  const target = pre.querySelector(`.search-detail-code-line[data-line="${visibleRangeStart}"]`);
  if (!(target instanceof window.HTMLElement)) {
    return;
  }
  target.scrollIntoView({ block: "nearest" });
};

const getSyntaxHighlightHtmlString = ({ language, codeText }) => {
  const escapeLinesForPlainHtml = () => codeText.split("\n").map(escapeHtml).join("\n");

  const hljs = globalThis.hljs;
  if (!hljs || typeof hljs.highlight !== "function") {
    return escapeLinesForPlainHtml();
  }

  const hasRegisteredLanguage = typeof hljs.getLanguage === "function" && hljs.getLanguage(language) !== undefined;
  const resolvedLanguage = hasRegisteredLanguage ? language : null;
  if (resolvedLanguage !== null) {
    try {
      const { value } = hljs.highlight(codeText, { language: resolvedLanguage });
      return value;
    } catch (error) {
      console.error("[search-codebase] highlight failed:", error);
    }
  }

  if (typeof hljs.highlightAuto === "function") {
    try {
      const { value } = hljs.highlightAuto(codeText);
      return value;
    } catch (error) {
      console.error("[search-codebase] highlightAuto failed:", error);
    }
  }

  return escapeLinesForPlainHtml();
};

const applyDetailSyntaxHighlightWithLineRange = ({
  codeEl,
  language,
  codeText,
  firstLine1Based,
  rangeStart,
  rangeEnd,
  gutterEl,
  shouldScrollToMatchRange,
}) => {
  codeEl.className = "hljs";
  if (gutterEl) {
    gutterEl.innerHTML = buildGutterLinesHtml({
      codeText,
      firstLine1Based,
      rangeStart,
      rangeEnd,
    });
  }
  const highlightedHtml = getSyntaxHighlightHtmlString({ language, codeText });
  codeEl.innerHTML = wrapHighlightedHtmlIntoLineSpans({
    highlightedHtml,
    firstLine1Based,
    rangeStart,
    rangeEnd,
    codeText,
  });

  if (shouldScrollToMatchRange) {
    window.requestAnimationFrame(() => {
      scrollDetailPreToFirstInRange({ rangeStart, rangeEnd, codeText, firstLine1Based });
    });
  }
};

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
  cancelPendingDetailFileFetch();
  getDetailPlaceholderEl().hidden = false;
  getDetailContentEl().hidden = true;
  const codeEl = getDetailCodeEl();
  codeEl.textContent = "";
  codeEl.className = "hljs";
  const gutterEl = getDetailLineGutterEl();
  if (gutterEl) {
    gutterEl.innerHTML = "";
  }
  deselectAllMatchCards();
};

const cancelPendingDetailFileFetch = () => {
  if (activeDetailFileFetchAbortController !== null) {
    activeDetailFileFetchAbortController.abort();
    activeDetailFileFetchAbortController = null;
  }
};

const setSelectedMatchCardIndex = ({ index }) => {
  deselectAllMatchCards();
  const selectedCard = document.querySelector(`[data-match-index="${index}"]`);
  if (selectedCard) {
    selectedCard.classList.add("search-match-card--selected");
    selectedCard.setAttribute("aria-selected", "true");
  }
};

const openDetailContentPanel = () => {
  getDetailPlaceholderEl().hidden = true;
  getDetailContentEl().hidden = false;
};

const applyDetailHeaderFromNormalizedMatch = ({ normalizedMatch }) => {
  const headerPath = formatDetailHeaderPath({
    repository: normalizedMatch.repository,
    pathRelative: normalizedMatch.pathRelative,
  });
  const pathEl = getDetailPathEl();
  pathEl.textContent = headerPath;
  const titlePath = normalizedMatch.fullPath.length > 0 ? normalizedMatch.fullPath : headerPath;
  pathEl.title = titlePath;
};

const setDetailPanelPlainTextBody = ({ message }) => {
  const codeEl = getDetailCodeEl();
  codeEl.textContent = message;
  codeEl.className = "hljs";
  const gutterEl = getDetailLineGutterEl();
  if (gutterEl) {
    gutterEl.innerHTML = "";
  }
};

const showDetailPanelLoadingState = ({ message }) => {
  openDetailContentPanel();
  setDetailPanelPlainTextBody({ message });
};

const renderDetailPanelFetchError = ({ message }) => {
  console.error("[search-codebase] indexed file content failed:", message);
  setDetailPanelPlainTextBody({ message });
};

const renderDetailFromChunkPreview = ({ normalizedMatch }) => {
  lastDetailFullPath = normalizedMatch.fullPath;
  applyDetailHeaderFromNormalizedMatch({ normalizedMatch });
  openDetailContentPanel();

  const body = extractBodyFromDocumentPreview({
    documentPreview: normalizedMatch.documentPreview,
  });
  const language = resolveHljsLanguage({
    pathRelative: normalizedMatch.pathRelative,
    sourceLanguage: normalizedMatch.sourceLanguage,
  });
  const codeEl = getDetailCodeEl();
  const gutterEl = getDetailLineGutterEl();
  const firstLine1Based =
    typeof normalizedMatch.startLine === "number" && Number.isFinite(normalizedMatch.startLine)
      ? Math.trunc(normalizedMatch.startLine)
      : 1;
  applyDetailSyntaxHighlightWithLineRange({
    codeEl,
    language,
    codeText: body,
    firstLine1Based,
    rangeStart: normalizedMatch.startLine,
    rangeEnd: normalizedMatch.endLine,
    gutterEl,
    shouldScrollToMatchRange: isValidLineRange({
      startLine: normalizedMatch.startLine,
      endLine: normalizedMatch.endLine,
    }),
  });
};

const renderDetailFromFullFilePayload = ({ normalizedMatch, payload }) => {
  lastDetailFullPath = payload.fullPath;
  applyDetailHeaderFromNormalizedMatch({ normalizedMatch });
  const pathEl = getDetailPathEl();
  if (payload.fullPath.length > 0) {
    pathEl.title = payload.fullPath;
  }

  const language = resolveHljsLanguage({
    pathRelative: normalizedMatch.pathRelative,
    sourceLanguage: normalizedMatch.sourceLanguage,
  });
  const codeEl = getDetailCodeEl();
  const gutterEl = getDetailLineGutterEl();
  applyDetailSyntaxHighlightWithLineRange({
    codeEl,
    language,
    codeText: payload.content,
    firstLine1Based: 1,
    rangeStart: normalizedMatch.startLine,
    rangeEnd: normalizedMatch.endLine,
    gutterEl,
    shouldScrollToMatchRange: isValidLineRange({
      startLine: normalizedMatch.startLine,
      endLine: normalizedMatch.endLine,
    }),
  });
};

const parseIndexedFileContentResponse = ({ response, contentType, bodyText }) => {
  const parsed = parsePayloadFromResponseParts({ contentType, bodyText });

  if (!response.ok) {
    const isErrorBodyObject = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
    const hasServerErrorMessage = isErrorBodyObject && typeof parsed.error === "string";
    const fallbackMessage = `HTTP ${response.status} ${response.statusText}`;
    const errorMessage = hasServerErrorMessage ? parsed.error : fallbackMessage;
    return { ok: false, errorMessage };
  }

  const isSuccessPayloadObject = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  const hasStringContent = isSuccessPayloadObject && typeof parsed.content === "string";
  const hasStringFullPath = isSuccessPayloadObject && typeof parsed.fullPath === "string";
  const hasStringFileId = isSuccessPayloadObject && typeof parsed.fileId === "string";
  const hasExpectedPayloadShape = hasStringContent && hasStringFullPath && hasStringFileId;

  if (!hasExpectedPayloadShape) {
    return { ok: false, errorMessage: "Unexpected response shape for indexed file content." };
  }

  const { content, fileId, fullPath } = parsed;
  return {
    ok: true,
    payload: { content, fileId, fullPath },
  };
};

const fetchIndexedFileContentByFileId = async ({ fileId, signal }) => {
  const url = `/api/indexed-file-content?fileId=${encodeURIComponent(fileId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  return parseIndexedFileContentResponse({ response, contentType, bodyText });
};

const loadAndRenderDetailForMatch = async ({ match, index }) => {
  const normalizedMatch = normalizeSearchMatch({ match });
  setSelectedMatchCardIndex({ index });

  if (normalizedMatch.fileId.length === 0) {
    cancelPendingDetailFileFetch();
    renderDetailFromChunkPreview({ normalizedMatch });
    return;
  }

  cancelPendingDetailFileFetch();
  activeDetailFileFetchAbortController = new AbortController();
  const { signal } = activeDetailFileFetchAbortController;

  applyDetailHeaderFromNormalizedMatch({ normalizedMatch });
  showDetailPanelLoadingState({ message: "Loading full file…" });

  try {
    const outcome = await fetchIndexedFileContentByFileId({
      fileId: normalizedMatch.fileId,
      signal,
    });

    if (signal.aborted) {
      return;
    }

    if (!outcome.ok) {
      renderDetailPanelFetchError({ message: outcome.errorMessage });
      return;
    }

    renderDetailFromFullFilePayload({ normalizedMatch, payload: outcome.payload });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    console.error("[search-codebase] indexed file content request threw:", error);
    if (!signal.aborted) {
      renderDetailPanelFetchError({ message: formatThrownValue({ error }) });
    }
  } finally {
    if (activeDetailFileFetchAbortController?.signal === signal) {
      activeDetailFileFetchAbortController = null;
    }
  }
};

const buildMatchCardButton = ({ match, index }) => {
  const normalizedMatch = normalizeSearchMatch({ match });
  const baseDistanceLabel = formatDistanceLabel({ distance: normalizedMatch.distance });
  const multiChunkHint = hasMultipleRelatedChunks(normalizedMatch.relatedChunkCount)
    ? ` · ${normalizedMatch.relatedChunkCount} chunks`
    : "";
  const distanceLabel = `${baseDistanceLabel}${multiChunkHint}`;
  const linesShort = formatMatchCardLinesShort({
    startLine: normalizedMatch.startLine,
    endLine: normalizedMatch.endLine,
  });

  const li = document.createElement("li");
  li.className = "search-results-list__item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "search-match-card";
  btn.dataset.matchIndex = String(index);
  btn.setAttribute("aria-selected", "false");
  btn.title = `${normalizedMatch.pathRelative} (${distanceLabel})`;
  btn.innerHTML = buildMatchCardMarkup({
    repository: normalizedMatch.repository,
    pathRelative: normalizedMatch.pathRelative,
    linesShort,
    distanceLabel,
  });

  btn.addEventListener("click", () => {
    void loadAndRenderDetailForMatch({ match, index });
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
  const languages = getSelectedLanguagesOrEmpty();
  return buildSemanticSearchBody({ queryText, nbResults, repository, languages });
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

const SEARCH_RESULTS_PCT_MIN = 18;
const SEARCH_RESULTS_PCT_MAX = 82;
const SEARCH_RESULTS_PCT_DEFAULT = 40;
const SEARCH_RESULTS_PCT_KEYBOARD_STEP = 5;

/** @type {{ startClientX: number; startPct: number; shellWidth: number } | null} */
let searchMasterDetailSplitterDrag = null;

const initSearchMasterDetailSplitter = () => {
  const shell = document.getElementById("search-master-detail");
  const splitter = document.getElementById("search-master-detail-splitter");
  if (!(shell instanceof window.HTMLElement) || !(splitter instanceof window.HTMLElement)) {
    return;
  }

  const clampResultsPct = (pct) => Math.min(SEARCH_RESULTS_PCT_MAX, Math.max(SEARCH_RESULTS_PCT_MIN, pct));

  const readResultsPct = () => {
    const raw = window.getComputedStyle(shell).getPropertyValue("--search-results-pct").trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : SEARCH_RESULTS_PCT_DEFAULT;
  };

  const setResultsPct = (pct) => {
    const rounded = Math.round(clampResultsPct(pct) * 10) / 10;
    shell.style.setProperty("--search-results-pct", String(rounded));
  };

  const endSplitterDrag = () => {
    searchMasterDetailSplitterDrag = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const rect = shell.getBoundingClientRect();
    searchMasterDetailSplitterDrag = {
      startClientX: event.clientX,
      startPct: readResultsPct(),
      shellWidth: rect.width,
    };
    splitter.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  splitter.addEventListener("pointermove", (event) => {
    if (searchMasterDetailSplitterDrag === null) {
      return;
    }
    const { startClientX, startPct, shellWidth } = searchMasterDetailSplitterDrag;
    if (shellWidth <= 0) {
      return;
    }
    const deltaPct = ((event.clientX - startClientX) / shellWidth) * 100;
    setResultsPct(startPct + deltaPct);
  });

  const onSplitterPointerEnd = (event) => {
    if (searchMasterDetailSplitterDrag === null) {
      return;
    }
    try {
      splitter.releasePointerCapture(event.pointerId);
    } catch (error) {
      const isExpectedUncapturedPointer = error instanceof window.DOMException && error.name === "NotFoundError";
      if (!isExpectedUncapturedPointer) {
        console.error("[search-codebase] releasePointerCapture failed:", error);
      }
    }
    endSplitterDrag();
  };

  splitter.addEventListener("pointerup", onSplitterPointerEnd);
  splitter.addEventListener("pointercancel", onSplitterPointerEnd);

  splitter.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const current = readResultsPct();
    const next =
      event.key === "ArrowRight"
        ? current + SEARCH_RESULTS_PCT_KEYBOARD_STEP
        : current - SEARCH_RESULTS_PCT_KEYBOARD_STEP;
    setResultsPct(next);
  });
};

initSearchMasterDetailSplitter();

const initLanguageFilterUi = () => {
  const el = document.getElementById("languages-filter");
  const jQuery = globalThis.jQuery;
  if (!el || typeof jQuery !== "function" || typeof jQuery(el).multipleSelect !== "function") {
    return;
  }
  jQuery(el).multipleSelect({
    filter: true,
    placeholder: "All languages",
    selectAll: false,
    width: "100%",
  });
};

initLanguageFilterUi();

document.getElementById("search-button").addEventListener("click", runSearch);

document.getElementById("query-text").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }
  if (event.shiftKey) {
    return;
  }
  event.preventDefault();
  runSearch();
});

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
