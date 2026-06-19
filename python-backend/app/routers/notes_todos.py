"""Proxy router — forwards notes/notebooks/todos to Node backend."""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

router = APIRouter(prefix="/notes-todos", tags=["notes-todos"])
NODE_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")


async def _proxy(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.request(method, f"{NODE_URL}{path}", **kwargs)
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Node backend unreachable: {e}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# ── Notebooks ─────────────────────────────────────────────────────────────────
class NotebookCreate(BaseModel):
    user_id: str
    name: str
    description: Optional[str] = None
    emoji: Optional[str] = "📓"

class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None

@router.get("/notebooks")
async def list_notebooks(user_id: str):
    return await _proxy("GET", "/notebooks", params={"user_id": user_id})

@router.post("/notebooks")
async def create_notebook(body: NotebookCreate):
    return await _proxy("POST", "/notebooks", json=body.model_dump())

@router.get("/notebooks/{notebook_id}")
async def get_notebook(notebook_id: str):
    return await _proxy("GET", f"/notebooks/{notebook_id}")

@router.patch("/notebooks/{notebook_id}")
async def update_notebook(notebook_id: str, body: NotebookUpdate):
    return await _proxy("PATCH", f"/notebooks/{notebook_id}", json=body.model_dump(exclude_none=True))

@router.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str):
    return await _proxy("DELETE", f"/notebooks/{notebook_id}")


# ── Notes ─────────────────────────────────────────────────────────────────────
class NoteCreate(BaseModel):
    user_id: str
    content: str
    notebook_id: Optional[str] = None

class NoteUpdate(BaseModel):
    content: str

@router.get("/notes")
async def list_notes(user_id: str, notebook_id: Optional[str] = None):
    params = {"user_id": user_id}
    if notebook_id:
        params["notebook_id"] = notebook_id
    return await _proxy("GET", "/notes", params=params)

@router.post("/notes")
async def create_note(body: NoteCreate):
    return await _proxy("POST", "/notes", json=body.model_dump())

@router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate):
    return await _proxy("PATCH", f"/notes/{note_id}", json={"content": body.content})

@router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    return await _proxy("DELETE", f"/notes/{note_id}")


# ── Todos ─────────────────────────────────────────────────────────────────────
class TodoCreate(BaseModel):
    user_id: str
    content: str

@router.get("/todos")
async def list_todos(user_id: str, include_completed: bool = False):
    return await _proxy("GET", "/todos", params={
        "user_id": user_id,
        "include_completed": str(include_completed).lower(),
    })

@router.post("/todos")
async def create_todo(body: TodoCreate):
    return await _proxy("POST", "/todos", json=body.model_dump())

@router.post("/todos/{todo_id}/complete")
async def complete_todo(todo_id: str):
    return await _proxy("POST", f"/todos/{todo_id}/complete")

@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str):
    return await _proxy("DELETE", f"/todos/{todo_id}")