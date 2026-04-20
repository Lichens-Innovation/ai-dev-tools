import { isNullish } from "@lichens-innovation/ts-common";
import { StatusCodes } from "http-status-codes";
import { readFileBufferOrNull, statFileOrNull } from "../../utils/fs/async-fs.utils";
import { getCodeCrawlerMaxIndexFileBytes } from "../../utils/env.utils";
import type { SemanticIndexStore } from "../types/store.types";

export type IndexedFileContentPayload = {
  content: string;
  fileId: string;
  fullPath: string;
};

export interface GetIndexedFileContentFailure {
  error: string;
  httpStatus: number;
  ok: false;
}

export interface GetIndexedFileContentSuccess {
  ok: true;
  payload: IndexedFileContentPayload;
}

export type GetIndexedFileContentOutcome = GetIndexedFileContentFailure | GetIndexedFileContentSuccess;

const notFoundIndexedFileContentOutcome = (error: string): GetIndexedFileContentOutcome => ({
  ok: false,
  httpStatus: StatusCodes.NOT_FOUND,
  error,
});

interface GetIndexedFileContentByFileIdArgs {
  store: SemanticIndexStore;
  fileId: string;
}

export const getIndexedFileContentByFileId = async ({
  store,
  fileId,
}: GetIndexedFileContentByFileIdArgs): Promise<GetIndexedFileContentOutcome> => {
  const metadata = store.getFileMetadataByFileId(fileId);
  if (isNullish(metadata)) {
    return notFoundIndexedFileContentOutcome("Unknown fileId in semantic index");
  }

  const st = await statFileOrNull(metadata.fullPath);
  if (isNullish(st) || !st.isFile() || st.size > getCodeCrawlerMaxIndexFileBytes()) {
    return notFoundIndexedFileContentOutcome("Indexed file is missing or not readable");
  }

  const buf = await readFileBufferOrNull(metadata.fullPath);
  if (isNullish(buf)) {
    return notFoundIndexedFileContentOutcome("Indexed file could not be read");
  }

  const content = buf.toString("utf8");
  if (content.includes("\uFFFD")) {
    return notFoundIndexedFileContentOutcome("Indexed file is not valid UTF-8 text");
  }

  return {
    ok: true,
    payload: {
      fileId: metadata.fileId,
      fullPath: metadata.fullPath,
      content,
    },
  };
};
