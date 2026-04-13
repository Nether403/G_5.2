export type Role = "system" | "user" | "assistant";

export type PassType =
  | "user"
  | "draft"
  | "critique"
  | "revision"
  | "final";

export interface Message {
  role: Role;
  content: string;
  passType?: PassType;
  createdAt?: string;
}
