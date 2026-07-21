import type { ContextSource, EditProposal } from "@open-assistant/protocol";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  citations?: Array<{ sourceId: string; chunkId: string }>;
};

export type ConversationState = {
  conversationId: string;
  title: string;
  sources: ContextSource[];
  messages: ChatMessage[];
  proposal?: EditProposal;
  private: boolean;
};

export function newConversation(isPrivate = false): ConversationState {
  return {
    conversationId: crypto.randomUUID(),
    title: "New conversation",
    sources: [],
    messages: [],
    private: isPrivate,
  };
}
