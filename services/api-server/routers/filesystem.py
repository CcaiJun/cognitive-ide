"""Filesystem router — browse, create, rename, delete files and directories."""

import os
import shutil
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

# Directories to skip during listing
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".nuxt", ".cache", ".tox", ".mypy_cache", ".pytest_cache",
    "target", ".idea", ".vscode", ".DS_Store", ".cognition",
}


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int = 0
    children: Optional[List["DirEntry"]] = None


class DirListing(BaseModel):
    path: str
    parent: Optional[str] = None
    entries: List[DirEntry]


class WorkspaceCandidate(BaseModel):
    path: str
    name: str
    language: str = "unknown"
    has_cognition: bool = False
    reason: str = ""


@router.get("/browse", response_model=DirListing)
async def browse_directory(
    path: str = Query("~", description="Directory path to browse"),
    depth: int = Query(1, description="Listing depth (1 = flat, 2 = one level nested)"),
):
    """List contents of a directory on the server filesystem."""
    # Expand home and normalize
    expanded = os.path.expanduser(path)
    expanded = os.path.normpath(expanded)

    if not os.path.isdir(expanded):
        raise HTTPException(404, f"Directory not found: {expanded}")

    # Security: only allow absolute paths under common roots
    # (no restriction for now — this is a local dev tool)

    parent = os.path.dirname(expanded) if expanded != "/" else None

    entries = _list_dir(expanded, depth)
    return DirListing(path=expanded, parent=parent, entries=entries)


@router.get("/suggest", response_model=List[WorkspaceCandidate])
async def suggest_workspaces(
    path: str = Query("~", description="Root directory to scan"),
):
    """Find subdirectories that look like project workspaces."""
    expanded = os.path.expanduser(path)
    expanded = os.path.normpath(expanded)

    if not os.path.isdir(expanded):
        raise HTTPException(404, f"Directory not found: {expanded}")

    candidates = []
    for entry in sorted(os.listdir(expanded)):
        full = os.path.join(expanded, entry)
        if not os.path.isdir(full) or entry in SKIP_DIRS or entry.startswith("."):
            continue

        lang, reason = _detect_project_type(full)
        has_cog = os.path.isdir(os.path.join(full, ".cognition"))

        candidates.append(WorkspaceCandidate(
            path=full,
            name=entry,
            language=lang,
            has_cognition=has_cog,
            reason=reason,
        ))

    return candidates


@router.get("/home", response_model=str)
async def get_home_directory():
    """Return the server user's home directory path."""
    return os.path.expanduser("~")


@router.get("/common-roots", response_model=List[str])
async def get_common_roots():
    """Return common root directories for browsing."""
    roots = []
    home = os.path.expanduser("~")
    roots.append(home)
    if os.path.isdir("/root"):
        roots.append("/root")
    if os.path.isdir("/home"):
        for d in sorted(os.listdir("/home")):
            full = os.path.join("/home", d)
            if os.path.isdir(full) and full != home:
                roots.append(full)
    if os.path.isdir("/opt"):
        roots.append("/opt")
    if os.path.isdir("/srv"):
        roots.append("/srv")
    # Deduplicate while preserving order
    seen = set()
    result = []
    for r in roots:
        if r not in seen:
            seen.add(r)
            result.append(r)
    return result


# ---- Helpers ----

def _list_dir(dir_path: str, depth: int = 1) -> List[DirEntry]:
    """List directory entries, skipping uninteresting dirs."""
    entries = []
    try:
        items = sorted(os.listdir(dir_path))
    except PermissionError:
        return []

    for name in items:
        if name.startswith(".") and name not in (".cognition",):
            continue
        full = os.path.join(dir_path, name)
        is_dir = os.path.isdir(full)

        if is_dir and name in SKIP_DIRS:
            continue

        size = 0
        if not is_dir:
            try:
                size = os.path.getsize(full)
            except OSError:
                pass

        children = None
        if is_dir and depth > 1 and name not in SKIP_DIRS:
            children = _list_dir(full, depth - 1)

        entries.append(DirEntry(
            name=name,
            path=full,
            is_dir=is_dir,
            size=size,
            children=children,
        ))
    return entries


def _detect_project_type(dir_path: str) -> tuple[str, str]:
    """Heuristic: detect project language and reason."""
    files = set(os.listdir(dir_path)) if os.path.isdir(dir_path) else set()

    if "package.json" in files:
        return "typescript", "Found package.json"
    if "tsconfig.json" in files:
        return "typescript", "Found tsconfig.json"
    if "requirements.txt" in files or "pyproject.toml" in files:
        return "python", "Found requirements.txt/pyproject.toml"
    if "go.mod" in files:
        return "go", "Found go.mod"
    if "Cargo.toml" in files:
        return "rust", "Found Cargo.toml"
    if "pom.xml" in files:
        return "java", "Found pom.xml"
    if "Gemfile" in files:
        return "ruby", "Found Gemfile"

    # Check for common source dirs
    for src_dir in ("src", "lib", "app", "cmd"):
        if src_dir in files and os.path.isdir(os.path.join(dir_path, src_dir)):
            return "unknown", f"Has {src_dir}/ directory"

    return "unknown", ""


# ============================================================
# File/folder management: create, rename, delete
# ============================================================

class CreateRequest(BaseModel):
    parent_path: str
    name: str
    is_dir: bool = True

class RenameRequest(BaseModel):
    old_path: str
    new_name: str

class DeleteRequest(BaseModel):
    path: str


def _validate_path(p: str) -> str:
    """Expand, normalize, and validate a path."""
    expanded = os.path.normpath(os.path.expanduser(p))
    if not os.path.isabs(expanded):
        raise HTTPException(400, "Path must be absolute")
    return expanded


@router.post("/create")
async def create_entry(req: CreateRequest):
    """Create a new file or directory."""
    parent = _validate_path(req.parent_path)
    if not os.path.isdir(parent):
        raise HTTPException(404, f"Parent directory not found: {parent}")

    new_path = os.path.join(parent, req.name)
    if os.path.exists(new_path):
        raise HTTPException(409, f"'{req.name}' already exists")

    # Disallow names with path separators
    if os.sep in req.name or "/" in req.name:
        raise HTTPException(400, "Name must not contain path separators")

    try:
        if req.is_dir:
            os.makedirs(new_path)
        else:
            with open(new_path, "w") as f:
                f.write("")
    except OSError as e:
        raise HTTPException(500, f"Failed to create: {e}")

    return {"ok": True, "path": new_path, "name": req.name, "is_dir": req.is_dir}


@router.put("/rename")
async def rename_entry(req: RenameRequest):
    """Rename a file or directory."""
    old = _validate_path(req.old_path)
    if not os.path.exists(old):
        raise HTTPException(404, f"Path not found: {old}")

    # Disallow names with path separators
    if os.sep in req.new_name or "/" in req.new_name:
        raise HTTPException(400, "New name must not contain path separators")

    parent = os.path.dirname(old)
    new_path = os.path.join(parent, req.new_name)
    if os.path.exists(new_path):
        raise HTTPException(409, f"'{req.new_name}' already exists")

    try:
        os.rename(old, new_path)
    except OSError as e:
        raise HTTPException(500, f"Failed to rename: {e}")

    return {"ok": True, "old_path": old, "new_path": new_path, "new_name": req.new_name}


@router.delete("/delete")
async def delete_entry(req: DeleteRequest):
    """Delete a file or directory. Non-empty directories are rejected for safety."""
    target = _validate_path(req.path)
    if not os.path.exists(target):
        raise HTTPException(404, f"Path not found: {target}")

    is_dir = os.path.isdir(target)

    # Safety: do not allow deleting system-critical paths
    if target in ("/", "/root", "/home", "/tmp", "/opt", "/srv", "/var"):
        raise HTTPException(403, "Cannot delete system-critical path")

    try:
        if is_dir:
            # Check if non-empty
            contents = os.listdir(target)
            if contents:
                raise HTTPException(
                    409,
                    f"Directory is not empty ({len(contents)} items). "
                    "Please empty it first before deleting."
                )
            os.rmdir(target)
        else:
            os.remove(target)
    except HTTPException:
        raise
    except OSError as e:
        raise HTTPException(500, f"Failed to delete: {e}")

    return {"ok": True, "deleted": target, "was_dir": is_dir}


# ============================================================
# File tree + file content reading
# ============================================================

class TreeNode(BaseModel):
    name: str
    path: str
    type: str  # "file" | "directory"
    children: Optional[List["TreeNode"]] = None
    size: int = 0
    language: Optional[str] = None


class FileContent(BaseModel):
    path: str
    name: str
    content: str
    language: str
    size: int
    is_binary: bool = False
    truncated: bool = False


# Extensions to language mapping (for file content viewing)
_EXT_LANG_MAP = {
    ".ts": "typescript", ".tsx": "typescriptreact",
    ".js": "javascript", ".jsx": "javascriptreact",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".rb": "ruby", ".php": "php",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
    ".cs": "csharp", ".swift": "swift",
    ".vue": "vue", ".svelte": "svelte",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".sql": "sql", ".graphql": "graphql",
    ".yaml": "yaml", ".yml": "yaml", ".json": "json",
    ".toml": "ini", ".ini": "ini", ".cfg": "ini",
    ".md": "markdown", ".txt": "plaintext", ".log": "plaintext",
    ".html": "html", ".htm": "html", ".xml": "xml",
    ".css": "css", ".scss": "scss", ".less": "less",
    ".dockerfile": "dockerfile", ".proto": "protobuf",
    ".env": "ini", ".gitignore": "ini",
    ".Makefile": "makefile", ".makefile": "makefile",
}

# Binary extensions to skip
_BINARY_EXT = {
    ".exe", ".dll", ".so", ".dylib", ".o", ".a",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
    ".zip", ".tar", ".gz", ".bz2", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pyc", ".pyo", ".class", ".wasm",
    ".sqlite", ".db", ".mdb",
}

SKIP_TREE = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build",
             ".next", ".nuxt", ".cache", ".tox", ".mypy_cache", ".pytest_cache",
             "target", ".idea", ".vscode"}


@router.get("/tree")
async def get_file_tree(
    path: str = Query(..., description="Root directory for the tree"),
    max_depth: int = Query(4, description="Max recursion depth"),
):
    """Return a recursive file tree structure."""
    expanded = _validate_path(path)
    if not os.path.isdir(expanded):
        raise HTTPException(404, f"Directory not found: {expanded}")

    tree = _build_tree(expanded, 0, max_depth)
    return tree


@router.get("/file")
async def read_file_content(
    path: str = Query(..., description="File path to read"),
    max_size: int = Query(500000, description="Max file size in bytes (default 500KB)"),
):
    """Read and return file content with language detection."""
    expanded = _validate_path(path)
    if not os.path.exists(expanded):
        raise HTTPException(404, f"File not found: {expanded}")
    if os.path.isdir(expanded):
        raise HTTPException(400, "Path is a directory, not a file")

    size = os.path.getsize(expanded)
    ext = os.path.splitext(expanded)[1].lower()
    name = os.path.basename(expanded)

    # Binary check
    if ext in _BINARY_EXT:
        return FileContent(
            path=expanded, name=name, content="",
            language="binary", size=size, is_binary=True,
        )

    # Size check
    truncated = False
    try:
        with open(expanded, "r", encoding="utf-8", errors="replace") as f:
            if size > max_size:
                content = f.read(max_size)
                truncated = True
            else:
                content = f.read()
    except Exception as e:
        raise HTTPException(500, f"Failed to read file: {e}")

    # Language detection
    language = _EXT_LANG_MAP.get(ext, "plaintext")

    # Special: shebang detection
    if content.startswith("#!"):
        first_line = content.split("\n", 1)[0].lower()
        if "python" in first_line:
            language = "python"
        elif "bash" in first_line or "sh" in first_line:
            language = "shell"
        elif "node" in first_line:
            language = "javascript"

    return FileContent(
        path=expanded, name=name, content=content,
        language=language, size=size, is_binary=False, truncated=truncated,
    )


def _build_tree(dir_path: str, depth: int, max_depth: int) -> TreeNode:
    """Recursively build a tree node."""
    name = os.path.basename(dir_path) or dir_path
    children = []

    if depth < max_depth:
        try:
            entries = sorted(os.listdir(dir_path))
        except PermissionError:
            entries = []

        for entry in entries:
            if entry in SKIP_TREE or entry.startswith("."):
                continue
            full = os.path.join(dir_path, entry)
            if os.path.isdir(full):
                children.append(_build_tree(full, depth + 1, max_depth))
            else:
                ext = os.path.splitext(entry)[1].lower()
                size = 0
                try:
                    size = os.path.getsize(full)
                except OSError:
                    pass
                children.append(TreeNode(
                    name=entry,
                    path=full,
                    type="file",
                    size=size,
                    language=_EXT_LANG_MAP.get(ext, None),
                ))

    return TreeNode(
        name=name,
        path=dir_path,
        type="directory",
        children=children if children else None,
    )
