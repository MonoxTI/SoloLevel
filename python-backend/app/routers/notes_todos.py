from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel
from app.services.notes_todos_service import NotesTodosService

router = APIRouter(prefix="/notes-todos", tags=["notes-todos"])


def get_service():
    return NotesTodosService()


# ── Schemas ───────────────────────────────────────────────────────────────────

class NotebookCreate(BaseModel):
    user_id: str
    name: str
    description: Optional[str] = None
    emoji: Optional[str] = "📓"

class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None

class NoteCreate(BaseModel):
    user_id: str
    content: str
    notebook_id: Optional[str] = None

class NoteUpdate(BaseModel):
    content: str

class TodoCreate(BaseModel):
    user_id: str
    content: str


# ── Notebooks ─────────────────────────────────────────────────────────────────

@router.get("/notebooks")
async def list_notebooks(user_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.get_notebooks(user_id)

@router.post("/notebooks")
async def create_notebook(body: NotebookCreate, service: NotesTodosService = Depends(get_service)):
    return await service.create_notebook(body.model_dump())

@router.get("/notebooks/{notebook_id}")
async def get_notebook(notebook_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.get_notebook(notebook_id)

@router.patch("/notebooks/{notebook_id}")
async def update_notebook(notebook_id: str, body: NotebookUpdate, service: NotesTodosService = Depends(get_service)):
    return await service.update_notebook(notebook_id, body.model_dump(exclude_none=True))

@router.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.delete_notebook(notebook_id)


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.get("/notes")
async def list_notes(
    user_id: str,
    notebook_id: Optional[str] = Query(default=None),
    service: NotesTodosService = Depends(get_service)
):
    return await service.get_notes(user_id, notebook_id)

@router.post("/notes")
async def create_note(body: NoteCreate, service: NotesTodosService = Depends(get_service)):
    return await service.create_note(body.model_dump())

@router.patch("/notes/{note_id}")
async def update_note(note_id: str, body: NoteUpdate, service: NotesTodosService = Depends(get_service)):
    return await service.update_note(note_id, body.content)

@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.delete_note(note_id)


# ── Todos ─────────────────────────────────────────────────────────────────────

@router.get("/todos")
async def list_todos(
    user_id: str,
    include_completed: bool = False,
    service: NotesTodosService = Depends(get_service)
):
    return await service.get_todos(user_id, include_completed)

@router.post("/todos")
async def create_todo(body: TodoCreate, service: NotesTodosService = Depends(get_service)):
    return await service.create_todo(body.model_dump())

@router.post("/todos/{todo_id}/complete")
async def complete_todo(todo_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.complete_todo(todo_id)

@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, service: NotesTodosService = Depends(get_service)):
    return await service.delete_todo(todo_id)