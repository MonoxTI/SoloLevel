import axios from "axios";
import { config } from "../config";

const api = axios.create({ baseURL: config.pythonApiUrl });

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(userId: string) {
  const { data } = await api.get("/notes-todos/notes", { params: { user_id: userId } });
  return data;
}

export async function createNote(userId: string, content: string, notebookId: string = "default") {
  const { data } = await api.post("/notes-todos/notes", {
    user_id: userId,
    notebook_id: notebookId,
    content,
    title: content.slice(0, 60),
  });
  return data;
}

export async function deleteNote(noteId: string) {
  const { data } = await api.delete(`/notes-todos/notes/${noteId}`);
  return data;
}

// ── Todos ─────────────────────────────────────────────────────────────────────

export async function getTodos(userId: string, completed?: boolean) {
  const params: Record<string, string> = { user_id: userId };
  if (completed !== undefined) params.completed = String(completed);
  const { data } = await api.get("/notes-todos/todos", { params });
  return data;
}

export async function createTodo(userId: string, content: string) {
  const { data } = await api.post("/notes-todos/todos", {
    user_id: userId,
    content,
  });
  return data;
}

export async function completeTodo(todoId: string) {
  const { data } = await api.patch(`/notes-todos/todos/${todoId}/complete`);
  return data;
}

export async function deleteTodo(todoId: string) {
  const { data } = await api.delete(`/notes-todos/todos/${todoId}`);
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hoursElapsed(from: Date): number {
  return (Date.now() - from.getTime()) / 3_600_000;
}