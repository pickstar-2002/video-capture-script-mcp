import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { promises as fs } from 'fs';

export interface FrameExtractionOptions {
  maxFrames: number;
  outputDir?: string;
  strategy: 'uniform' | 'keyframe' | 'scene_change';
  quality?: number; // JPEG质量 1-100
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  frameCount: number;
  format: string;
}

export class FrameExtractor {
  private defaultOutputDir = './temp_frames';

  constructor() {
    // 确保临时目录存在
    this.ensureOutputDir(this.defaultOutputDir);
  }

  private async ensureOutputDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      console.error(`分析视频文件: ${videoPath}`);
      
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          let errorMessage = `获取视频信息失败: ${err.message}`;
          
          if (err.message.includes('No such file')) {
            errorMessage = `视频文件不存在: ${videoPath}`;
          } else if (err.message.includes('Invalid data')) {
            errorMessage = `视频文件格式无效或损坏: ${videoPath}`;
          } else if (err.message.includes('Permission denied')) {
            errorMessage = `无权限访问视频文件: ${videoPath}`;
          } else if (err.message.includes('ffprobe')) {
            errorMessage = `FFmpeg未正确安装或配置。请确保FFmpeg已正确安装并可在命令行中使用。\n原始错误: ${err.message}`;
          }
          
          reject(new Error(errorMessage));
          return;
        }

        if (!metadata || !metadata.streams) {
          reject(new Error(`视频文件元数据获取失败: ${videoPath}`));
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error(`视频文件中未找到视频流，可能是纯音频文件: ${videoPath}`));
          return;
        }

        const duration = metadata.format.duration || 0;
        if (duration <= 0) {
          reject(new Error(`视频时长无效 (${duration}秒)，可能是损坏的视频文件: ${videoPath}`));
          return;
        }

        const frameRate = this.parseFrameRate(videoStream.r_frame_rate || '25/1');
        const frameCount = Math.floor(duration * frameRate);

        const videoInfo: VideoInfo = {
          duration,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          frameRate,
          frameCount,
          format: metadata.format.format_name || 'unknown',
        };

        console.error(`视频信息获取成功 - 时长: ${duration.toFixed(2)}s, 分辨率: ${videoInfo.width}x${videoInfo.height}, 帧率: ${frameRate.toFixed(2)}fps`);

        resolve(videoInfo);
      });
    });
  }

  private parseFrameRate(frameRateStr: string): number {
    const parts = frameRateStr.split('/');
    if (parts.length === 2) {
      return parseInt(parts[0]) / parseInt(parts[1]);
    }
    return parseFloat(frameRateStr) || 25;
  }

  async extractFrames(videoPath: string, options: FrameExtractionOptions): Promise<string[]> {
    try {
      const outputDir = options.outputDir || this.defaultOutputDir;
      await this.ensureOutputDir(outputDir);

      console.error(`开始提取视频帧 - 输出目录: ${outputDir}`);

      const videoInfo = await this.getVideoInfo(videoPath);
      
      // 验证提取参数
      if (options.maxFrames <= 0) {
        throw new Error(`最大帧数必须大于0，当前值: ${options.maxFrames}`);
      }

      if (options.maxFrames > 100) {
        console.warn(`警告: 请求提取大量帧 (${options.maxFrames})，这可能会消耗大量存储空间和处理时间`);
      }

      const timestamps = await this.calculateTimestamps(videoPath, videoInfo, options);
      
      if (timestamps.length === 0) {
        throw new Error('无法计算有效的时间戳，可能是视频太短或参数设置有误');
      }

      console.error(`计算出 ${timestamps.length} 个提取时间点: ${timestamps.map(t => t.toFixed(2)).join(', ')}s`);
      
      const framePaths: string[] = [];
      const videoName = path.basename(videoPath, path.extname(videoPath));
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];
        const framePath = path.join(outputDir, `${videoName}_frame_${i + 1}_${timestamp.toFixed(2)}s.jpg`);
        
        try {
          console.error(`提取第${i + 1}/${timestamps.length}帧 - 时间: ${timestamp.toFixed(2)}s`);
          await this.extractFrameAtTimestamp(videoPath, timestamp, framePath, options.quality || 90);
          framePaths.push(framePath);
          successCount++;
          console.error(`第${i + 1}帧提取成功: ${framePath}`);
        } catch (error) {
          failureCount++;
          console.error(`第${i + 1}帧提取失败 (时间: ${timestamp.toFixed(2)}s):`, error);
          
          // 如果连续失败太多，停止提取
          if (failureCount >= 3 && successCount === 0) {
            throw new Error(`连续多帧提取失败，停止处理。可能原因:\n1. FFmpeg配置问题\n2. 视频文件损坏\n3. 磁盘空间不足\n4. 输出目录权限问题`);
          }
        }
      }

      console.error(`帧提取完成 - 成功: ${successCount}, 失败: ${failureCount}`);

      if (framePaths.length === 0) {
        throw new Error('所有帧提取都失败了，请检查视频文件和FFmpeg配置');
      }

      return framePaths;
    } catch (error) {
      console.error(`视频帧提取过程失败:`, error);
      throw error;
    }
  }

  private async calculateTimestamps(
    videoPath: string,
    videoInfo: VideoInfo,
    options: FrameExtractionOptions
  ): Promise<number[]> {
    const { duration } = videoInfo;
    const { maxFrames, strategy } = options;

    switch (strategy) {
      case 'uniform':
        return this.generateUniformTimestamps(duration, maxFrames);
      
      case 'keyframe':
        return await this.detectKeyframes(videoPath, maxFrames);
      
      case 'scene_change':
        return await this.detectSceneChanges(videoPath, maxFrames);
      
      default:
        return this.generateUniformTimestamps(duration, maxFrames);
    }
  }

  private generateUniformTimestamps(duration: number, maxFrames: number): number[] {
    const timestamps: number[] = [];
    const interval = duration / (maxFrames + 1);
    
    for (let i = 1; i <= maxFrames; i++) {
      timestamps.push(interval * i);
    }
    
    return timestamps;
  }

  private async detectKeyframes(videoPath: string, maxFrames: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      // 简化方法：直接回退到均匀采样，避免复杂的FFmpeg参数问题
      console.warn('Using uniform sampling instead of keyframe detection for better compatibility');
      
      // 首先获取视频时长
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.warn('Could not get video duration, using default 60s');
          resolve(this.generateUniformTimestamps(60, maxFrames));
          return;
        }
        
        const duration = metadata.format.duration || 60;
        resolve(this.generateUniformTimestamps(duration, maxFrames));
      });
    });
  }

  private async detectSceneChanges(videoPath: string, maxFrames: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      // 简化方法：直接回退到均匀采样，避免复杂的FFmpeg参数问题
      console.warn('Using uniform sampling instead of scene detection for better compatibility');
      
      // 首先获取视频时长
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.warn('Could not get video duration, using default 60s');
          resolve(this.generateUniformTimestamps(60, maxFrames));
          return;
        }
        
        const duration = metadata.format.duration || 60;
        resolve(this.generateUniformTimestamps(duration, maxFrames));
      });
    });
  }

  private async extractFrameAtTimestamp(
    videoPath: string,
    timestamp: number,
    outputPath: string,
    quality: number = 90
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // 验证参数
      if (timestamp < 0) {
        reject(new Error(`时间戳不能为负数: ${timestamp}`));
        return;
      }

      if (quality < 1 || quality > 100) {
        console.warn(`质量参数超出范围 (${quality})，将使用默认值90`);
        quality = 90;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error(`帧提取超时 (${timestamp}s) - 可能是视频文件问题或FFmpeg响应慢`));
      }, 30000); // 30秒超时

      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .outputOptions([`-q:v ${Math.floor((100 - quality) / 10)}`]) // 转换质量参数
        .output(outputPath)
        .on('start', (commandLine) => {
          console.error(`FFmpeg命令: ${commandLine}`);
        })
        .on('end', () => {
          clearTimeout(timeoutId);
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeoutId);
          let errorMessage = `帧提取失败 (时间: ${timestamp.toFixed(2)}s): ${err.message}`;
          
          if (err.message.includes('Invalid data')) {
            errorMessage = `在时间点 ${timestamp.toFixed(2)}s 处的视频数据无效，可能超出视频时长或视频损坏`;
          } else if (err.message.includes('No such file')) {
            errorMessage = `视频文件在处理过程中丢失: ${videoPath}`;
          } else if (err.message.includes('Permission denied')) {
            errorMessage = `无权限写入输出文件: ${outputPath}`;
          } else if (err.message.includes('No space left')) {
            errorMessage = `磁盘空间不足，无法保存帧文件: ${outputPath}`;
          }
          
          reject(new Error(errorMessage));
        })
        .run();
    });
  }

  async cleanupFrames(framePaths: string[]): Promise<void> {
    let successCount = 0;
    let failureCount = 0;
    
    console.error(`开始清理 ${framePaths.length} 个临时帧文件...`);
    
    for (const framePath of framePaths) {
      try {
        await fs.unlink(framePath);
        successCount++;
      } catch (error) {
        failureCount++;
        console.warn(`清理文件失败 ${framePath}:`, error);
      }
    }
    
    console.error(`文件清理完成 - 成功: ${successCount}, 失败: ${failureCount}`);
    
    if (failureCount > 0) {
      console.warn(`部分临时文件清理失败，可能需要手动删除`);
    }
  }
}
