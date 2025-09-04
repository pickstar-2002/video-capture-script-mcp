# 🎬 热门视频拍摄脚本MCP

[![npm version](https://img.shields.io/npm/v/@pickstar-2002/video-mcp.svg)](https://www.npmjs.com/package/@pickstar-2002/video-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> 🚀 基于 Model Context Protocol (MCP) 的智能视频处理工具，专注于热门视频分析和AI驱动的专业拍摄脚本生成

## ✨ 简介

热门视频拍摄脚本MCP 是一个专业的视频分析和脚本生成工具，通过 MCP 协议为 AI 助手提供强大的视频处理能力。它可以从热门视频中提取关键帧，使用腾讯混元多模态 API 进行智能内容分析，并生成专业的拍摄脚本，帮助创作者快速理解视频内容并制作类似的热门内容。

## 🎯 主要功能

- 🖼️ **智能帧提取**: 支持多种策略提取视频关键帧
  - 均匀间隔提取 (uniform)
  - 关键帧提取 (keyframe) 
  - 场景变化检测 (scene_change)
- 🤖 **AI 内容分析**: 集成腾讯混元多模态 API，智能分析视频内容
- 🎬 **拍摄脚本生成**: 基于视频分析结果，AI生成专业拍摄脚本
  - 支持多种脚本类型：商业广告、纪录片、教学视频、叙事视频
  - 自定义目标受众、拍摄风格、时长要求
  - 专业分镜脚本格式，包含镜头描述、拍摄要点
- 📊 **批量处理**: 支持批量分析多张图片
- 🖼️ **图片脚本生成**: 基于批量图片内容生成专业拍摄脚本
  - 智能分析多张图片的内容和关联性
  - 生成基于图片素材的拍摄指导脚本
  - 提供图片素材利用建议和拍摄要点
- 📹 **视频信息获取**: 获取视频文件的详细元数据信息
- 🔧 **灵活配置**: 可自定义提取帧数、输出目录等参数

## 📦 安装

### 作为 MCP 服务使用（推荐）

在支持 MCP 的 IDE 或工具中配置：

```json
{
  "mcpServers": {
    "video-capture-script-mcp": {
      "command": "npx",
      "args": ["@pickstar-2002/video-mcp@latest"],
      "env": {
        "TENCENT_SECRET_ID": "your_secret_id_here",
        "TENCENT_SECRET_KEY": "your_secret_key_here",
        "TENCENT_REGION": "ap-beijing"
      }
    }
  }
}
```

### 本地开发安装

```bash
# 克隆仓库
git clone https://github.com/pickstar-2002/video-capture-script-mcp.git
cd video-capture-script-mcp

# 安装依赖
npm install

# 构建项目
npm run build

# 运行测试
npm test
```

## 🚀 用法说明

### 在 Claude Desktop 中使用

1. 打开 Claude Desktop 配置文件：
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. 添加 MCP 服务配置：

```json
{
  "mcpServers": {
    "video-capture-script-mcp": {
      "command": "npx",
      "args": ["@pickstar-2002/video-mcp@latest"]
    }
  }
}
```

3. 重启 Claude Desktop

### 在其他 MCP 兼容工具中使用

确保工具支持 MCP 协议，然后使用相同的配置方式：

```bash
npx @pickstar-2002/video-mcp@latest
```

### 可用工具

#### 🖼️ extract_video_frames
从视频中提取关键帧图像

```typescript
// 参数示例
{
  "videoPath": "path/to/video.mp4",
  "maxFrames": 10,
  "outputDir": "output/frames",
  "strategy": "keyframe"
}
```

#### 🤖 analyze_video_content
使用腾讯混元 API 分析视频内容

```typescript
// 参数示例
{
  "videoPath": "path/to/video.mp4",
  "prompt": "请描述视频的主要内容",
  "maxFrames": 5,
  "secretId": "your-secret-id",
  "secretKey": "your-secret-key"
}
```

#### 📊 analyze_image_batch
批量分析图片内容

```typescript
// 参数示例
{
  "imagePaths": ["image1.jpg", "image2.jpg"],
  "prompt": "请描述这些图片的内容",
  "secretId": "your-secret-id",
  "secretKey": "your-secret-key"
}
```

#### 📹 get_video_info
获取视频文件基本信息

```typescript
// 参数示例
{
  "videoPath": "path/to/video.mp4"
}
```

#### 🎬 generate_video_script
基于视频内容生成专业拍摄脚本

```typescript
// 参数示例
{
  "videoPath": "path/to/video.mp4",
  "scriptType": "commercial",
  "targetDuration": 60,
  "targetAudience": "年轻消费者",
  "style": "时尚、动感",
  "prompt": "重点突出产品的创新特性",
  "secretId": "your-secret-id",
  "secretKey": "your-secret-key"
}
```

**脚本类型说明：**
- `commercial`: 商业广告脚本 - 突出产品卖点，包含行动号召
- `documentary`: 纪录片脚本 - 注重真实性和深度分析
- `tutorial`: 教学视频脚本 - 步骤清晰，易于跟随
- `narrative`: 叙事视频脚本 - 强调故事性和情感表达
- `custom`: 自定义脚本 - 根据prompt自由定制

## 🛠️ 技术栈

- **TypeScript**: 类型安全的 JavaScript 超集
- **FFmpeg**: 强大的多媒体处理框架
- **Jimp**: 纯 JavaScript 图像处理库
- **腾讯云 SDK**: 腾讯混元多模态 API 集成
- **MCP SDK**: Model Context Protocol 软件开发工具包

## 📋 系统要求

- Node.js >= 18.0.0
- FFmpeg (用于视频处理)
- 腾讯云账号和 API 密钥 (用于 AI 分析功能)

## 🔧 配置

### FFmpeg 安装

**Windows:**
```bash
# 使用 Chocolatey
choco install ffmpeg

# 或下载预编译版本
# https://ffmpeg.org/download.html#build-windows
```

**macOS:**
```bash
# 使用 Homebrew
brew install ffmpeg
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### 腾讯云 API 配置

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 创建 API 密钥 (SecretId 和 SecretKey)
3. 开通混元多模态服务
4. 在使用时提供相应的密钥信息

## 📝 开发

### 项目结构

```
video-capture-script-mcp/
├── src/
│   ├── index.ts              # MCP 服务入口
│   ├── video-analyzer.ts     # 视频分析核心逻辑
│   └── types.ts             # 类型定义
├── dist/                    # 编译输出
├── test/                    # 测试文件
├── temp_frames/            # 临时帧存储
└── package.json
```

### 开发命令

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test

# 代码检查
npm run lint

# 格式化代码
npm run format
```

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献指南

- 遵循现有的代码风格
- 添加适当的测试用例
- 更新相关文档
- 确保所有测试通过

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🐛 问题反馈

如果您遇到任何问题或有功能建议，请在 [GitHub Issues](https://github.com/pickstar-2002/video-capture-script-mcp/issues) 中提出。

## 📞 联系方式

如有任何疑问或需要技术支持，欢迎联系：

**微信**: pickstar_loveXX

---

⭐ 如果这个项目对您有帮助，请给个 Star 支持一下！