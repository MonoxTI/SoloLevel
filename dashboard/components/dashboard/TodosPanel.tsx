"use client";

import { useState, useEffect } from "react";
import { getTodos, completeTodo, type Todo } from "@/lib/api";

export function TodosPanel() {
  const [todos, setTodos]     = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await getTodos();
      setTodos(data);
    } catch {
      setTodos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute for live countdown
    return () => clearInterval(interval);
  }, []);

  const handleComplete = async (id: string) => {
    try {
      await completeTodo(id);
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch {}
  };

  const urgencyColor = (hoursLeft: number) => {
    if (hoursLeft <= 2) return "text-red";
    if (hoursLeft <= 9) return "text-amber";
    return "text-ink-2";
  };

  if (loading) {
    return (
      <div className="bg-bg-2 border border-border rounded-lg p-4">
        <div className="h-16 animate-pulse bg-bg-3 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
          Todos ({todos.length})
        </h2>
        <span className="text-[10px] text-muted">expire 24h after creation</span>
      </div>

      {todos.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-ink-2 text-xs">No active todos.</p>
          <p className="text-muted text-[11px] mt-1">
            Tell the bot: <span className="text-cyan">todo: finish report</span>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map(todo => (
            <div key={todo.id} className="flex items-center justify-between gap-3 bg-bg-3 rounded px-3 py-2">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <button
                  onClick={() => handleComplete(todo.id)}
                  className="w-4 h-4 rounded-full border border-border flex-shrink-0 hover:border-cyan transition-colors"
                  title="Mark complete"
                />
                <span className="text-xs text-ink truncate">{todo.content}</span>
              </div>
              <span className={`text-[10px] flex-shrink-0 ${urgencyColor(todo.hoursUntilExpiry)}`}>
                {todo.hoursUntilExpiry}h left
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}