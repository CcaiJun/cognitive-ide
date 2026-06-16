"""AI Orchestrator — context assembly, LLM routing (OpenAI + Anthropic), response parsing.

Integrates with cognition_layer for reading/writing cognition data.
"""

from __future__ import annotations

import json
import uuid
import re
from typing import Dict, List, Optional, AsyncGenerator

from core.config import settings
from schemas.cognition import (
    CognitionDraftSchema,
    CodeChangeSchema,
    ImpactAnalysisSchema,
    AIResponseSchema,
    Complexity,
)


class AIOrchestrator:
    """Orchestrate AI requests: assemble context, route to LLM, parse responses."""

    def __init__(self):
        self._openai_client = None
        self._anthropic_client = None
        # DB-loaded settings (override env when present)
        self._db_openai_api_key: Optional[str] = None
        self._db_openai_base_url: Optional[str] = None
        self._db_openai_model: Optional[str] = None
        self._db_anthropic_api_key: Optional[str] = None
        self._db_anthropic_model: Optional[str] = None
        self._db_preferred_provider: Optional[str] = None

    @property
    def _openai_key(self) -> str:
        return self._db_openai_api_key or settings.openai_api_key

    @property
    def _openai_url(self) -> str:
        return self._db_openai_base_url or settings.openai_base_url

    @property
    def _openai_mdl(self) -> str:
        return self._db_openai_model or settings.openai_model

    @property
    def _anthropic_key(self) -> str:
        return self._db_anthropic_api_key or settings.anthropic_api_key

    @property
    def _anthropic_mdl(self) -> str:
        return self._db_anthropic_model or settings.anthropic_model

    def _get_openai_client(self):
        key = self._openai_key
        if self._openai_client is None and key:
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(
                api_key=key,
                base_url=self._openai_url,
            )
        return self._openai_client

    def _get_anthropic_client(self):
        key = self._anthropic_key
        if self._anthropic_client is None and key:
            from anthropic import AsyncAnthropic
            self._anthropic_client = AsyncAnthropic(
                api_key=key,
            )
        return self._anthropic_client

    @property
    def has_llm(self) -> bool:
        """Check if any LLM client is available."""
        return bool(self._openai_key or self._anthropic_key)

    def reset_clients(self):
        """Reset cached clients so next call picks up new settings."""
        self._openai_client = None
        self._anthropic_client = None

    async def reload_settings(self, db):
        """Load AI settings from DB, falling back to env."""
        from routers.settings import get_ai_settings
        data = await get_ai_settings(db)
        self._db_openai_api_key = data.get("openai_api_key") or None
        self._db_openai_base_url = data.get("openai_base_url") or None
        self._db_openai_model = data.get("openai_model") or None
        self._db_anthropic_api_key = data.get("anthropic_api_key") or None
        self._db_anthropic_model = data.get("anthropic_model") or None
        self._db_preferred_provider = data.get("preferred_provider") or None
        self.reset_clients()

    # ------------------------------------------------------------------
    # Context assembly
    # ------------------------------------------------------------------

    async def assemble_context(
        self,
        target_node: str,
        instruction: str,
        impact: Optional[dict] = None,
        db=None,
        project_path: Optional[str] = None,
    ) -> dict:
        """Assemble a structured context package for the AI model."""
        context = {
            "architecture": {
                "project_description": "",
                "module_boundaries": [],
                "tech_stack": [],
            },
            "target": {
                "node_id": target_node,
                "cognition": {},
                "implementation": "",
            },
            "dependencies": [],
            "impact_radius": impact,
            "instruction": instruction,
        }

        # Load from .cognition/ if project_path is available
        if project_path:
            from cognition_layer.reader import CognitionReader
            reader = CognitionReader(project_path)

            config = reader.load_project_config()
            if config:
                context["architecture"]["project_description"] = config.description
                context["architecture"]["module_boundaries"] = [
                    {"name": m.name, "path": m.path, "type": m.type}
                    for m in config.modules
                ]
                context["architecture"]["tech_stack"] = [config.language, config.framework]

            node = reader.load_cognition_node(target_node)
            if node:
                context["target"]["cognition"] = {
                    "responsibility": node.responsibility.summary,
                    "interfaces": [
                        {"name": i.name, "signature": i.signature, "complexity": i.complexity}
                        for i in node.interfaces
                    ],
                    "dependencies": [
                        {"node_id": d.node_id, "used_for": d.used_for}
                        for d in node.dependencies
                    ],
                    "risks": [
                        {"id": r.id, "level": r.level, "title": r.title}
                        for r in node.risks
                    ],
                }
                # Load source code
                import os
                abs_path = os.path.join(project_path, node.file_path)
                if os.path.isfile(abs_path):
                    try:
                        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                        context["target"]["implementation"] = content[:8000]  # Cap at 8K chars
                    except Exception:
                        pass

        # Fallback: load from DB
        elif db:
            from sqlalchemy import select
            from models.models import CognitionNodeModel
            result = await db.execute(
                select(CognitionNodeModel).where(CognitionNodeModel.id == target_node)
            )
            node_model = result.scalars().first()
            if node_model:
                context["target"]["cognition"] = node_model.cognition_data or {}
                import os
                if node_model.file_path and os.path.exists(node_model.file_path):
                    try:
                        with open(node_model.file_path, "r", encoding="utf-8", errors="ignore") as f:
                            context["target"]["implementation"] = f.read()[:8000]
                    except Exception:
                        pass

                from models.models import ProjectModel
                proj_result = await db.execute(
                    select(ProjectModel).where(ProjectModel.id == node_model.project_id)
                )
                proj = proj_result.scalars().first()
                if proj:
                    context["architecture"]["project_description"] = proj.description
                    context["architecture"]["tech_stack"] = [proj.language, proj.framework]

        # Add impact-related dependencies
        if impact:
            for dep in impact.get("direct", []):
                context["dependencies"].append({
                    "node_id": dep.get("node_id", ""),
                    "reason": dep.get("reason", ""),
                })
            for dep in impact.get("indirect", []):
                context["dependencies"].append({
                    "node_id": dep.get("node_id", ""),
                    "reason": dep.get("reason", ""),
                    "indirect": True,
                })

        return context

    # ------------------------------------------------------------------
    # Cognition draft generation
    # ------------------------------------------------------------------

    async def generate_cognition_draft(
        self,
        context: dict,
        preferred_model: Optional[str] = None,
    ) -> dict:
        """Generate a cognition draft using the AI model."""
        model = preferred_model or settings.openai_model
        system_prompt = self._build_system_prompt("cognition_draft")
        user_prompt = self._build_cognition_draft_prompt(context)

        response_text = await self._call_llm(system_prompt, user_prompt, model)

        try:
            result = json.loads(response_text)
        except json.JSONDecodeError:
            json_match = re.search(r'```(?:json)?\s*\n(.*?)\n```', response_text, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    result = self._wrap_text_as_question(response_text)
            else:
                result = self._wrap_text_as_question(response_text)

        return result

    # ------------------------------------------------------------------
    # Execute approved changes
    # ------------------------------------------------------------------

    async def execute_changes(
        self,
        ai_request,
        cognition_modifications: dict = {},
        commit_message: str = "",
        project_path: Optional[str] = None,
    ) -> dict:
        """Execute approved changes: write code, update cognition, commit."""
        files_changed = []

        # Apply code changes
        code_changes = ai_request.code_changes or []
        for change in code_changes:
            file_path = change.get("file_path", "")
            operation = change.get("operation", "modify")
            diff = change.get("diff", "")

            if project_path:
                import os
                abs_path = os.path.join(project_path, file_path)

                if operation == "create":
                    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                    with open(abs_path, "w", encoding="utf-8") as f:
                        f.write(diff)
                    files_changed.append(file_path)

                elif operation == "modify" and os.path.exists(abs_path):
                    with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                        current = f.read()
                    # For MVP: full content replacement
                    # TODO: implement proper unified diff application
                    with open(abs_path, "w", encoding="utf-8") as f:
                        f.write(diff)
                    files_changed.append(file_path)

                elif operation == "delete" and os.path.exists(abs_path):
                    os.remove(abs_path)
                    files_changed.append(file_path)

        # Update cognition layer YAML files
        if project_path and ai_request.cognition_draft:
            from cognition_layer.writer import CognitionWriter
            writer = CognitionWriter(project_path)

            target_node = ai_request.target_node
            draft = ai_request.cognition_draft

            # Merge cognition modifications if provided
            if cognition_modifications:
                draft = self._deep_merge(draft, cognition_modifications)

            # Update the cognition node with draft changes
            updates = {}
            if draft.get("responsibility_change"):
                updates["responsibility"] = {"summary": draft["responsibility_change"]}
            if draft.get("interfaces_added"):
                updates["interfaces_added"] = draft["interfaces_added"]
            if draft.get("risks_added"):
                updates["risks"] = draft["risks_added"]
            if draft.get("decisions_added"):
                updates["decisions"] = draft["decisions_added"]

            if updates:
                writer.update_cognition_node(target_node, updates)

        # Git commit
        commit_hash = ""
        if project_path:
            try:
                import git
                repo = git.Repo(project_path)
                if files_changed:
                    for f in files_changed:
                        repo.index.add([f])
                    # Also add .cognition/ changes
                    cog_dir = project_path + "/.cognition"
                    import os
                    if os.path.exists(cog_dir):
                        repo.index.add([cog_dir])
                    commit = repo.index.commit(commit_message or "feat: AI-generated changes via Cognitive IDE")
                    commit_hash = commit.hexsha[:12]
            except Exception as e:
                print(f"Git commit failed: {e}")
                commit_hash = "no-git-" + uuid.uuid4().hex[:8]
        else:
            commit_hash = "mock-" + uuid.uuid4().hex[:8]

        return {
            "commit_hash": commit_hash,
            "files_changed": files_changed,
        }

    # ------------------------------------------------------------------
    # Chat interface
    # ------------------------------------------------------------------

    async def chat(
        self,
        message: str,
        node_id: str = "",
        project_id: str = "",
        preferred_model: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> str:
        """Chat interface for the AI collaboration panel."""
        system_prompt = self._build_system_prompt("chat")
        context_info = ""

        if node_id and project_path:
            from cognition_layer.reader import CognitionReader
            reader = CognitionReader(project_path)
            node = reader.load_cognition_node(node_id)
            if node:
                context_info += f"\n当前查看节点: {node_id}\n"
                context_info += f"职责: {node.responsibility.summary}\n"
                context_info += f"接口: {', '.join(i.name for i in node.interfaces[:5])}\n"
                context_info += f"依赖: {', '.join(d.node_id for d in node.dependencies[:5])}\n"
                context_info += f"风险: {', '.join(r.title for r in node.risks[:3])}\n"

        if project_id:
            context_info += f"\n项目: {project_id}\n"

        user_prompt = f"{context_info}\n用户: {message}"
        model = preferred_model or settings.openai_model
        return await self._call_llm(system_prompt, user_prompt, model, max_tokens=2000)

    async def stream_chat(
        self,
        message: str,
        project_id: str = "",
        preferred_model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream AI chat responses token by token."""
        system_prompt = self._build_system_prompt("chat")
        model = preferred_model or settings.openai_model

        client = self._get_openai_client()
        if client:
            try:
                stream = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message},
                    ],
                    stream=True,
                    max_tokens=2000,
                )
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                return
            except Exception:
                pass

        # Fallback: non-streaming chunked
        response = await self._call_llm(system_prompt, message, model)
        chunk_size = 20
        for i in range(0, len(response), chunk_size):
            yield response[i:i + chunk_size]

    # ------------------------------------------------------------------
    # LLM call with fallback chain
    # ------------------------------------------------------------------

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str = "",
        max_tokens: int = 4000,
    ) -> str:
        """Call an LLM: OpenAI → Anthropic → Mock."""
        # Try OpenAI
        client = self._get_openai_client()
        if client:
            try:
                response = await client.chat.completions.create(
                    model=model or settings.openai_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=max_tokens,
                    temperature=0.3,
                )
                return response.choices[0].message.content
            except Exception as e:
                print(f"[AIOrchestrator] OpenAI call failed: {e}")

        # Try Anthropic
        anthropic = self._get_anthropic_client()
        if anthropic:
            try:
                response = await anthropic.messages.create(
                    model=settings.anthropic_model,
                    max_tokens=max_tokens,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                return response.content[0].text
            except Exception as e:
                print(f"[AIOrchestrator] Anthropic call failed: {e}")

        # Mock fallback
        return self._mock_response(user_prompt)

    # ------------------------------------------------------------------
    # Mock responses
    # ------------------------------------------------------------------

    def _mock_response(self, prompt: str) -> str:
        """Generate a mock response when no LLM is available."""
        # Detect if this is a cognition draft request or chat
        if "instruction" in prompt.lower() or "implement" in prompt.lower():
            return json.dumps({
                "cognition_draft": {
                    "responsibility_change": "",
                    "interfaces_added": [
                        {
                            "name": "new_function",
                            "signature": "async new_function(): Promise<void>",
                            "access": "public",
                            "side_effects": [],
                            "callers": [],
                            "preconditions": [],
                            "complexity": "low",
                        }
                    ],
                    "interfaces_modified": [],
                    "interfaces_removed": [],
                    "dependencies_added": [],
                    "dependencies_removed": [],
                    "risks_added": [
                        {
                            "id": "RISK-MOCK",
                            "level": "low",
                            "title": "Mock模式 — 需要配置LLM API Key",
                            "description": "当前为Mock响应，请在.env中配置OPENAI_API_KEY或ANTHROPIC_API_KEY",
                            "mitigation": "配置API Key后重新请求",
                            "status": "open",
                        }
                    ],
                    "decisions_added": [],
                },
                "impact_analysis": {
                    "affected_modules": [],
                    "affected_tests": [],
                    "new_risks": [],
                    "estimated_complexity": "low",
                },
                "questions_for_human": [
                    "⚠️ Mock模式：未检测到LLM API Key。请在 .env 文件中配置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY。",
                    "您希望实现什么功能？请描述具体需求，配置API Key后AI将生成完整的认知草稿和代码变更。",
                ],
            })
        else:
            return (
                "⚠️ **Mock模式**：未检测到LLM API Key。\n\n"
                "请在 `.env` 文件中配置以下任一密钥：\n"
                "- `OPENAI_API_KEY` — 使用OpenAI兼容接口\n"
                "- `ANTHROPIC_API_KEY` — 使用Claude接口\n\n"
                "配置完成后，AI将能为您提供：\n"
                "1. 认知草稿生成（接口变更、依赖分析、风险评估）\n"
                "2. 代码变更建议（基于认知图谱的上下文感知）\n"
                "3. 项目架构问答（基于认知层数据的深度理解）\n\n"
                f"您的问题：{prompt[:100]}..."
            )

    # ------------------------------------------------------------------
    # Prompt builders
    # ------------------------------------------------------------------

    def _build_system_prompt(self, task: str) -> str:
        base = (
            "你是 Cognitive IDE 的 AI 助手，一个以项目认知图谱为核心的开发环境。\n"
            "你帮助开发者理解代码、分析影响、实现变更，同时维护认知层数据。\n\n"
            "核心概念：\n"
            "- 认知节点：每个模块/文件的认知数据（职责、接口、依赖、风险、决策）\n"
            "- 影响半径：变更影响的传播范围（直接+间接依赖）\n"
            "- 认知草稿：AI生成的变更计划，需人类审核后执行\n\n"
        )

        if task == "cognition_draft":
            return base + (
                "当被要求实现变更时，你必须返回JSON对象：\n"
                "{\n"
                '  "cognition_draft": {\n'
                '    "responsibility_change": "职责变更描述",\n'
                '    "interfaces_added": [{"name":"...", "signature":"...", "access":"public", "complexity":"medium"}],\n'
                '    "interfaces_modified": [],\n'
                '    "interfaces_removed": [],\n'
                '    "dependencies_added": [{"node_id":"...", "interface_file":"...", "used_for":"..."}],\n'
                '    "dependencies_removed": [],\n'
                '    "risks_added": [{"id":"RISK-...", "level":"medium", "title":"...", "description":"..."}],\n'
                '    "decisions_added": [{"id":"DEC-...", "title":"...", "context":"...", "decision":"...", "consequences":"..."}]\n'
                "  },\n"
                '  "impact_analysis": {\n'
                '    "affected_modules": [],\n'
                '    "affected_tests": [],\n'
                '    "new_risks": [],\n'
                '    "estimated_complexity": "medium"\n'
                "  },\n"
                '  "questions_for_human": ["需要确认的问题"]\n'
                "}\n\n"
                "注意：返回纯JSON，不要用markdown代码块包裹。"
            )
        elif task == "chat":
            return base + (
                "根据提供的认知数据回答关于项目的问题。\n"
                "要求：简洁、技术准确、有洞察力。如果不确定请说明。\n"
                "使用中文回答。"
            )
        return base

    def _build_cognition_draft_prompt(self, context: dict) -> str:
        """Build a user prompt for cognition draft generation."""
        target = context.get("target", {})
        instruction = context.get("instruction", "")
        impact = context.get("impact_radius", {})

        prompt = f"## 变更请求\n\n目标节点: {target.get('node_id', 'unknown')}\n"
        prompt += f"指令: {instruction}\n\n"

        if target.get("cognition"):
            cog = target["cognition"]
            prompt += f"## 当前认知\n\n"
            prompt += f"职责: {cog.get('responsibility', 'N/A')}\n"
            if cog.get("interfaces"):
                prompt += "接口:\n"
                for iface in cog["interfaces"][:10]:
                    prompt += f"  - {iface.get('name', '')}: {iface.get('signature', '')} ({iface.get('complexity', '')})\n"
            if cog.get("dependencies"):
                prompt += "依赖:\n"
                for dep in cog["dependencies"][:10]:
                    prompt += f"  - {dep.get('node_id', '')}: {dep.get('used_for', '')}\n"
            if cog.get("risks"):
                prompt += "风险:\n"
                for risk in cog["risks"][:5]:
                    prompt += f"  - [{risk.get('level', '')}] {risk.get('title', '')}\n"

        if impact:
            prompt += f"\n## 影响半径\n\n"
            for dep in impact.get("direct", []):
                prompt += f"直接影响: {dep.get('node_id', '')} - {dep.get('reason', '')}\n"
            for dep in impact.get("indirect", []):
                prompt += f"间接影响: {dep.get('node_id', '')} - {dep.get('reason', '')}\n"

        if target.get("implementation"):
            prompt += f"\n## 当前实现（前200行）\n\n```\n{target['implementation'][:3000]}\n```\n"

        prompt += "\n请生成认知草稿和影响分析。"
        return prompt

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _wrap_text_as_question(self, text: str) -> dict:
        """Wrap non-JSON text as a question_for_human entry."""
        return {
            "cognition_draft": {
                "responsibility_change": "",
                "interfaces_added": [],
                "interfaces_modified": [],
                "interfaces_removed": [],
                "dependencies_added": [],
                "dependencies_removed": [],
                "risks_added": [],
                "decisions_added": [],
            },
            "impact_analysis": {
                "affected_modules": [],
                "affected_tests": [],
                "new_risks": [],
                "estimated_complexity": "medium",
            },
            "questions_for_human": [text[:2000]],
        }

    def _deep_merge(self, base: dict, override: dict) -> dict:
        result = base.copy()
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            elif key in result and isinstance(result[key], list) and isinstance(value, list):
                result[key] = result[key] + value
            else:
                result[key] = value
        return result


# Singleton instance
ai_orchestrator = AIOrchestrator()