import httpx
from fastapi import HTTPException
import os

NODE_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")


class NotesTodosService:
    """
    Proxy service — forwards requests to the Node backend.
    Uses a fresh client per request to avoid connection leaks.
    """

    async def _request(self, method: str, path: str, **kwargs):
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.request(method, f"{NODE_URL}{path}", **kwargs)
            except httpx.RequestError as e:
                raise HTTPException(status_code=503, detail=f"Node backend unreachable: {e}")

        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        return resp.json()

    # ── Notebooks ─────────────────────────────────────────────────────────────

    async def create_notebook(self, data: dict):
        name = data.get("name", "").strip()
        if len(name) < 1:
            raise HTTPException(status_code=400, detail="Notebook name cannot be empty")
        data["name"] = name
        return await self._request("POST", "/notebooks", json=data)

    async def get_notebooks(self, user_id: str):
        return await self._request("GET", "/notebooks", params={"user_id": user_id})

    async def get_notebook(self, notebook_id: str):
        return await self._request("GET", f"/notebooks/{notebook_id}")

    async def update_notebook(self, notebook_id: str, data: dict):
        return await self._request("PATCH", f"/notebooks/{notebook_id}", json=data)

    async def delete_notebook(self, notebook_id: str):
        return await self._request("DELETE", f"/notebooks/{notebook_id}")

    # ── Notes ─────────────────────────────────────────────────────────────────

    async def create_note(self, data: dict):
        content = data.get("content", "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="Note content cannot be empty")
        data["content"] = content
        return await self._request("POST", "/notes", json=data)

    async def get_notes(self, user_id: str, notebook_id: str = None):
        params = {"user_id": user_id}
        if notebook_id:
            params["notebook_id"] = notebook_id
        return await self._request("GET", "/notes", params=params)

    async def update_note(self, note_id: str, content: str):
        content = content.strip()
        if not content:
            raise HTTPException(status_code=400, detail="Note content cannot be empty")
        return await self._request("PATCH", f"/notes/{note_id}", json={"content": content})

    async def delete_note(self, note_id: str):
        return await self._request("DELETE", f"/notes/{note_id}")

    # ── Todos ─────────────────────────────────────────────────────────────────

    async def create_todo(self, data: dict):
        content = data.get("content", "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="Todo cannot be empty")
        data["content"] = content
        # Auto-flag urgent todos
        if "urgent" in content.lower():
            data["priority"] = "HIGH"
        return await self._request("POST", "/todos", json=data)

    async def get_todos(self, user_id: str, include_completed: bool = False):
        return await self._request("GET", "/todos", params={
            "user_id": user_id,
            "include_completed": str(include_completed).lower(),
        })

    async def complete_todo(self, todo_id: str):
        result = await self._request("POST", f"/todos/{todo_id}/complete")
        result["xp_earned"] = 5
        return result

    async def delete_todo(self, todo_id: str):
        return await self._request("DELETE", f"/todos/{todo_id}")