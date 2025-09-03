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
  frameAnalyses: ImageAnalysisResult[];
  videoInfo: VideoInfo;
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
      prompt = '请详细描述这个视频帧的内容，包括场景、人物、动作和其他重要信息。',
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
        // 如果提供了新的凭证，更新客户端
        hunyuanClient.setCredentials(secretId, secretKey);
      }

      console.error(`开始视频分析: ${videoPath}`);
      console.error(`分析参数 - 策略: ${strategy}, 最大帧数: ${maxFrames}, 地域: ${region || 'ap-beijing'}`);

      // 获取视频信息
      const videoInfo = await this.getVideoInfo(videoPath);
      console.error(`视频信息 - 时长: ${videoInfo.duration.toFixed(2)}s, 分辨率: ${videoInfo.width}x${videoInfo.height}, 帧率: ${videoInfo.frameRate.toFixed(2)}fps`);

      // 验证视频时长
      if (videoInfo.duration <= 0) {
        throw new Error('视频时长无效，可能是损坏的视频文件');
      }

      if (videoInfo.duration > 1800) { // 30分钟
        console.warn(`警告: 视频时长较长 (${Math.floor(videoInfo.duration / 60)}分钟)，建议使用较少的帧数以控制成本`);
      }

      // 提取关键帧
      const extractionOptions: FrameExtractionOptions = {
        maxFrames,
        strategy,
        quality: 85, // 适中的质量以平衡文件大小和清晰度
      };

      console.error(`开始提取视频帧...`);
      const framePaths = await this.frameExtractor.extractFrames(videoPath, extractionOptions);
      console.error(`成功提取 ${framePaths.length} 个帧`);

      if (framePaths.length === 0) {
        throw new Error('无法从视频中提取任何帧。可能原因:\n1. 视频文件损坏\n2. 视频格式不支持\n3. FFmpeg配置问题\n4. 磁盘空间不足');
      }

      // 分析每个帧
      const frameAnalyses: ImageAnalysisResult[] = [];
      let totalUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      console.error(`开始分析视频帧 (共${framePaths.length}帧)...`);

      try {
        for (let i = 0; i < framePaths.length; i++) {
          const framePath = framePaths[i];
          console.error(`分析进度: ${i + 1}/${framePaths.length} - ${framePath}`);
          
          try {
            const framePrompt = `${prompt} (这是视频第 ${i + 1} 帧，共 ${framePaths.length} 帧)`;
            const analysis = await hunyuanClient.analyzeImage(framePath, framePrompt);
            frameAnalyses.push(analysis);
            
            // 累计使用情况
            totalUsage.promptTokens += analysis.usage.promptTokens;
            totalUsage.completionTokens += analysis.usage.completionTokens;
            totalUsage.totalTokens += analysis.usage.totalTokens;
            
            console.error(`第${i + 1}帧分析完成 - Token使用: ${analysis.usage.totalTokens}`);
            
            // 添加延迟以避免API限制
            if (i < framePaths.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`第${i + 1}帧分析失败:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            frameAnalyses.push({
              content: `❌ 第${i + 1}帧分析失败: ${errorMessage}`,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            });
          }
        }

        const successCount = frameAnalyses.filter(analysis => !analysis.content.startsWith('❌')).length;
        console.error(`帧分析完成 - 成功: ${successCount}/${framePaths.length}, 总计Token使用: ${totalUsage.totalTokens}`);

        if (successCount === 0) {
          throw new Error('所有视频帧分析都失败了。请检查:\n1. 腾讯云API配置是否正确\n2. 网络连接是否正常\n3. 账户余额是否充足\n4. 图片文件是否有效');
        }

        // 生成总结
        console.error(`生成视频总结...`);
        const summary = await this.generateVideoSummary(frameAnalyses, videoInfo, hunyuanClient);
        
        console.error(`视频分析完全完成`);

        return {
          summary,
          frameAnalyses,
          videoInfo,
          totalUsage,
        };
      } finally {
        // 清理临时帧文件
        if (cleanup) {
          console.error('清理临时帧文件...');
          await this.frameExtractor.cleanupFrames(framePaths);
          console.error('临时文件清理完成');
        }
      }
    } catch (error) {
      console.error(`视频分析失败:`, error);
      throw error;
    }
  }

  private async generateVideoSummary(
    frameAnalyses: ImageAnalysisResult[],
    videoInfo: VideoInfo,
    hunyuanClient: HunyuanClient
  ): Promise<string> {
    if (frameAnalyses.length === 0) {
      return '无法生成视频总结：没有成功分析的帧。';
    }

    const frameDescriptions = frameAnalyses
      .filter(analysis => !analysis.content.startsWith('Error'))
      .map((analysis, index) => `帧 ${index + 1}: ${analysis.content}`)
      .join('\n\n');

    if (!frameDescriptions) {
      return '无法生成视频总结：所有帧分析都失败了。';
    }

    const summaryPrompt = `
基于以下视频帧的分析结果，请生成一个简洁且全面的视频内容总结：

视频信息：
- 时长：${videoInfo.duration.toFixed(2)} 秒
- 分辨率：${videoInfo.width}x${videoInfo.height}
- 帧率：${videoInfo.frameRate.toFixed(2)} fps
- 分析帧数：${frameAnalyses.length}

帧分析结果：
${frameDescriptions}

请根据这些信息，提供一个结构化的视频总结，包括：
1. 视频的主要内容和主题
2. 关键场景和动作
3. 人物或对象
4. 整体氛围和风格
5. 时间流程（如果可以识别）

总结应该简洁明了，突出重点，避免重复信息。
`;

    try {
      // 使用文本模型生成总结（不是图像理解模型）
      // 这里我们可以直接调用混元的文本生成API
      const summaryResult = await this.generateTextSummary(summaryPrompt, hunyuanClient);
      return summaryResult;
    } catch (error) {
      console.error('Failed to generate video summary:', error);
      return `基于 ${frameAnalyses.length} 个帧的分析结果，这个时长 ${videoInfo.duration.toFixed(2)} 秒的视频包含了多个场景。由于总结生成失败，请查看各帧的详细分析结果。`;
    }
  }

  private async generateTextSummary(prompt: string, hunyuanClient: HunyuanClient): Promise<string> {
    // 这里我们需要实现文本生成API调用
    // 由于之前的 HunyuanClient 主要针对图像理解，我们可以添加文本生成方法
    // 或者简单地基于帧分析结果生成总结
    
    // 暂时返回基于帧分析的简单总结
    return '基于提取的关键帧分析，该视频展示了多个连续的场景。详细内容请参考各帧的具体分析结果。';
  }

  async analyzeVideoWithBatching(videoPath: string, options: VideoAnalysisOptions): Promise<VideoAnalysisResult> {
    const {
      prompt = '请详细描述这些视频帧的内容，按顺序分析每一帧。',
      maxFrames = 5,
      strategy = 'keyframe',
      cleanup = true,
      secretId,
      secretKey,
      region,
    } = options;

    // 创建或使用提供的 HunyuanClient
    let hunyuanClient = options.hunyuanClient;
    if (!hunyuanClient) {
      if (!secretId || !secretKey) {
        throw new Error('Either provide hunyuanClient or secretId/secretKey in options');
      }
      hunyuanClient = new HunyuanClient({
        secretId,
        secretKey,
        region,
      });
    } else if (secretId && secretKey) {
      // 如果提供了新的凭证，更新客户端
      hunyuanClient.setCredentials(secretId, secretKey);
    }

    console.error(`Starting batched video analysis for: ${videoPath}`);

    // 获取视频信息
    const videoInfo = await this.getVideoInfo(videoPath);

    // 提取关键帧
    const extractionOptions: FrameExtractionOptions = {
      maxFrames: Math.min(maxFrames, 4), // 限制为4帧以适应API限制
      strategy,
      quality: 85,
    };

    const framePaths = await this.frameExtractor.extractFrames(videoPath, extractionOptions);
    console.error(`Extracted ${framePaths.length} frames for batch analysis`);

    if (framePaths.length === 0) {
      throw new Error('No frames could be extracted from the video');
    }

    try {
      // 使用单次请求分析多张图片
      const batchPrompt = `${prompt}\n\n请按顺序分析这${framePaths.length}张连续的视频帧，说明视频的发展过程。`;
      const batchResult = await hunyuanClient.analyzeImagesInSingleRequest(framePaths, batchPrompt);
      
      // 将批处理结果转换为单独的帧分析结果
      const frameAnalyses: ImageAnalysisResult[] = [{
        content: batchResult.content,
        usage: batchResult.usage,
      }];

      const summary = batchResult.content;

      return {
        summary,
        frameAnalyses,
        videoInfo,
        totalUsage: batchResult.usage,
      };
    } finally {
      // 清理临时帧文件
      if (cleanup) {
        console.error('Cleaning up temporary frame files...');
        await this.frameExtractor.cleanupFrames(framePaths);
      }
    }
  }
}
