const JSON_REQUEST_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

const getResultPanel = () => document.getElementById("result");

const formatPayloadForDisplay = (data) => (typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));

const scrollPanelToEnd = ({ element }) => {
  element.scrollTop = element.scrollHeight;
};

const displayResult = ({ data, isError = false }) => {
  const resultDiv = getResultPanel();
  const timestamp = new Date().toLocaleTimeString();
  const prefix = isError ? "❌" : "✅";
  const text = formatPayloadForDisplay(data);
  resultDiv.innerHTML += `\n[${timestamp}] ${prefix}\n${text}\n`;
  scrollPanelToEnd({ element: resultDiv });
};

const clearResult = () => {
  getResultPanel().innerHTML = "";
};

const readJsonFromTextarea = ({ textareaId }) => {
  const raw = document.getElementById(textareaId).value.trim();
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw);
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

const displayHttpError = ({ status, statusText, payload }) => {
  displayResult({
    data: { status, statusText, body: payload },
    isError: true,
  });
};

const showResponse = async ({ response }) => {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  const payload = parsePayloadFromResponseParts({ contentType, bodyText });
  if (!response.ok) {
    displayHttpError({ status: response.status, statusText: response.statusText, payload });
    return;
  }
  displayResult({ data: payload });
};

const formatThrownValue = ({ error }) => (error instanceof Error ? error.message : String(error));

const tryReadJsonFromTextarea = ({ textareaId }) => {
  try {
    return { ok: true, body: readJsonFromTextarea({ textareaId }) };
  } catch (error) {
    displayResult({ data: formatThrownValue({ error }), isError: true });
    return { ok: false };
  }
};

const fetchJsonPost = async ({ path, jsonBody }) =>
  fetch(path, {
    method: "POST",
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(jsonBody),
  });

const runJsonPostFromTextarea = async ({ path, textareaId }) => {
  const parsed = tryReadJsonFromTextarea({ textareaId });
  if (!parsed.ok) {
    return;
  }
  try {
    const response = await fetchJsonPost({ path, jsonBody: parsed.body });
    await showResponse({ response });
  } catch (error) {
    displayResult({ data: formatThrownValue({ error }), isError: true });
  }
};

const runGetAndShow = async ({ path }) => {
  try {
    const response = await fetch(path);
    await showResponse({ response });
  } catch (error) {
    displayResult({ data: formatThrownValue({ error }), isError: true });
  }
};

const testGetWorkspaceRepositories = async () => {
  await runGetAndShow({ path: "/api/workspace-repositories" });
};

const testPrepareRepository = async () => {
  await runJsonPostFromTextarea({
    path: "/api/prepare-repository-for-semantic-search",
    textareaId: "body-prepare-repo",
  });
};

const testPrepareWorkspace = async () => {
  await runJsonPostFromTextarea({
    path: "/api/prepare-workspace-repositories-for-semantic-search",
    textareaId: "body-prepare-ws",
  });
};

const testSemanticSearch = async () => {
  await runJsonPostFromTextarea({
    path: "/api/semantic-search-workspace-files",
    textareaId: "body-semantic",
  });
};

const CLEAR_INDEX_CONFIRM_MESSAGE =
  "Clear the workspace semantic index? This removes embedded search data until you prepare repositories again.";

const testClearIndex = async () => {
  const confirmed = window.confirm(CLEAR_INDEX_CONFIRM_MESSAGE);
  if (!confirmed) {
    return;
  }
  await runJsonPostFromTextarea({
    path: "/api/clear-workspace-semantic-index",
    textareaId: "body-clear",
  });
};

Object.assign(window, {
  clearResult,
  testGetWorkspaceRepositories,
  testPrepareRepository,
  testPrepareWorkspace,
  testSemanticSearch,
  testClearIndex,
});
