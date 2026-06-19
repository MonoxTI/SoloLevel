import express from "express";
import {
  createNotebook, getNotebooks, getNotebook, updateNotebook, deleteNotebook,
  ensureDefaultNotebook,
  createNote, getNotes, getNote, updateNote, deleteNote,
  createTodo, getTodos, completeTodo, deleteTodo, hoursElapsed,
} from "../services/notesAndTodos";

export const notebooksRouter = express.Router();
export const notesRouter     = express.Router();
export const todosRouter     = express.Router();

// ── Notebooks ─────────────────────────────────────────────────────────────────

notebooksRouter.get("/", async (req, res) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ error: "user_id required" });
  const notebooks = await getNotebooks(userId);
  res.json(notebooks);
});

notebooksRouter.post("/", async (req, res) => {
  const { user_id, name, description, emoji } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: "user_id and name required" });
  const nb = await createNotebook(user_id, name, description, emoji);
  res.status(201).json(nb);
});

notebooksRouter.get("/:id", async (req, res) => {
  const nb = await getNotebook(req.params.id);
  if (!nb) return res.status(404).json({ error: "Notebook not found" });
  res.json(nb);
});

notebooksRouter.patch("/:id", async (req, res) => {
  try {
    const nb = await updateNotebook(req.params.id, req.body);
    res.json(nb);
  } catch { res.status(404).json({ error: "Notebook not found" }); }
});

notebooksRouter.delete("/:id", async (req, res) => {
  try {
    await deleteNotebook(req.params.id);
    res.json({ deleted: true });
  } catch { res.status(404).json({ error: "Notebook not found" }); }
});

// ── Notes ─────────────────────────────────────────────────────────────────────

notesRouter.get("/", async (req, res) => {
  const userId     = req.query.user_id as string;
  const notebookId = req.query.notebook_id as string | undefined;
  if (!userId) return res.status(400).json({ error: "user_id required" });
  res.json(await getNotes(userId, notebookId));
});

notesRouter.post("/", async (req, res) => {
  const { user_id, content, notebook_id } = req.body;
  if (!user_id || !content) return res.status(400).json({ error: "user_id and content required" });
  // If no notebook_id, auto-route to General notebook
  const nbId = notebook_id ?? await ensureDefaultNotebook(user_id);
  res.status(201).json(await createNote(user_id, content, nbId));
});

notesRouter.patch("/:id", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  try { res.json(await updateNote(req.params.id, content)); }
  catch { res.status(404).json({ error: "Note not found" }); }
});

notesRouter.delete("/:id", async (req, res) => {
  try { await deleteNote(req.params.id); res.json({ deleted: true }); }
  catch { res.status(404).json({ error: "Note not found" }); }
});

// ── Todos ─────────────────────────────────────────────────────────────────────

todosRouter.get("/", async (req, res) => {
  const userId = req.query.user_id as string;
  const includeCompleted = req.query.include_completed === "true";
  if (!userId) return res.status(400).json({ error: "user_id required" });
  const todos = await getTodos(userId, includeCompleted);
  res.json(todos.map(t => ({
    ...t,
    hoursElapsed:    Math.round(hoursElapsed(t.createdAt) * 10) / 10,
    hoursUntilExpiry: Math.max(0, Math.round((24 - hoursElapsed(t.createdAt)) * 10) / 10),
  })));
});

todosRouter.post("/", async (req, res) => {
  const { user_id, content } = req.body;
  if (!user_id || !content) return res.status(400).json({ error: "user_id and content required" });
  res.status(201).json(await createTodo(user_id, content));
});

todosRouter.post("/:id/complete", async (req, res) => {
  try { res.json(await completeTodo(req.params.id)); }
  catch { res.status(404).json({ error: "Todo not found" }); }
});

todosRouter.delete("/:id", async (req, res) => {
  try { await deleteTodo(req.params.id); res.json({ deleted: true }); }
  catch { res.status(404).json({ error: "Todo not found" }); }
});