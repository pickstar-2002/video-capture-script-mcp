# 🎥 Video MCP Server

[![npm version](https://img.shields.io/npm/v/video-mcp.svg)](https://www.npmjs.com/package/video-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

一个基于 **MCP (Model Context Protocol)** 协议的智能视频处理服务器，集成腾讯云混元大模型的多模态理解能力，为您的 AI 应用提供强大的视频分析功能。

## ✨ 功能特性

### � 视频处理
- **🔍 智能帧提取**: 从视频中自动提取关键帧，支持多种采样策略
- **📊 多种策略**: 均匀采样、关键帧检测、场景变化检测
- **🎞️ 格式支持**: 支持主流视频格式 (MP4, AVI, MOV, MKV 等)
- **⚡ 高效处理**: 基于 FFmpeg 的高性能视频解码

### 🤖 AI 分析
- **🧠 腾讯混元多模态**: 集成混元 Vision 模型进行深度图像理解
- **💰 成本控制**: 智能帧数限制，避免 API 过度调用
- **🚀 批量处理**: 单次请求分析多帧，优化性能表现
- **📝 智能描述**: 生成详细的视频内容描述和分析报告

### ⚙️ 技术特性
- **🔌 MCP 协议**: 完全遵循 MCP 规范，与支持 MCP 的客户端无缝集成
- **📘 TypeScript**: 类型安全的开发体验，减少运行时错误
- **🏗️ 模块化设计**: 清晰的代码结构，便于维护和功能扩展
- **🛡️ 错误处理**: 完善的异常处理和资源清理机制

## 🚀 快速开始

### 系统要求

- **Node.js** 18.0.0 或更高版本
- **FFmpeg** (视频处理依赖)
- **腾讯云账号** (用于 AI 分析功能)

### 📦 安装

#### 作为 MCP 服务器使用 (推荐)

在支持 MCP 的客户端中配置此服务器：

```json
{
  "mcpServers": {
    "video-mcp": {
      "command": "npx",
      "args": ["video-mcp@latest"]
    }
  }
}
```

#### 本地开发安装

```bash
# 克隆仓库
git clone https://github.com/pickstar-2002/video-mcp.git
cd video-mcp

# 安装依赖
npm install

# 构建项目
npm run build

# 启动服务
npm start
```

### 🔧 环境配置

创建 `.env` 文件配置腾讯云凭证：

```env
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
TENCENT_REGION=ap-beijing
```

## 💡 使用方法

### 在 Claude Desktop 中使用

1. **安装配置**

在 Claude Desktop 的配置文件中添加：

```json
{
  "mcpServers": {
    "video-mcp": {
      "command": "npx",
      "args": ["video-mcp@latest"],
      "env": {
        "TENCENT_SECRET_ID": "your_secret_id",
        "TENCENT_SECRET_KEY": "your_secret_key"
      }
    }
  }
}
```

2. **重启 Claude Desktop** 以加载 MCP 服务器

3. **开始使用** 🎉

现在您可以在对话中直接使用视频分析功能：

```
请分析这个视频文件的内容：/path/to/your/video.mp4
```

### 在其他 MCP 客户端中使用

此服务器与所有兼容 MCP 协议的客户端配合使用。只需按照客户端的 MCP 服务器配置说明添加本服务器即可。

## 🛠️ 可用工具

| 工具名称 | 功能描述 | 主要参数 |
|---------|---------|---------|
| `extract_video_frames` | 从视频中提取关键帧 | `videoPath`, `maxFrames`, `strategy` |
| `analyze_video_with_ai` | 使用 AI 分析视频内容 | `videoPath`, `prompt`, `maxFrames` |
| `get_video_info` | 获取视频基本信息 | `videoPath` |

### 使用示例

```typescript
// 提取视频帧
const frames = await extractVideoFrames({
  videoPath: '/path/to/video.mp4',
  maxFrames: 10,
  strategy: 'uniform'
});

// AI 分析视频
const analysis = await analyzeVideoWithAI({
  videoPath: '/path/to/video.mp4',
  prompt: '描述视频中的主要内容和场景',
  maxFrames: 5
});
```

## 🔧 开发

### 本地开发

```bash
# 开发模式启动
npm run dev

# 代码检查
npm run lint

# 代码格式化
npm run format

# 清理构建文件
npm run clean
```

### 目录结构

```
video-mcp/
├── 📁 src/
│   ├── 📄 index.ts           # 主服务入口
│   ├── 📄 frame-extractor.ts # 帧提取模块
│   ├── 📄 hunyuan-client.ts  # 腾讯云AI客户端
│   └── 📄 video-processor.ts # 视频处理模块
├── 📁 dist/                  # 构建输出
├── 📄 package.json
├── 📄 tsconfig.json
└── 📄 README.md
```

## ⚠️ 注意事项

- **API 配额**: 请注意腾讯云 API 的调用配额和费用
- **文件大小**: 建议视频文件不超过 100MB 以确保处理效率
- **格式支持**: 确保 FFmpeg 支持您要处理的视频格式
- **网络环境**: 需要稳定的网络连接以访问腾讯云服务

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. 🍴 Fork 本仓库
2. 🌿 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 💾 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 📤 推送到分支 (`git push origin feature/AmazingFeature`)
5. 🔀 创建 Pull Request

## 🐛 问题反馈

如果您遇到任何问题，请通过以下方式联系：

- 📋 [创建 Issue](https://github.com/pickstar-2002/video-mcp/issues)
- 💬 微信: pickstar_loveXX

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议发布。

## 👨‍💻 作者

**pickstar-2002**

---

<div align="center">

**⭐ 如果这个项目对您有帮助，请给它一个星标！**

Made with ❤️ by [pickstar-2002](https://github.com/pickstar-2002)

微信: pickstar_loveXX

</div>
