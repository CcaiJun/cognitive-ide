"""Pydantic models for API request/response schemas and database ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List as TypingList

from sqlalchemy import Column, String, Integer, Text, Float, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base


# ============================================================
# ORM Models (PostgreSQL)
# ============================================================

class ProjectModel(Base):
    """ORM model for projects table."""
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    language = Column(String, default="typescript")
    framework = Column(String, default="")
    project_path = Column(String, nullable=False, unique=True)
    cognition_version = Column(String, default="1.0")
    auto_analyze = Column(Boolean, default=True)
    ai_model = Column(String, default="gpt-4o")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cognition_nodes = relationship("CognitionNodeModel", back_populates="project", cascade="all, delete-orphan")
    symbol_entries = relationship("SymbolEntryModel", back_populates="project", cascade="all, delete-orphan")


class CognitionNodeModel(Base):
    """ORM model for cognition_nodes table."""
    __tablename__ = "cognition_nodes"

    id = Column(String, primary_key=True)  # e.g., "order-service"
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    file_path = Column(String, nullable=False)
    language = Column(String, default="typescript")
    lines = Column(Integer, default=0)
    module_type = Column(String, default="domain")  # domain, infrastructure, shared, external
    responsibility_summary = Column(Text, default="")
    responsibility_detail = Column(Text, default="")
    human_verified = Column(Boolean, default=False)
    verified_by = Column(String, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    health_score = Column(Float, default=0.0)
    risk_count = Column(Integer, default=0)
    test_coverage = Column(Float, default=0.0)
    status = Column(String, default="active")  # active, pending_review, analyzing, error
    last_analyzed_at = Column(DateTime, default=datetime.utcnow)
    analyzed_by = Column(String, default="")
    cognition_data = Column(JSON, default=dict)  # Full cognition YAML as JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("ProjectModel", back_populates="cognition_nodes")
    dependencies = relationship("DependencyEdgeModel", back_populates="source_node", foreign_keys="DependencyEdgeModel.source_id")
    dependents = relationship("DependencyEdgeModel", back_populates="target_node", foreign_keys="DependencyEdgeModel.target_id")
    risks = relationship("RiskModel", back_populates="node", cascade="all, delete-orphan")
    decisions = relationship("DecisionModel", back_populates="node", cascade="all, delete-orphan")


class DependencyEdgeModel(Base):
    """ORM model for dependency edges between cognition nodes."""
    __tablename__ = "dependency_edges"

    id = Column(String, primary_key=True)
    source_id = Column(String, ForeignKey("cognition_nodes.id"), nullable=False)
    target_id = Column(String, ForeignKey("cognition_nodes.id"), nullable=False)
    edge_type = Column(String, default="depends_on")  # depends_on, calls, inherits, data_flow, event_subscription
    label = Column(Text, default="")
    weight = Column(Integer, default=1)
    required = Column(Boolean, default=True)

    # Relationships
    source_node = relationship("CognitionNodeModel", back_populates="dependencies", foreign_keys=[source_id])
    target_node = relationship("CognitionNodeModel", back_populates="dependents", foreign_keys=[target_id])


class RiskModel(Base):
    """ORM model for risks associated with cognition nodes."""
    __tablename__ = "risks"

    id = Column(String, primary_key=True)  # e.g., "RISK-001"
    node_id = Column(String, ForeignKey("cognition_nodes.id"), nullable=False)
    level = Column(String, default="medium")  # low, medium, high
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    mitigation = Column(Text, default="")
    status = Column(String, default="open")  # open, mitigated, closed

    # Relationships
    node = relationship("CognitionNodeModel", back_populates="risks")


class DecisionModel(Base):
    """ORM model for design decisions associated with cognition nodes."""
    __tablename__ = "decisions"

    id = Column(String, primary_key=True)  # e.g., "DEC-001"
    node_id = Column(String, ForeignKey("cognition_nodes.id"), nullable=False)
    title = Column(String, nullable=False)
    context = Column(Text, default="")
    decision = Column(Text, default="")
    consequences = Column(Text, default="")
    linked_issue = Column(String, nullable=True)

    # Relationships
    node = relationship("CognitionNodeModel", back_populates="decisions")


class SymbolEntryModel(Base):
    """ORM model for the global symbol index."""
    __tablename__ = "symbol_entries"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False, index=True)
    symbol_type = Column(String, nullable=False)  # function, interface, class, type, variable
    node_id = Column(String, ForeignKey("cognition_nodes.id"), nullable=False)
    file = Column(String, nullable=False)
    line = Column(Integer, nullable=False)

    # Relationships
    project = relationship("ProjectModel", back_populates="symbol_entries")


class SettingModel(Base):
    """ORM model for application settings (key-value store)."""
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, default="")
    category = Column(String, default="general")  # general, ai_openai, ai_anthropic
    description = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIRequestModel(Base):
    """ORM model for tracking AI development requests."""
    __tablename__ = "ai_requests"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    target_node = Column(String, nullable=False)
    instruction = Column(Text, nullable=False)
    context_depth = Column(Integer, default=2)
    preferred_model = Column(String, default="")
    status = Column(String, default="pending")  # pending, cognition_draft_ready, code_ready, committed, error
    cognition_draft = Column(JSON, default=dict)
    code_changes = Column(JSON, default=list)
    impact_analysis = Column(JSON, default=dict)
    questions_for_human = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)