import { isNullish } from "@lichens-innovation/ts-common";

type Fragments = readonly string[] | null;

export const toString = (fragments?: Fragments): string => buildString({ fragments });
export const toStringLf = (fragments?: Fragments): string => buildString({ fragments, separator: "\n" });

interface BuildStringArgs {
  fragments?: Fragments;
  separator?: string;
}

const buildString = ({ fragments, separator }: BuildStringArgs): string => {
  if (isNullish(fragments)) {
    return "";
  }

  if (fragments.length === 0) {
    return "";
  }

  return fragments.join(separator ?? " ");
};
