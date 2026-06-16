# Cognitive IDE

> 以「项目认知图谱」为核心的下一代开发环境

## 概述

Cognitive IDE 打破传统 IDE 以文件系统为中心的模式，构建以**项目认知图谱 (Project Cognition Graph)** 为核心的人机协作开发环境。代码、模块、接口、依赖、决策和风险以结构化方式共存，使人类开发者与 AI 代理共享同一套项目理解，实现真正的增量协作开发。

## 核心特性

- 🌌 **星系图谱视图** — 项目全局可视化，模块关系一目了然
- 🧠 **认知卡片** — 每个模块的职责、接口、依赖、风险、决策一览无遗
- 🔴 **影响半径** — 修改前预览影响范围，降低变更风险
- 🤖 **AI 协作** — 基于认知层的智能对话和代码生成
- 📊 **认知差异对比** — 先确认 AI 的理解，再决定是否接受代码变更
- 📝 **决策日志** — 设计决策与代码绑定，知识不再流失

## 架构

```
┌─────────────────────────────────────┐
│  Web 前端 (React + D3.js + Monaco)  │
│  三栏布局: 导航 | 图谱 | 认知卡片+AI  │
└──────────────┬──────────────────────┘
               │ WebSocket / HTTP
┌──────────────▼──────────────────────┐
│  后端服务层 (FastAPI / Python)       │
│  图谱引擎 | 分析器 | AI编排器 | 同步   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  数据层 (PostgreSQL + 内存图引擎)     │
└─────────────────────────────────────┘
```

## 快速开始

### 前置依赖

- Node.js 20+
- Python 3.11+
- PostgreSQL 16+
- Redis 7+ (可选)

### 使用 Docker Compose (推荐)

```bash
# 克隆项目
git clone <repo-url> cognitive-ide
cd cognitive-ide

# 一键启动所有服务
docker-compose up -d

# 访问
# 前端: http://localhost:3000
# 后端 API: http://localhost:8000/api/docs
```

### 手动启动

#### 1. 启动数据库

```bash
# 创建数据库
createdb cognitive_ide

# 或使用 Docker
docker run -d --name cogide-postgres \
  -e POSTGRES_USER=cogide -e POSTGRES_PASSWORD=cogide -e POSTGRES_DB=cognitive_ide \
  -p 5432:5432 postgres:16-alpine
```

#### 2. 启动后端

```bash
cd services/api-server

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -e ".[dev]"

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库连接和 AI API Key
export DATABASE_URL="postgresql+asyncpg://cogide:cogide@localhost:5432/cognitive_ide"

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 19000
```

#### 3. 启动前端

```bash
cd apps/web

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

#### 4. 访问

- 前端: http://localhost:3000 (开发模式可能为 3001)
- 后端 API 文档: http://localhost:19000/api/docs
- 后端健康检查: http://localhost:19000/api/v1/health

## 项目结构

```
cognitive-ide/
├── apps/
│   └── web/                    # React + Vite 前端
│       ├── src/
│       │   ├── components/     # UI 组件
│       │   │   ├── GalaxyGraph/ # 星系图谱
│       │   │   ├── CognitionCard/ # 认知卡片
│       │   │   ├── ImpactPreview/ # 影响半径
│       │   │   ├── CognitionDiff/ # 认知差异
│       │   │   ├── AIPanel/    # AI 协作面板
│       │   │   ├── CodeEditor/ # 代码编辑器
│       │   │   └── common/     # 通用组件
│       │   ├── stores/        # Zustand 状态管理
│       │   ├── lib/           # API/WebSocket 封装
│       │   ├── styles/        # 全局样式
│       │   └── types/        # TypeScript 类型
│       └── package.json
├── services/
│   └── api-server/             # FastAPI 后端
│       ├── routers/            # API 路由
│       ├── services/           # 业务逻辑
│       ├── models/             # 数据模型
│       ├── core/               # 配置、数据库
│       └── main.py
├── packages/
│   ├── shared-types/           # 前后端共享类型定义
│   ├── cognition-schema/       # 认知层 Schema
│   └── tree-sitter-parsers/    # 多语言 AST 解析
├── .cognition/                 # 项目认知层
├── docker-compose.yml
└── package.json
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript + Vite |
| 图谱渲染 | D3.js + Canvas 2D |
| 代码编辑 | Monaco Editor |
| 状态管理 | Zustand |
| 实时通信 | WebSocket (Socket.io) |
| 后端框架 | FastAPI (Python) |
| 图数据库 | 内存图 (NetworkX) |
| 关系数据库 | PostgreSQL (JSONB) |
| 代码分析 | Tree-sitter |
| AI 接口 | OpenAI + Anthropic 双通道 |

## AI 配置

在 `services/api-server/.env` 中配置：

```env
# OpenAI 兼容接口（支持 DeepSeek 等）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# Anthropic 接口
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

## 开发路线图

### Phase 1: MVP (当前) ✅
- [x] 项目架构搭建
- [x] 三栏布局 + 星系图谱视图
- [x] 认知卡片面板
- [x] 影响半径预览
- [x] AI 协作面板
- [x] 认知差异对比
- [x] 后端 API + 图谱引擎
- [x] Docker 部署

### Phase 2: 人机协作闭环
- [ ] 影响半径可视化增强
- [ ] 认知差异对比完善 + 人类确认流程
- [ ] AI 增量开发闭环（修改代码 + 同步认知层）

### Phase 3: 生产级强化
- [ ] 多语言支持 (Python, Go, Rust)
- [ ] 实时多用户协作
- [ ] 性能优化 (大项目 > 1000 文件)
- [ ] Git 深度集成 (认知快照、分支合并)

## License

MIT