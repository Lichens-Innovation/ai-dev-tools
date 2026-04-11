const MAX_NB_RESULTS = 50;

const getResultPanel = () => document.getElementById("result");

const formatPayloadForDisplay = (data) => (typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));

const scrollPanelToEnd = ({ element }) => {
  element.scrollTop = element.scrollHeight;
};

const displayResult = ({ data, isError = false }) => {
  const resultDiv = getResultPanel();
  const timestamp = new Date().toLocaleTimeString("en-US");
  const prefix = isError ? "❌" : "✅";
  const text = formatPayloadForDisplay(data);
  resultDiv.innerHTML += `\n[${timestamp}] ${prefix}\n${text}\n`;
  scrollPanelToEnd({ element: resultDiv });
};

const getTrimmedQueryText = () => document.getElementById("query-text").value.trim();

const notifyEmptyQuery = () => {
  displayResult({ data: "Enter a query in the text field.", isError: true });
};

const getNbResultsInputValue = () => Number.parseInt(document.getElementById("nb-results").value, 10);

const notifyInvalidNbResults = () => {
  displayResult({
    data: `Invalid number of results (integer between 1 and ${MAX_NB_RESULTS}).`,
    isError: true,
  });
};

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

const displayHttpError = ({ status, statusText, payload }) => {
  displayResult({
    data: { status, statusText, body: payload },
    isError: true,
  });
};

const postSemanticSearch = async ({ body }) => {
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
  displayResult({ data: payload });
};

const formatThrownValue = ({ error }) => (error instanceof Error ? error.message : String(error));

const setSearchButtonDisabled = ({ disabled }) => {
  document.getElementById("search-button").disabled = disabled;
};

const readSearchFormOrNotify = () => {
  const queryText = getTrimmedQueryText();
  if (queryText.length === 0) {
    notifyEmptyQuery();
    return null;
  }
  const nbResults = getNbResultsInputValue();
  if (!isNbResultsValid({ value: nbResults })) {
    notifyInvalidNbResults();
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
    displayResult({ data: formatThrownValue({ error }), isError: true });
  } finally {
    setSearchButtonDisabled({ disabled: false });
  }
};

document.getElementById("search-button").addEventListener("click", runSearch);
