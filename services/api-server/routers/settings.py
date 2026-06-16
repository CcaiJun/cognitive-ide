"""Settings router — CRUD for application settings (AI API keys, models, etc.)."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from core.database import get_db
from models.models import SettingModel

router = APIRouter()


# ---- Pydantic schemas ----

class SettingInput(BaseModel):
    key: str
    value: str
    category: str = "general"
    description: str = ""

class SettingOutput(BaseModel):
    key: str
    value: str
    category: str
    description: str
    updated_at: Optional[str] = None

class AISettingsInput(BaseModel):
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    anthropic_model: Optional[str] = None
    preferred_provider: Optional[str] = None

class AISettingsOutput(BaseModel):
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    preferred_provider: str = "auto"
    has_openai: bool = False
    has_anthropic: bool = False


# ---- Helpers ----

AI_SETTING_KEYS = {
    "openai_api_key": ("ai_openai", "OpenAI API Key"),
    "openai_base_url": ("ai_openai", "OpenAI Base URL"),
    "openai_model": ("ai_openai", "OpenAI Model"),
    "anthropic_api_key": ("ai_anthropic", "Anthropic API Key"),
    "anthropic_model": ("ai_anthropic", "Anthropic Model"),
    "preferred_provider": ("ai_general", "Preferred AI Provider"),
}

DEFAULTS = {
    "openai_base_url": "https://api.openai.com/v1",
    "openai_model": "gpt-4o",
    "anthropic_model": "claude-sonnet-4-20250514",
    "preferred_provider": "auto",
}


async def _get_setting(db: AsyncSession, key: str) -> Optional[str]:
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalars().first()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str, category: str, description: str = ""):
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalars().first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        db.add(SettingModel(key=key, value=value, category=category, description=description))
    await db.commit()


async def get_ai_settings(db: AsyncSession) -> dict:
    """Load all AI settings from DB, falling back to env/defaults."""
    from core.config import settings as env_settings
    result = {}
    for key, (cat, desc) in AI_SETTING_KEYS.items():
        val = await _get_setting(db, key)
        if val is None:
            env_val = getattr(env_settings, key, None)
            result[key] = env_val if env_val else DEFAULTS.get(key, "")
        else:
            result[key] = val
    result["has_openai"] = bool(result.get("openai_api_key"))
    result["has_anthropic"] = bool(result.get("anthropic_api_key"))
    return result


def _mask_keys(data: dict) -> dict:
    """Mask API keys for display."""
    out = dict(data)
    for k in ("openai_api_key", "anthropic_api_key"):
        v = out.get(k, "")
        if v and len(v) > 8:
            out[k] = v[:4] + "****" + v[-4:]
        elif v:
            out[k] = "****"
    return out


# ==== AI-specific convenience endpoints (MUST come before /{key}) ====

@router.get("/ai", response_model=AISettingsOutput)
async def get_ai_settings_endpoint(db: AsyncSession = Depends(get_db)):
    """Get all AI-related settings (keys partially masked for security)."""
    data = await get_ai_settings(db)
    return AISettingsOutput(**_mask_keys(data))


@router.put("/ai", response_model=AISettingsOutput)
async def update_ai_settings(body: AISettingsInput, db: AsyncSession = Depends(get_db)):
    """Bulk update AI settings. Only non-None fields are updated."""
    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        if key not in AI_SETTING_KEYS:
            continue
        cat, desc = AI_SETTING_KEYS[key]
        await _set_setting(db, key, value, cat, desc)

    from services.ai_orchestrator import ai_orchestrator
    ai_orchestrator.reset_clients()

    data = await get_ai_settings(db)
    return AISettingsOutput(**_mask_keys(data))


@router.post("/ai/test")
async def test_ai_connection(db: AsyncSession = Depends(get_db)):
    """Test AI connectivity with current settings."""
    from services.ai_orchestrator import ai_orchestrator
    await ai_orchestrator.reload_settings(db)

    results = {}
    if ai_orchestrator._get_openai_client():
        try:
            client = ai_orchestrator._get_openai_client()
            await client.models.list(limit=1)
            results["openai"] = {"ok": True, "message": "Connected successfully"}
        except Exception as e:
            results["openai"] = {"ok": False, "message": str(e)[:200]}
    else:
        results["openai"] = {"ok": False, "message": "No API key configured"}

    if ai_orchestrator._get_anthropic_client():
        try:
            results["anthropic"] = {"ok": True, "message": "Client initialized"}
        except Exception as e:
            results["anthropic"] = {"ok": False, "message": str(e)[:200]}
    else:
        results["anthropic"] = {"ok": False, "message": "No API key configured"}

    return results


# ==== Generic CRUD endpoints ====

@router.get("/", response_model=List[SettingOutput])
async def list_settings(category: str = "", db: AsyncSession = Depends(get_db)):
    """List all settings, optionally filtered by category."""
    stmt = select(SettingModel)
    if category:
        stmt = stmt.where(SettingModel.category == category)
    stmt = stmt.order_by(SettingModel.category, SettingModel.key)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        SettingOutput(
            key=r.key, value=r.value, category=r.category,
            description=r.description,
            updated_at=r.updated_at.isoformat() if r.updated_at else None,
        )
        for r in rows
    ]


@router.put("/{key}")
async def update_setting(key: str, body: SettingInput, db: AsyncSession = Depends(get_db)):
    """Create or update a single setting."""
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalars().first()
    if row:
        row.value = body.value
        row.category = body.category
        row.description = body.description
        row.updated_at = datetime.utcnow()
    else:
        db.add(SettingModel(key=key, value=body.value, category=body.category, description=body.description))
    await db.commit()
    return {"ok": True, "key": key}


@router.delete("/{key}")
async def delete_setting(key: str, db: AsyncSession = Depends(get_db)):
    """Delete a setting."""
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    row = result.scalars().first()
    if not row:
        raise HTTPException(404, f"Setting '{key}' not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
