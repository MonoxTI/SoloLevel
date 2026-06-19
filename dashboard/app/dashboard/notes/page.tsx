"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getNotebooks, createNotebook, updateNotebook, deleteNotebook,
  getNotes, createNote, updateNote, deleteNote,
  type Notebook, type Note,
} from "@/lib/api";

const EMOJIS = ["📓", "📔", "📒", "📕", "📗", "📘", "📙", "🗒️", "💼", "🎯", "💡", "🔬", "🎨", "🏋️", "💰"];

export default function NotesPage() {
  const [notebooks, setNotebooks]       = useState<Notebook[]>([]);
  const [activeId, setActiveId]         = useState<string | null>(null);
  const [notes, setNotes]               = useState<Note[]>([]);
  const [loading, setLoading]           = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);

  // New notebook form
  const [showNewNB, setShowNewNB]   = useState(false);
  const [nbName, setNbName]         = useState("");
  const [nbEmoji, setNbEmoji]       = useState("📓");
  const [nbDesc, setNbDesc]         = useState("");
  const [savingNB, setSavingNB]     = useState(false);

  // Edit notebook
  const [editNBId, setEditNBId]     = useState<string | null>(null);
  const [editNBName, setEditNBName] = useState("");
  const [editNBEmoji, setEditNBEmoji] = useState("📓");

  // Notes
  const [draft, setDraft]           = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteDraft, setEditNoteDraft] = useState("");

  const loadNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const nbs = await getNotebooks();
      setNotebooks(nbs);
      if (!activeId && nbs.length > 0) setActiveId(nbs[0].id);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  const loadNotes = useCallback(async (nbId: string) => {
    setNotesLoading(true);
    try {
      const data = await getNotes(undefined, nbId);
      setNotes(data);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => { loadNotebooks(); }, []);
  useEffect(() => { if (activeId) loadNotes(activeId); }, [activeId]);

  const activeNotebook = notebooks.find(n => n.id === activeId);

  // ── Notebook CRUD ────────────────────────────────────────────────────────
  const handleCreateNB = async () => {
    if (!nbName.trim()) return;
    setSavingNB(true);
    try {
      const nb = await createNotebook({ name: nbName.trim(), emoji: nbEmoji, description: nbDesc.trim() || undefined });
      setNotebooks(prev => [...prev, { ...nb, _count: { notes: 0 } }]);
      setActiveId(nb.id);
      setNbName(""); setNbEmoji("📓"); setNbDesc(""); setShowNewNB(false);
    } finally { setSavingNB(false); }
  };

  const handleDeleteNB = async (id: string) => {
    if (!confirm("Delete this notebook and all its notes?")) return;
    await deleteNotebook(id);
    const remaining = notebooks.filter(n => n.id !== id);
    setNotebooks(remaining);
    setActiveId(remaining[0]?.id ?? null);
  };

  const saveEditNB = async () => {
    if (!editNBId) return;
    await updateNotebook(editNBId, { name: editNBName, emoji: editNBEmoji });
    setNotebooks(prev => prev.map(n => n.id === editNBId ? { ...n, name: editNBName, emoji: editNBEmoji } : n));
    setEditNBId(null);
  };

  // ── Note CRUD ────────────────────────────────────────────────────────────
  const handleCreateNote = async () => {
    if (!draft.trim() || !activeId) return;
    setSavingNote(true);
    try {
      const note = await createNote(draft.trim(), undefined, activeId);
      setNotes(prev => [note, ...prev]);
      setDraft("");
      setNotebooks(prev => prev.map(n => n.id === activeId
        ? { ...n, _count: { notes: (n._count?.notes ?? 0) + 1 } } : n));
    } finally { setSavingNote(false); }
  };

  const saveEditNote = async () => {
    if (!editNoteId || !editNoteDraft.trim()) return;
    const updated = await updateNote(editNoteId, editNoteDraft.trim());
    setNotes(prev => prev.map(n => n.id === editNoteId ? updated : n));
    setEditNoteId(null);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    setNotebooks(prev => prev.map(n => n.id === activeId
      ? { ...n, _count: { notes: Math.max(0, (n._count?.notes ?? 1) - 1) } } : n));
  };

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Notebook sidebar ── */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-bg-2 flex flex-col">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Notebooks</h2>
          <button
            onClick={() => setShowNewNB(true)}
            className="text-cyan text-lg leading-none hover:text-cyan-dim transition-colors"
            title="New notebook"
          >+</button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {loading ? (
            <div className="space-y-1.5 p-2">
              {[1,2,3].map(i => <div key={i} className="h-8 bg-bg-3 rounded animate-pulse" />)}
            </div>
          ) : notebooks.length === 0 ? (
            <p className="text-[11px] text-muted px-3 py-4">No notebooks yet.</p>
          ) : notebooks.map(nb => (
            <div key={nb.id} className="group relative">
              <button
                onClick={() => setActiveId(nb.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors
                  ${activeId === nb.id ? "bg-cyan-muted text-cyan" : "text-ink-2 hover:bg-bg-3 hover:text-ink"}`}
              >
                <span className="text-base leading-none flex-shrink-0">{nb.emoji}</span>
                <div className="flex-1 min-w-0">
                  {editNBId === nb.id ? (
                    <input
                      value={editNBName}
                      onChange={e => setEditNBName(e.target.value)}
                      onBlur={saveEditNB}
                      onKeyDown={e => { if (e.key === "Enter") saveEditNB(); if (e.key === "Escape") setEditNBId(null); }}
                      className="bg-transparent text-xs text-ink w-full focus:outline-none"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-xs font-medium truncate block">{nb.name}</span>
                  )}
                  <span className="text-[9px] text-muted">{nb._count?.notes ?? 0} notes</span>
                </div>
              </button>

              {/* Hover actions */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5">
                <button
                  onClick={e => { e.stopPropagation(); setEditNBId(nb.id); setEditNBName(nb.name); setEditNBEmoji(nb.emoji); }}
                  className="text-[9px] px-1.5 py-0.5 rounded text-ink-2 hover:text-cyan transition-colors"
                  title="Rename"
                >✎</button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteNB(nb.id); }}
                  className="text-[9px] px-1.5 py-0.5 rounded text-ink-2 hover:text-red transition-colors"
                  title="Delete notebook"
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        {/* New notebook form */}
        {showNewNB && (
          <div className="border-t border-border p-3 space-y-2">
            {/* Emoji picker */}
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setNbEmoji(e)}
                  className={`text-base rounded px-1 transition-colors ${nbEmoji === e ? "bg-cyan-muted" : "hover:bg-bg-3"}`}
                >{e}</button>
              ))}
            </div>
            <input
              value={nbName}
              onChange={e => setNbName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateNB(); if (e.key === "Escape") setShowNewNB(false); }}
              placeholder="Notebook name..."
              autoFocus
              className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs text-ink
                         placeholder:text-muted focus:border-cyan/50 focus:outline-none"
            />
            <input
              value={nbDesc}
              onChange={e => setNbDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-bg-3 border border-border rounded px-2 py-1.5 text-xs text-ink
                         placeholder:text-muted focus:border-cyan/50 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewNB(false)}
                className="flex-1 py-1 rounded border border-border text-ink-2 text-[10px] hover:text-ink transition-colors"
              >Cancel</button>
              <button
                onClick={handleCreateNB}
                disabled={!nbName.trim() || savingNB}
                className="flex-1 py-1 rounded border border-cyan/30 text-cyan text-[10px]
                           hover:bg-cyan/10 transition-colors disabled:opacity-40"
              >{savingNB ? "..." : "Create"}</button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Notes area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          {activeNotebook ? (
            <div>
              <h1 className="font-display text-2xl tracking-widest text-ink">
                {activeNotebook.emoji} {activeNotebook.name.toUpperCase()}
              </h1>
              {activeNotebook.description && (
                <p className="text-[11px] text-ink-2 mt-0.5">{activeNotebook.description}</p>
              )}
            </div>
          ) : (
            <h1 className="font-display text-2xl tracking-widest text-ink">NOTES</h1>
          )}
          <span className="text-[10px] text-muted">{notes.length} notes</span>
        </div>

        {/* New note composer */}
        {activeId && (
          <div className="px-6 py-3 border-b border-border flex-shrink-0">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreateNote(); }}
              placeholder={`Add a note to ${activeNotebook?.name ?? "this notebook"}...`}
              rows={2}
              className="w-full bg-bg-2 border border-border rounded px-3 py-2 text-sm text-ink
                         placeholder:text-muted focus:border-cyan/50 focus:outline-none resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted">Ctrl+Enter to save</span>
              <button
                onClick={handleCreateNote}
                disabled={!draft.trim() || savingNote}
                className="px-4 py-1.5 rounded border border-cyan/30 text-cyan text-[11px]
                           hover:bg-cyan/10 transition-colors disabled:opacity-40"
              >{savingNote ? "Saving..." : "+ Add note"}</button>
            </div>
          </div>
        )}

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!activeId ? (
            <div className="text-center py-16">
              <p className="text-ink-2 text-sm">Select or create a notebook to get started.</p>
            </div>
          ) : notesLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-bg-2 border border-border rounded-lg animate-pulse" />)}
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-ink-2 text-sm">No notes in this notebook yet.</p>
              <p className="text-muted text-[11px] mt-1">
                Add one above, or tell the bot:
                <span className="text-cyan"> note: your text here</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {notes.map(note => (
                <div key={note.id} className="bg-bg-2 border border-border rounded-lg p-4 group">
                  {editNoteId === note.id ? (
                    <div>
                      <textarea
                        value={editNoteDraft}
                        onChange={e => setEditNoteDraft(e.target.value)}
                        rows={4}
                        className="w-full bg-bg-3 border border-border rounded px-3 py-2 text-sm text-ink
                                   focus:border-cyan/50 focus:outline-none resize-none"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => setEditNoteId(null)}
                          className="px-3 py-1 rounded border border-border text-ink-2 text-[10px] hover:text-ink transition-colors">
                          Cancel
                        </button>
                        <button onClick={saveEditNote}
                          className="px-3 py-1 rounded border border-cyan/30 text-cyan text-[10px] hover:bg-cyan/10 transition-colors">
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink whitespace-pre-wrap break-words">{note.content}</p>
                        <p className="text-[10px] text-muted mt-2">
                          {new Date(note.createdAt).toLocaleDateString("en-ZA", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditNoteId(note.id); setEditNoteDraft(note.content); }}
                          className="text-[10px] px-2 py-1 rounded border border-border text-ink-2
                                     hover:text-cyan hover:border-cyan/30 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-[10px] px-2 py-1 rounded border border-red/30 text-red hover:bg-red-muted transition-colors"
                        >Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}