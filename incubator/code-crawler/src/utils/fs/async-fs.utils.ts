import { getErrorMessage } from "@lichens-innovation/ts-common";
import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";

export const readDirEntriesOrNull = async (dir: string): Promise<Dirent[] | null> => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (e: unknown) {
    console.error(`[readDirEntriesOrNull]: readdir failed on ${dir}: ${getErrorMessage(e)}`, e);
    return null;
  }
};

export const statFileOrNull = async (fullPath: string): Promise<Stats | null> => {
  try {
    return await stat(fullPath);
  } catch (e: unknown) {
    console.error(`[statFileOrNull]: stat failed on ${fullPath}: ${getErrorMessage(e)}`, e);
    return null;
  }
};

export const readFileBufferOrNull = async (fullPath: string): Promise<Buffer | null> => {
  try {
    return await readFile(fullPath);
  } catch (e: unknown) {
    console.error(`[readFileBufferOrNull]: readFile failed on ${fullPath}: ${getErrorMessage(e)}`, e);
    return null;
  }
};
