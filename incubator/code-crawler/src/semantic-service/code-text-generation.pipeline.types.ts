export interface TextGenOutputItem {
  generated_text: string;
}

/** Chat-shaped I/O when the loaded model is used with message arrays (e.g. instruct models). */
export interface TextGenChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TextGenChatOutputItem {
  generated_text: TextGenChatMessage[];
}

export type TextGenChatGenerator = (
  messages: TextGenChatMessage[],
  options?: { max_new_tokens?: number }
) => Promise<TextGenChatOutputItem[] | TextGenChatOutputItem[][]>;
