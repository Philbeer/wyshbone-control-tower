/**
 * Type definitions for Wyshbone UI chat API requests
 * Discovered through iterative testing of /api/chat endpoint
 */

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  domain?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  user: ChatUser;
  messages: ChatMessage[];
  sessionId?: string;
  goal?: string;
}

export interface ChatResponse {
  message?: string;
  response?: string;
  [key: string]: any;
}
