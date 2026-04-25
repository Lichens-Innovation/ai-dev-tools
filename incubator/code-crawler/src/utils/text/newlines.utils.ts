/** Normalizes Windows / legacy Mac newlines to `\n`. */
export const normalizeSourceNewlines = (content: string): string => content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
