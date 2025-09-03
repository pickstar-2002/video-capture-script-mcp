import { FrameExtractor, FrameExtractionOptions, VideoInfo } from './frame-extractor.js';
import { HunyuanClient, ImageAnalysisResult } from './hunyuan-client.js';

export interface VideoAnalysisOptions {
  prompt?: string;
  maxFrames?: number;
  strategy?: 'uniform' | 'keyframe' | 'scene_change';
  hunyuanClient?: HunyuanClient;
  cleanup?: boolean; // 是否在分析后删除临时帧文件
  // 腾讯云凭证
  secretId?: string;
  secretKey?: string;
  region?: string;
}

export interface VideoAnalysisResult {
  summary: string;
}

export class VideoProcessor {
  private frameExtractor: FrameExtractor;

  constructor() {
    this.frameExtractor = new FrameExtractor();
  }

  async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    try {
      // 检查文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`视频文件不存在或无法访问: ${videoPath}`);
      }

      console.error(`获取视频信息: ${videoPath}`);
      return this.frameExtractor.getVideoInfo(videoPath);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`获取视频信息失败: ${error.message}`);
      }
      throw new Error(`获取视频信息失败: ${String(error)}`);
    }
  }

  async analyzeVideo(videoPath: string, options: VideoAnalysisOptions): Promise<VideoAnalysisResult> {
    const {
      prompt = '请基于这些视频关键帧，用100-200字简洁描述视频的主要内容、场景、人物和动作，不需要逐帧分析。',
      maxFrames = 5,
      strategy = 'keyframe',
      cleanup = true,
      secretId,
      secretKey,
      region,
    } = options;

    try {
      // 参数验证
      if (!videoPath) {
        throw new Error('视频路径参数是必需的');
      }

      // 检查文件是否存在
      const fs = await import('fs/promises');
      try {
        await fs.access(videoPath);
      } catch {
        throw new Error(`视频文件不存在或无法访问: ${videoPath}`);
      }

      // 创建或使用提供的 HunyuanClient
      let hunyuanClient = options.hunyuanClient;
      if (!hunyuanClient) {
        if (!secretId || !secretKey) {
          throw new Error('腾讯云认证信息缺失：请提供 hunyuanClient 实例或 secretId/secretKey 参数');
        }
        hunyuanClient = new HunyuanClient({
          secretId,
          secretKey,
          region: region || 'ap-beijing',
        });
      } else if (secretId && secretKey) {
        hunyuanClient.setCredentials(secretId, secretKey);
      }

      console.error(`开始视频分析: ${videoPath}`);

      // 提取关键帧
      const extractionOptions: FrameExtractionOptions = {
        maxFrames: Math.min(maxFrames, 4), // 限制帧数以控制成本
        strategy,
        quality: 85,
      };

      console.error(`开始提取视频帧...`);
      const framePaths = await this.frameExtractor.extractFrames(videoPath, extractionOptions);
      console.error(`成功提取 ${framePaths.length} 个帧`);

      if (framePaths.length === 0) {
        throw new Error('无法从视频中提取任何帧');
      }

      try {
        // 构建简洁的提示词
        const summaryPrompt = `请基于这${framePaths.length}张视频关键帧，用100-200字简洁描述视频内容，包括：主要场景、人物、动作和整体内容。请用一段连贯的文字总结，不要逐帧分析。`;

        console.error(`开始分析视频内容...`);
        
        // 使用单次请求分析多张图片
        const batchResult = await hunyuanClient.analyzeImagesInSingleRequest(framePaths, summaryPrompt);
        
        console.error(`视频分析完成`);

        return {
          summary: batchResult.content,
        };
      } finally {
        // 清理临时帧文件
        if (cleanup) {
          console.error('清理临时帧文件...');
          await this.frameExtractor.cleanupFrames(framePaths);
        }
      }
    } catch (error) {
      console.error(`视频分析失败:`, error);
      throw error;
    }
  }
}