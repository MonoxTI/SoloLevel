import { prisma } from "../db/prisma";

// ── Notebooks ─────────────────────────────────────────────────────────────────

export async function createNotebook(userId: string, name: string, description?: string, emoji = "📓") {
  return prisma.notebook.create({ data: { userId, name, description, emoji } });
}

export async function getNotebooks(userId: string) {
  return prisma.notebook.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { notes: true } } },
  });
}

export async function getNotebook(notebookId: string) {
  return prisma.notebook.findUnique({
    where: { id: notebookId },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });
}

export async function updateNotebook(notebookId: string, data: { name?: string; description?: string; emoji?: string }) {
  return prisma.notebook.update({ where: { id: notebookId }, data });
}

export async function deleteNotebook(notebookId: string) {
  // Cascades to notes via schema relation
  return prisma.notebook.delete({ where: { id: notebookId } });
}

/** Ensures every user has at least a "General" notebook. Returns its id. */
export async function ensureDefaultNotebook(userId: string): Promise<string> {
  const existing = await prisma.notebook.findFirst({
    where: { userId, name: "General" },
  });
  if (existing) return existing.id;
  const created = await prisma.notebook.create({
    data: { userId, name: "General", emoji: "📓" },
  });
  return created.id;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function createNote(userId: string, content: string, notebookId: string) {
  return prisma.note.create({ data: { userId, notebookId, content } });
}

export async function getNotes(userId: string, notebookId?: string) {
  return prisma.note.findMany({
    where: notebookId ? { userId, notebookId } : { userId },
    orderBy: { createdAt: "desc" },
    include: { notebook: { select: { name: true, emoji: true } } },
  });
}

export async function getNote(noteId: string) {
  return prisma.note.findUnique({ where: { id: noteId } });
}

export async function updateNote(noteId: string, content: string) {
  return prisma.note.update({ where: { id: noteId }, data: { content } });
}

export async function deleteNote(noteId: string) {
  return prisma.note.delete({ where: { id: noteId } });
}

// ── Todos ─────────────────────────────────────────────────────────────────────

export async function createTodo(userId: string, content: string) {
  return prisma.todo.create({ data: { userId, content } });
}

export async function getTodos(userId: string, includeCompleted = false) {
  return prisma.todo.findMany({
    where: includeCompleted ? { userId } : { userId, completed: false },
    orderBy: { createdAt: "asc" },
  });
}

export async function completeTodo(todoId: string) {
  return prisma.todo.update({ where: { id: todoId }, data: { completed: true } });
}

export async function deleteTodo(todoId: string) {
  return prisma.todo.delete({ where: { id: todoId } });
}

export function hoursElapsed(createdAt: Date): number {
  return (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
}