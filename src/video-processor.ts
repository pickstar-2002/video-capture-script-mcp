import { FrameExtractor, FrameExtractionOptions, VideoInfo } from './frame-extractor.js';
import { HunyuanClient, ImageAnalysisResult, TextGenerationResult } from './hunyuan-client.js';

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

export interface VideoScriptOptions {
  prompt?: string;
  maxFrames?: number;
  strategy?: 'uniform' | 'keyframe' | 'scene_change';
  hunyuanClient?: HunyuanClient;
  cleanup?: boolean;
  // 腾讯云凭证
  secretId?: string;
  secretKey?: string;
  region?: string;
  // 脚本生成相关参数
  scriptType?: 'commercial' | 'documentary' | 'tutorial' | 'narrative' | 'custom';
  targetDuration?: number; // 目标脚本时长（秒）
  targetAudience?: string; // 目标受众
  style?: string; // 拍摄风格
}

export interface VideoScriptResult {
  script: string;
  videoAnalysis: string; // 原始视频分析内容
  usage: {
    analysisTokens: number;
    scriptTokens: number;
    totalTokens: number;
  };
}

export interface ImageScriptOptions {
  prompt?: string;
  hunyuanClient?: HunyuanClient;
  // 腾讯云凭证
  secretId?: string;
  secretKey?: string;
  region?: string;
  // 脚本生成相关参数
  scriptType?: 'commercial' | 'documentary' | 'tutorial' | 'narrative' | 'custom';
  targetDuration?: number; // 目标脚本时长（秒）
  targetAudience?: string; // 目标受众
  style?: string; // 拍摄风格
}

export interface ImageScriptResult {
  script: string;
  imageAnalysis: string; // 原始图片分析内容
  usage: {
    analysisTokens: number;
    scriptTokens: number;
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

  async generateVideoScript(videoPath: string, options: VideoScriptOptions): Promise<VideoScriptResult> {
    const {
      prompt,
      maxFrames = 5,
      strategy = 'keyframe',
      cleanup = true,
      secretId,
      secretKey,
      region,
      scriptType = 'commercial',
      targetDuration,
      targetAudience = '一般观众',
      style = '专业、吸引人',
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

      console.error(`开始视频脚本生成: ${videoPath}`);

      // 第一步：分析视频内容
      const extractionOptions: FrameExtractionOptions = {
        maxFrames: Math.min(maxFrames, 4),
        strategy,
        quality: 85,
      };

      console.error(`开始提取视频帧...`);
      const framePaths = await this.frameExtractor.extractFrames(videoPath, extractionOptions);
      console.error(`成功提取 ${framePaths.length} 个帧`);

      if (framePaths.length === 0) {
        throw new Error('无法从视频中提取任何帧');
      }

      let analysisResult: ImageAnalysisResult;
      let scriptResult: TextGenerationResult;

      try {
        // 构建视频分析提示词
        const analysisPrompt = `请基于这${framePaths.length}张视频关键帧，详细分析视频内容，包括：
1. 主要场景和环境描述
2. 人物角色和动作
3. 物品道具和布景
4. 拍摄角度和构图
5. 色彩和光线效果
6. 整体氛围和情绪
7. 故事情节或内容主题

请用专业的影视制作术语进行描述，为后续的拍摄脚本创作提供详细的参考信息。`;

        console.error(`开始分析视频内容...`);
        analysisResult = await hunyuanClient.analyzeImagesInSingleRequest(framePaths, analysisPrompt);
        console.error(`视频内容分析完成`);

        // 第二步：基于分析结果生成拍摄脚本
        const scriptPrompt = this.buildScriptPrompt(analysisResult.content, {
          scriptType,
          targetDuration,
          targetAudience,
          style,
          customPrompt: prompt,
        });

        console.error(`开始生成拍摄脚本...`);
        scriptResult = await hunyuanClient.generateText(scriptPrompt, 'hunyuan-lite');
        console.error(`拍摄脚本生成完成`);

        return {
          script: scriptResult.content,
          videoAnalysis: analysisResult.content,
          usage: {
            analysisTokens: analysisResult.usage.totalTokens,
            scriptTokens: scriptResult.usage.totalTokens,
            totalTokens: analysisResult.usage.totalTokens + scriptResult.usage.totalTokens,
          },
        };
      } finally {
        // 清理临时帧文件
        if (cleanup) {
          console.error('清理临时帧文件...');
          await this.frameExtractor.cleanupFrames(framePaths);
        }
      }
    } catch (error) {
      console.error(`视频脚本生成失败:`, error);
      throw error;
    }
  }

  private buildScriptPrompt(videoAnalysis: string, options: {
    scriptType: string;
    targetDuration?: number;
    targetAudience: string;
    style: string;
    customPrompt?: string;
  }): string {
    const { scriptType, targetDuration, targetAudience, style, customPrompt } = options;

    let basePrompt = `基于以下视频内容分析，创作一个专业的拍摄脚本：

【视频内容分析】
${videoAnalysis}

【脚本要求】`;

    // 根据脚本类型添加特定要求
    switch (scriptType) {
      case 'commercial':
        basePrompt += `
- 脚本类型：商业广告脚本
- 重点突出产品特色和卖点
- 包含吸引人的开头、清晰的产品展示、强有力的行动号召
- 语言简洁有力，节奏紧凑`;
        break;
      case 'documentary':
        basePrompt += `
- 脚本类型：纪录片脚本
- 注重真实性和客观性
- 包含背景介绍、事实陈述、深度分析
- 语言专业严谨，逻辑清晰`;
        break;
      case 'tutorial':
        basePrompt += `
- 脚本类型：教学视频脚本
- 步骤清晰，易于理解和跟随
- 包含引言、分步教学、总结回顾
- 语言通俗易懂，重点突出`;
        break;
      case 'narrative':
        basePrompt += `
- 脚本类型：叙事视频脚本
- 注重故事性和情感表达
- 包含起承转合的完整故事结构
- 语言生动形象，富有感染力`;
        break;
      default:
        basePrompt += `
- 脚本类型：${scriptType}
- 根据视频内容特点制作合适的脚本`;
    }

    basePrompt += `
- 目标受众：${targetAudience}
- 拍摄风格：${style}`;

    if (targetDuration) {
      basePrompt += `
- 目标时长：约${targetDuration}秒`;
    }

    if (customPrompt) {
      basePrompt += `
- 特殊要求：${customPrompt}`;
    }

    basePrompt += `

【脚本格式】
请按照以下格式输出专业拍摄脚本：

## 视频标题
[根据内容生成吸引人的标题]

## 脚本概述
[简要说明视频主题和目标]

## 分镜脚本

### 镜头1：[镜头描述]
- **时长**：[预估时长]
- **景别**：[特写/中景/全景等]
- **机位**：[拍摄角度和位置]
- **内容**：[具体拍摄内容]
- **台词/解说**：[如有]
- **音效/配乐**：[建议的音效]

### 镜头2：[镜头描述]
[按相同格式继续...]

## 制作要点
- [关键拍摄技巧]
- [后期制作建议]
- [注意事项]

## 预期效果
[描述最终视频的预期效果和观众反应]

请确保脚本专业、实用，能够指导实际的视频拍摄制作。`;

    return basePrompt;
  }

  async generateImageScript(imagePaths: string[], options: ImageScriptOptions): Promise<ImageScriptResult> {
    const {
      prompt,
      secretId,
      secretKey,
      region,
      scriptType = 'commercial',
      targetDuration,
      targetAudience = '一般观众',
      style = '专业、吸引人',
    } = options;

    try {
      // 参数验证
      if (!imagePaths || imagePaths.length === 0) {
        throw new Error('图片路径数组参数是必需的，且不能为空');
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
        throw new Error('以下图片文件不存在或无法访问：\
' + invalidPaths.join('\
'));
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

      console.error('开始基于图片生成拍摄脚本，共 ' + imagePaths.length + ' 张图片');

      // 第一步：批量分析图片内容
      console.error('开始分析图片内容...');
      
      // 构建图片分析提示词
      const analysisPrompt = '请基于这些图片，详细分析其内容，包括：\
1. 主要场景和环境描述\
2. 人物角色、表情和动作\
3. 物品道具和布景细节\
4. 构图、角度和视觉效果\
5. 色彩搭配和光线效果\
6. 整体氛围和情绪表达\
7. 故事情节或主题内容\
\
请用专业的影视制作术语进行描述，为后续的拍摄脚本创作提供详细的参考信息。如果图片之间有关联性，请说明它们的逻辑关系和故事连贯性。';

      // 使用批量分析功能
      const analysisResults = await hunyuanClient.analyzeImageBatch(imagePaths, analysisPrompt);
      
      // 合并所有分析结果
      const successfulAnalyses = analysisResults.filter(result => !result.content.startsWith('❌'));
      const failedCount = analysisResults.length - successfulAnalyses.length;
      
      if (successfulAnalyses.length === 0) {
        throw new Error('所有图片分析都失败了，无法生成脚本');
      }

      if (failedCount > 0) {
        console.error('警告：' + failedCount + ' 张图片分析失败，将基于 ' + successfulAnalyses.length + ' 张成功分析的图片生成脚本');
      }

      // 合并分析结果
      const combinedAnalysis = successfulAnalyses
        .map((result, index) => '【图片 ' + (index + 1) + '】\
' + result.content)
        .join('\
\
');

      const totalAnalysisTokens = analysisResults.reduce((sum, result) => sum + result.usage.totalTokens, 0);

      console.error('图片内容分析完成 - 成功: ' + successfulAnalyses.length + '/' + imagePaths.length + ', Token使用: ' + totalAnalysisTokens);

      // 第二步：基于分析结果生成拍摄脚本
      const scriptPrompt = this.buildImageScriptPrompt(combinedAnalysis, {
        scriptType,
        targetDuration,
        targetAudience,
        style,
        customPrompt: prompt,
        imageCount: successfulAnalyses.length,
      });

      console.error(`开始生成拍摄脚本...`);
      const scriptResult = await hunyuanClient.generateText(scriptPrompt, 'hunyuan-lite');
      console.error(`拍摄脚本生成完成`);

      return {
        script: scriptResult.content,
        imageAnalysis: combinedAnalysis,
        usage: {
          analysisTokens: totalAnalysisTokens,
          scriptTokens: scriptResult.usage.totalTokens,
          totalTokens: totalAnalysisTokens + scriptResult.usage.totalTokens,
        },
      };
    } catch (error) {
      console.error(`基于图片的脚本生成失败:`, error);
      throw error;
    }
  }

  private buildImageScriptPrompt(imageAnalysis: string, options: {
    scriptType: string;
    targetDuration?: number;
    targetAudience: string;
    style: string;
    customPrompt?: string;
    imageCount: number;
  }): string {
    const { scriptType, targetDuration, targetAudience, style, customPrompt, imageCount } = options;

    let basePrompt = `基于以下 ${imageCount} 张图片的内容分析，创作一个专业的拍摄脚本：

【图片内容分析】
${imageAnalysis}

【脚本要求】`;

    // 根据脚本类型添加特定要求
    switch (scriptType) {
      case 'commercial':
        basePrompt += `
- 脚本类型：商业广告脚本
- 重点突出产品特色和卖点
- 包含吸引人的开头、清晰的产品展示、强有力的行动号召
- 语言简洁有力，节奏紧凑
- 充分利用图片中的视觉元素增强广告效果`;
        break;
      case 'documentary':
        basePrompt += `
- 脚本类型：纪录片脚本
- 注重真实性和客观性
- 包含背景介绍、事实陈述、深度分析
- 语言专业严谨，逻辑清晰
- 基于图片内容构建真实的故事线`;
        break;
      case 'tutorial':
        basePrompt += `
- 脚本类型：教学视频脚本
- 步骤清晰，易于理解和跟随
- 包含引言、分步教学、总结回顾
- 语言通俗易懂，重点突出
- 利用图片中的元素作为教学示例`;
        break;
      case 'narrative':
        basePrompt += `
- 脚本类型：叙事视频脚本
- 注重故事性和情感表达
- 包含起承转合的完整故事结构
- 语言生动形象，富有感染力
- 将图片内容串联成连贯的故事情节`;
        break;
      default:
        basePrompt += `
- 脚本类型：${scriptType}
- 根据图片内容特点制作合适的脚本`;
    }

    basePrompt += `
- 目标受众：${targetAudience}
- 拍摄风格：${style}
- 图片数量：${imageCount} 张`;

    if (targetDuration) {
      basePrompt += `
- 目标时长：约${targetDuration}秒`;
    }

    if (customPrompt) {
      basePrompt += `
- 特殊要求：${customPrompt}`;
    }

    basePrompt += `

【脚本格式】
请按照以下格式输出专业拍摄脚本：

## 视频标题
[根据图片内容生成吸引人的标题]

## 脚本概述
[简要说明视频主题和目标，以及如何利用现有图片素材]

## 分镜脚本

### 镜头1：[镜头描述]
- **时长**：[预估时长]
- **景别**：[特写/中景/全景等]
- **机位**：[拍摄角度和位置]
- **内容**：[具体拍摄内容，可参考图片中的元素]
- **参考图片**：[如适用，指出参考了哪张图片的哪些元素]
- **台词/解说**：[如有]
- **音效/配乐**：[建议的音效]

### 镜头2：[镜头描述]
[按相同格式继续...]

## 图片素材利用建议
- [说明如何在拍摄中参考和利用现有图片]
- [图片中的哪些元素可以直接使用或重新拍摄]
- [如何保持与图片风格的一致性]

## 制作要点
- [关键拍摄技巧]
- [后期制作建议]
- [注意事项]
- [与图片素材的结合方式]

## 预期效果
[描述最终视频的预期效果和观众反应]

请确保脚本专业、实用，能够指导实际的视频拍摄制作，并充分利用现有的图片素材。`;

    return basePrompt;
  }
}