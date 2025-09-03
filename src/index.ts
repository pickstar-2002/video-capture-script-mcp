import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import ffmpeg from 'fluent-ffmpeg';
import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { unlink, readFile } from 'fs/promises';
import path from 'path';
import { HunyuanClient } from './hunyuan-client.js';
import { VideoProcessor } from './video-processor.js';
import { FrameExtractor } from './frame-extractor.js';

class VideoMCPServer {
  private server: Server;
  private videoProcessor: VideoProcessor;
  private frameExtractor: FrameExtractor;

  constructor() {
    this.server = new Server(
      {
        name: 'video-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.videoProcessor = new VideoProcessor();
    this.frameExtractor = new FrameExtractor();

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // 列出所有可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'extract_video_frames',
            description: '从视频中提取关键帧图像',
            inputSchema: {
              type: 'object',
              properties: {
                videoPath: {
                  type: 'string',
                  description: '视频文件路径',
                },
                maxFrames: {
                  type: 'number',
                  description: '最大提取帧数（默认10帧）',
                  default: 10,
                },
                outputDir: {
                  type: 'string',
                  description: '输出目录路径（可选）',
                },
                strategy: {
                  type: 'string',
                  enum: ['uniform', 'keyframe', 'scene_change'],
                  description: '提取策略：uniform(均匀间隔), keyframe(关键帧), scene_change(场景变化)',
                  default: 'uniform',
                },
              },
              required: ['videoPath'],
            },
          },
          {
            name: 'analyze_video_content',
            description: '使用腾讯混元多模态API分析视频内容',
            inputSchema: {
              type: 'object',
              properties: {
                videoPath: {
                  type: 'string',
                  description: '视频文件路径',
                },
                prompt: {
                  type: 'string',
                  description: '分析提示词（可选）',
                  default: '请详细描述这个视频中的内容，包括场景、人物、动作和其他重要信息。',
                },
                maxFrames: {
                  type: 'number',
                  description: '最大分析帧数（默认5帧以控制成本）',
                  default: 5,
                },
                strategy: {
                  type: 'string',
                  enum: ['uniform', 'keyframe', 'scene_change'],
                  description: '帧提取策略',
                  default: 'keyframe',
                },
                secretId: {
                  type: 'string',
                  description: '腾讯云 SecretId',
                },
                secretKey: {
                  type: 'string',
                  description: '腾讯云 SecretKey',
                },
                region: {
                  type: 'string',
                  description: '腾讯云地域（可选，默认 ap-beijing）',
                  default: 'ap-beijing',
                },
              },
              required: ['videoPath', 'secretId', 'secretKey'],
            },
          },
          {
            name: 'analyze_image_batch',
            description: '批量分析图片内容',
            inputSchema: {
              type: 'object',
              properties: {
                imagePaths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '图片文件路径数组',
                },
                prompt: {
                  type: 'string',
                  description: '分析提示词（可选）',
                  default: '请描述这张图片的内容。',
                },
                secretId: {
                  type: 'string',
                  description: '腾讯云 SecretId',
                },
                secretKey: {
                  type: 'string',
                  description: '腾讯云 SecretKey',
                },
                region: {
                  type: 'string',
                  description: '腾讯云地域（可选，默认 ap-beijing）',
                  default: 'ap-beijing',
                },
              },
              required: ['imagePaths', 'secretId', 'secretKey'],
            },
          },
          {
            name: 'get_video_info',
            description: '获取视频文件基本信息',
            inputSchema: {
              type: 'object',
              properties: {
                videoPath: {
                  type: 'string',
                  description: '视频文件路径',
                },
              },
              required: ['videoPath'],
            },
          },
        ] as Tool[],
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'extract_video_frames':
            return await this.handleExtractFrames(args);
          case 'analyze_video_content':
            return await this.handleAnalyzeVideo(args);
          case 'analyze_image_batch':
            return await this.handleAnalyzeImageBatch(args);
          case 'get_video_info':
            return await this.handleGetVideoInfo(args);
          default:
            throw new Error(`未知的工具: ${name}。支持的工具包括: extract_video_frames, analyze_video_content, analyze_image_batch, get_video_info`);
        }
      } catch (error) {
        const errorMessage = this.formatError(error, name, args);
        return {
          content: [
            {
              type: 'text',
              text: errorMessage,
            },
          ],
        };
      }
    });
  }

  private formatError(error: unknown, toolName: string, args: any): string {
    const baseError = error instanceof Error ? error.message : String(error);
    
    // 构建上下文信息
    let contextInfo = `\n\n[错误上下文]`;
    contextInfo += `\n- 工具名称: ${toolName}`;
    
    // 添加参数信息（隐藏敏感信息）
    const sanitizedArgs = { ...args };
    if (sanitizedArgs.secretId) {
      sanitizedArgs.secretId = `***${sanitizedArgs.secretId.slice(-4)}`;
    }
    if (sanitizedArgs.secretKey) {
      sanitizedArgs.secretKey = '***hidden***';
    }
    contextInfo += `\n- 调用参数: ${JSON.stringify(sanitizedArgs, null, 2)}`;
    
    // 根据不同的错误类型提供具体的解决建议
    let suggestions = `\n\n[解决建议]`;
    
    if (baseError.includes('腾讯云混元大模型服务未开通')) {
      suggestions += `\n1. 访问腾讯云控制台开通混元大模型服务: https://console.cloud.tencent.com/hunyuan`;
      suggestions += `\n2. 确保账户有足够的余额`;
      suggestions += `\n3. 检查服务地域设置是否正确`;
    } else if (baseError.includes('API认证失败') || baseError.includes('SignatureFailure')) {
      suggestions += `\n1. 检查 SecretId 和 SecretKey 是否正确`;
      suggestions += `\n2. 确认密钥对应的账户权限是否足够`;
      suggestions += `\n3. 检查地域(region)设置是否与账户开通的服务地域一致`;
      suggestions += `\n4. 确认API密钥未过期或被禁用`;
    } else if (baseError.includes('调用频率超限') || baseError.includes('LimitExceeded')) {
      suggestions += `\n1. 稍等片刻后重试`;
      suggestions += `\n2. 减少并发请求数量`;
      suggestions += `\n3. 考虑升级API调用限制`;
    } else if (baseError.includes('No such file') || baseError.includes('不存在')) {
      suggestions += `\n1. 检查文件路径是否正确`;
      suggestions += `\n2. 确认文件是否存在`;
      suggestions += `\n3. 检查文件权限是否允许读取`;
    } else if (baseError.includes('ffmpeg') || baseError.includes('Failed to get video info')) {
      suggestions += `\n1. 检查 FFmpeg 是否正确安装`;
      suggestions += `\n2. 确认视频文件格式是否受支持`;
      suggestions += `\n3. 检查视频文件是否损坏`;
      suggestions += `\n4. 尝试使用其他视频格式进行测试`;
    } else if (baseError.includes('网络') || baseError.includes('timeout') || baseError.includes('ECONNREFUSED')) {
      suggestions += `\n1. 检查网络连接是否正常`;
      suggestions += `\n2. 确认防火墙设置不会阻止API调用`;
      suggestions += `\n3. 尝试稍后重试`;
      suggestions += `\n4. 检查代理设置（如果使用代理）`;
    } else {
      suggestions += `\n1. 检查所有输入参数是否正确`;
      suggestions += `\n2. 查看详细错误信息确定问题所在`;
      suggestions += `\n3. 如果问题持续，请联系技术支持`;
    }
    
    return `❌ 操作失败: ${baseError}${contextInfo}${suggestions}`;
  }

  private async handleExtractFrames(args: any) {
    const { videoPath, maxFrames = 10, outputDir, strategy = 'uniform' } = args;

    try {
      // 参数验证
      if (!videoPath) {
        throw new Error('视频路径参数(videoPath)是必需的');
      }

      // 检查文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`视频文件不存在或无法访问: ${videoPath}`);
      }

      console.error(`开始提取视频帧: ${videoPath}`);
      console.error(`参数设置 - 最大帧数: ${maxFrames}, 策略: ${strategy}`);

      const frames = await this.frameExtractor.extractFrames(videoPath, {
        maxFrames,
        outputDir,
        strategy,
      });

      if (frames.length === 0) {
        throw new Error('未能从视频中提取到任何帧，请检查视频文件是否有效');
      }

      console.error(`成功提取 ${frames.length} 个视频帧`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ 成功从视频中提取了 ${frames.length} 个帧: ${videoPath}`,
          },
          {
            type: 'text',
            text: `📁 帧文件路径:\n${frames.map((frame: string, index: number) => `${index + 1}. ${frame}`).join('\n')}`,
          },
        ],
      };
    } catch (error) {
      console.error(`视频帧提取失败:`, error);
      throw error;
    }
  }

  private async handleAnalyzeVideo(args: any) {
    const { videoPath, prompt, maxFrames = 5, strategy = 'keyframe', secretId, secretKey, region } = args;

    try {
      // 参数验证
      if (!videoPath) {
        throw new Error('视频路径参数(videoPath)是必需的');
      }

      if (!secretId || !secretKey) {
        throw new Error('腾讯云认证信息缺失，请提供 secretId 和 secretKey 参数');
      }

      // 检查文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`视频文件不存在或无法访问: ${videoPath}`);
      }

      console.error(`开始分析视频内容: ${videoPath}`);
      console.error(`分析参数 - 最大帧数: ${maxFrames}, 策略: ${strategy}, 地域: ${region || 'ap-beijing'}`);

      const result = await this.videoProcessor.analyzeVideo(videoPath, {
        prompt,
        maxFrames,
        strategy,
        secretId,
        secretKey,
        region,
      });

      console.error(`视频分析完成 - 分析了 ${result.frameAnalyses.length} 个帧，总计使用 ${result.totalUsage.totalTokens} 个token`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ 视频内容分析完成: ${videoPath}`,
          },
          {
            type: 'text',
            text: `📋 分析总结:\n${result.summary}`,
          },
          {
            type: 'text',
            text: `📊 统计信息:\n- 分析帧数: ${result.frameAnalyses.length}\n- Token使用: ${result.totalUsage.totalTokens} (提示: ${result.totalUsage.promptTokens}, 回复: ${result.totalUsage.completionTokens})`,
          },
          {
            type: 'text',
            text: `🎬 详细帧分析:`,
          },
          ...result.frameAnalyses.map((analysis: any, index: number) => ({
            type: 'text' as const,
            text: `\n📸 第 ${index + 1} 帧:\n${analysis.content}`,
          })),
        ],
      };
    } catch (error) {
      console.error(`视频分析失败:`, error);
      throw error;
    }
  }

  private async handleAnalyzeImageBatch(args: any) {
    const { imagePaths, prompt, secretId, secretKey, region } = args;

    try {
      // 参数验证
      if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
        throw new Error('图片路径数组参数(imagePaths)是必需的，且不能为空');
      }

      if (!secretId || !secretKey) {
        throw new Error('腾讯云认证信息缺失，请提供 secretId 和 secretKey 参数');
      }

      // 检查所有图片文件是否存在
      const fs = await import('fs/promises');
      const invalidPaths: string[] = [];
      
      for (const imagePath of imagePaths) {
        try {
          await fs.access(imagePath);
        } catch {
          invalidPaths.push(imagePath);
        }
      }

      if (invalidPaths.length > 0) {
        throw new Error(`以下图片文件不存在或无法访问:\n${invalidPaths.join('\n')}`);
      }

      console.error(`开始批量分析图片，共 ${imagePaths.length} 张图片`);
      console.error(`分析地域: ${region || 'ap-beijing'}`);

      const hunyuanClient = new HunyuanClient({
        secretId,
        secretKey,
        region,
      });

      const results = await hunyuanClient.analyzeImageBatch(imagePaths, prompt);

      const successCount = results.filter((result: any) => !result.content.startsWith('Error')).length;
      const totalTokens = results.reduce((sum: number, result: any) => sum + result.usage.totalTokens, 0);

      console.error(`批量图片分析完成 - 成功: ${successCount}/${results.length}, 总计使用 ${totalTokens} 个token`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ 批量图片分析完成`,
          },
          {
            type: 'text',
            text: `📊 分析统计:\n- 总图片数: ${imagePaths.length}\n- 成功分析: ${successCount}\n- 失败数量: ${imagePaths.length - successCount}\n- Token使用: ${totalTokens}`,
          },
          {
            type: 'text',
            text: `🖼️ 详细分析结果:`,
          },
          ...results.map((result: any, index: number) => ({
            type: 'text' as const,
            text: `\n📸 图片 ${index + 1} (${imagePaths[index]}):\n${result.content}`,
          })),
        ],
      };
    } catch (error) {
      console.error(`批量图片分析失败:`, error);
      throw error;
    }
  }

  private async handleGetVideoInfo(args: any) {
    const { videoPath } = args;

    try {
      // 参数验证
      if (!videoPath) {
        throw new Error('视频路径参数(videoPath)是必需的');
      }

      // 检查文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`视频文件不存在或无法访问: ${videoPath}`);
      }

      console.error(`获取视频信息: ${videoPath}`);

      const info = await this.videoProcessor.getVideoInfo(videoPath);

      console.error(`视频信息获取完成 - 时长: ${info.duration}s, 分辨率: ${info.width}x${info.height}`);

      return {
        content: [
          {
            type: 'text',
            text: `✅ 视频信息获取成功: ${videoPath}`,
          },
          {
            type: 'text',
            text: `📹 视频详细信息:`,
          },
          {
            type: 'text',
            text: `⏱️  时长: ${info.duration.toFixed(2)} 秒 (${Math.floor(info.duration / 60)}分${Math.floor(info.duration % 60)}秒)`,
          },
          {
            type: 'text',
            text: `📐 分辨率: ${info.width} × ${info.height} 像素`,
          },
          {
            type: 'text',
            text: `🎞️  帧率: ${info.frameRate.toFixed(2)} fps`,
          },
          {
            type: 'text',
            text: `🎬 总帧数: ${info.frameCount} 帧`,
          },
          {
            type: 'text',
            text: `📁 格式: ${info.format}`,
          },
        ],
      };
    } catch (error) {
      console.error(`获取视频信息失败:`, error);
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Video MCP Server running on stdio');
  }
}

async function main() {
  const server = new VideoMCPServer();
  await server.run();
}

// 如果直接运行此文件，启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
}

export { VideoMCPServer };
