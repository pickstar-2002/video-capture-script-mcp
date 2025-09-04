import crypto from 'crypto';
import fetch from 'node-fetch';

export interface HunyuanConfig {
  secretId?: string;
  secretKey?: string;
  region?: string;
  endpoint?: string;
}

export interface ImageAnalysisResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TextGenerationResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface Message {
  Role: string;
  Contents?: Array<{
    Type: string;
    Text?: string;
    ImageUrl?: {
      Url: string;
    };
  }>;
  Content?: string;
}

export class HunyuanClient {
  private secretId?: string;
  private secretKey?: string;
  private region: string;
  private endpoint: string;

  constructor(config?: HunyuanConfig) {
    this.secretId = config?.secretId;
    this.secretKey = config?.secretKey;
    this.region = config?.region || 'ap-beijing';
    this.endpoint = config?.endpoint || 'hunyuan.tencentcloudapi.com';
  }

  // 设置凭证的方法
  setCredentials(secretId: string, secretKey: string) {
    this.secretId = secretId;
    this.secretKey = secretKey;
  }

  // 验证凭证是否已设置
  private validateCredentials() {
    if (!this.secretId || !this.secretKey) {
      throw new Error('腾讯云API认证信息未设置。请确保已正确提供 SecretId 和 SecretKey。\n\n获取方式:\n1. 登录腾讯云控制台\n2. 访问 https://console.cloud.tencent.com/cam/capi\n3. 创建或查看现有API密钥');
    }
  }

  private sha256(message: string, secret = ''): string {
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  private sign(secretKey: string | Buffer, message: string): string {
    return crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('hex');
  }

  private getDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async imageToBase64(imagePath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      
      // 检查文件是否存在
      try {
        await fs.access(imagePath);
      } catch {
        throw new Error(`图片文件不存在或无法访问: ${imagePath}`);
      }

      const imageBuffer = await fs.readFile(imagePath);
      
      // 检查文件大小 (腾讯云API对图片大小有限制，通常为5MB)
      const fileSizeMB = imageBuffer.length / (1024 * 1024);
      if (fileSizeMB > 5) {
        throw new Error(`图片文件过大 (${fileSizeMB.toFixed(2)}MB)，请使用小于5MB的图片。文件: ${imagePath}`);
      }

      const base64 = imageBuffer.toString('base64');
      
      // 根据文件扩展名确定MIME类型
      const ext = imagePath.toLowerCase().split('.').pop();
      let mimeType = 'image/jpeg';
      
      switch (ext) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'bmp':
          mimeType = 'image/bmp';
          break;
        case 'gif':
          mimeType = 'image/gif';
          break;
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        default:
          console.warn(`未知的图片格式: ${ext}，将使用 image/jpeg 作为默认MIME类型`);
          mimeType = 'image/jpeg';
      }
      
      console.error(`图片 ${imagePath} 转换完成 - 大小: ${fileSizeMB.toFixed(2)}MB, 格式: ${mimeType}`);
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`图片处理失败 (${imagePath}): ${error.message}`);
      }
      throw new Error(`图片处理失败 (${imagePath}): ${String(error)}`);
    }
  }

  private generateAuthorization(params: any, timestamp: number): string {
    const date = this.getDate(timestamp);
    
    // 步骤 1：拼接规范请求串
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${this.endpoint}\nx-tc-action:chatcompletions\nx-tc-timestamp:${timestamp}\nx-tc-version:2023-09-01\n`;
    const signedHeaders = 'content-type;host;x-tc-action;x-tc-timestamp;x-tc-version';
    const payload = JSON.stringify(params);
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    // 步骤 2：拼接待签名字符串
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/hunyuan/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // 步骤 3：计算签名
    const secretDate = crypto.createHmac('sha256', `TC3${this.secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update('hunyuan').digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    // 步骤 4：拼接 Authorization
    const authorization = `${algorithm} Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return authorization;
  }

  async analyzeImage(imagePath: string, prompt: string = '请描述这张图片的内容。'): Promise<ImageAnalysisResult> {
    try {
      console.error(`开始分析图片: ${imagePath}`);
      this.validateCredentials();
      
      const base64Image = await this.imageToBase64(imagePath);
      
      const params = {
        Model: 'hunyuan-vision',
        Messages: [
          {
            Role: 'user',
            Contents: [
              {
                Type: 'text',
                Text: prompt,
              },
              {
                Type: 'image_url',
                ImageUrl: {
                  Url: base64Image,
                },
              },
            ],
          },
        ],
        Stream: false,
      };

      const timestamp = Math.floor(Date.now() / 1000);
      
      console.error(`发送API请求到腾讯云混元服务 (地域: ${this.region})`);
      
      const authorization = this.generateAuthorization(params, timestamp);

      const response = await fetch(`https://${this.endpoint}/`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': this.endpoint,
          'X-TC-Action': 'ChatCompletions',
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': '2023-09-01',
          'X-TC-Region': this.region,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`腾讯云API请求失败 (HTTP ${response.status} ${response.statusText}):\n${errorText}\n\n请检查:\n1. 网络连接是否正常\n2. API端点是否正确 (${this.endpoint})\n3. 服务地域设置 (${this.region})`);
      }

      const result = await response.json() as any;
      
      if (result.Response?.Error) {
        const errorCode = result.Response.Error.Code;
        const errorMessage = result.Response.Error.Message;
        const requestId = result.Response.RequestId;
        
        // 提供更友好的错误信息
        let detailedError = `腾讯云混元API错误:\n- 错误代码: ${errorCode}\n- 错误信息: ${errorMessage}\n- 请求ID: ${requestId}\n\n`;
        
        if (errorCode === 'FailedOperation.ServiceNotActivated') {
          detailedError += `解决方案:\n1. 访问腾讯云控制台开通混元大模型服务\n2. 开通地址: https://console.cloud.tencent.com/hunyuan\n3. 确保账户余额充足\n4. 检查服务地域设置 (当前: ${this.region})`;
        } else if (errorCode === 'AuthFailure.SignatureFailure') {
          detailedError += `解决方案:\n1. 检查SecretId是否正确: ***${this.secretId?.slice(-4)}\n2. 检查SecretKey是否正确且未过期\n3. 确认API密钥权限是否包含混元服务\n4. 检查系统时间是否准确`;
        } else if (errorCode === 'LimitExceeded.QPSLimitExceeded' || errorCode === 'LimitExceeded') {
          detailedError += `解决方案:\n1. 当前调用频率过高，请稍后重试\n2. 考虑增加请求间隔时间\n3. 升级API调用限制配额\n4. 实施请求队列机制`;
        } else if (errorCode === 'InvalidParameter') {
          detailedError += `解决方案:\n1. 检查输入参数格式是否正确\n2. 确认图片格式是否支持 (支持: JPG, PNG, BMP, WEBP)\n3. 检查图片大小是否超限 (最大5MB)\n4. 验证提示词长度是否合适`;
        } else if (errorCode === 'ResourceNotFound') {
          detailedError += `解决方案:\n1. 检查模型名称是否正确 (hunyuan-vision)\n2. 确认服务地域是否支持该功能\n3. 验证账户是否有相应权限`;
        } else {
          detailedError += `解决方案:\n1. 记录请求ID: ${requestId}\n2. 联系腾讯云技术支持\n3. 提供详细的错误信息和使用场景`;
        }
        
        throw new Error(detailedError);
      }

      const choice = result.Response?.Choices?.[0];
      if (!choice) {
        throw new Error('腾讯云混元API响应异常：未返回有效的分析结果。请稍后重试或联系技术支持。');
      }

      const analysisResult = {
        content: choice.Message.Content,
        usage: {
          promptTokens: result.Response.Usage.PromptTokens,
          completionTokens: result.Response.Usage.CompletionTokens,
          totalTokens: result.Response.Usage.TotalTokens,
        },
      };

      console.error(`图片分析完成 - Token使用: ${analysisResult.usage.totalTokens} (提示: ${analysisResult.usage.promptTokens}, 回复: ${analysisResult.usage.completionTokens})`);

      return analysisResult;
    } catch (error) {
      console.error(`图片分析失败 (${imagePath}):`, error);
      throw error;
    }
  }

  async analyzeImageBatch(imagePaths: string[], prompt: string = '请描述这张图片的内容。'): Promise<ImageAnalysisResult[]> {
    const results: ImageAnalysisResult[] = [];
    const totalImages = imagePaths.length;
    
    console.error(`开始批量分析 ${totalImages} 张图片`);
    
    // 为了控制成本和避免API限制，我们串行处理图片
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      try {
        console.error(`分析进度: ${i + 1}/${totalImages} - ${imagePath}`);
        const result = await this.analyzeImage(imagePath, prompt);
        results.push(result);
        
        // 添加延迟以避免API限制 (QPS控制)
        if (i < imagePaths.length - 1) {
          console.error(`等待1秒以避免API限制...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`图片分析失败 ${imagePath}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          content: `❌ 分析失败: ${errorMessage}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
        
        // 即使单个图片失败，也继续处理其他图片
        console.error(`跳过失败的图片，继续处理剩余图片...`);
      }
    }
    
    const successCount = results.filter(result => !result.content.startsWith('❌')).length;
    const totalTokens = results.reduce((sum, result) => sum + result.usage.totalTokens, 0);
    
    console.error(`批量分析完成 - 成功: ${successCount}/${totalImages}, 总Token使用: ${totalTokens}`);
    
    return results;
  }

  async analyzeImagesInSingleRequest(imagePaths: string[], prompt: string = '请描述这些图片的内容。'): Promise<ImageAnalysisResult> {
    try {
      this.validateCredentials();
      
      // 最多支持4张图片，以控制成本
      const limitedPaths = imagePaths.slice(0, 4);
      const base64Images = await Promise.all(
        limitedPaths.map(path => this.imageToBase64(path))
      );
      
      const contents = [
        {
          Type: 'text',
          Text: prompt,
        },
        ...base64Images.map(base64 => ({
          Type: 'image_url',
          ImageUrl: {
            Url: base64,
          },
        })),
      ];

      const params = {
        Model: 'hunyuan-vision',
        Messages: [
          {
            Role: 'user',
            Contents: contents,
          },
        ],
        Stream: false,
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const authorization = this.generateAuthorization(params, timestamp);

      const response = await fetch(`https://${this.endpoint}/`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': this.endpoint,
          'X-TC-Action': 'ChatCompletions',
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': '2023-09-01',
          'X-TC-Region': this.region,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as any;
      
      if (result.Response?.Error) {
        const errorCode = result.Response.Error.Code;
        const errorMessage = result.Response.Error.Message;
        
        // 提供更友好的错误信息
        if (errorCode === 'FailedOperation.ServiceNotActivated') {
          throw new Error(`腾讯云混元大模型服务未开通。请访问腾讯云控制台开通混元大模型服务：https://console.cloud.tencent.com/hunyuan`);
        } else if (errorCode === 'AuthFailure.SignatureFailure') {
          throw new Error(`API认证失败，请检查SecretId和SecretKey是否正确：${errorMessage}`);
        } else if (errorCode === 'LimitExceeded') {
          throw new Error(`API调用频率超限，请稍后重试：${errorMessage}`);
        } else if (errorCode === 'InvalidParameter') {
          throw new Error(`请求参数错误：${errorMessage}`);
        } else {
          throw new Error(`Hunyuan API Error: ${errorCode} - ${errorMessage}`);
        }
      }

      const choice = result.Response?.Choices?.[0];
      if (!choice) {
        throw new Error('No response from Hunyuan API');
      }

      return {
        content: choice.Message.Content,
        usage: {
          promptTokens: result.Response.Usage.PromptTokens,
          completionTokens: result.Response.Usage.CompletionTokens,
          totalTokens: result.Response.Usage.TotalTokens,
        },
      };
    } catch (error) {
      console.error('Error analyzing images in single request:', error);
      throw error;
    }
  }

  async generateText(prompt: string, model: string = 'hunyuan-lite'): Promise<TextGenerationResult> {
    try {
      console.error(`开始生成文本内容，使用模型: ${model}`);
      this.validateCredentials();
      
      const params = {
        Model: model,
        Messages: [
          {
            Role: 'user',
            Content: prompt,
          },
        ],
        Stream: false,
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const authorization = this.generateAuthorization(params, timestamp);

      console.error(`发送文本生成请求到腾讯云混元服务 (地域: ${this.region})`);

      const response = await fetch(`https://${this.endpoint}/`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': this.endpoint,
          'X-TC-Action': 'ChatCompletions',
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': '2023-09-01',
          'X-TC-Region': this.region,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`腾讯云API请求失败 (HTTP ${response.status} ${response.statusText}):
${errorText}

请检查:
1. 网络连接是否正常
2. API端点是否正确 (${this.endpoint})
3. 服务地域设置 (${this.region})`);
      }

      const result = await response.json() as any;
      
      if (result.Response?.Error) {
        const errorCode = result.Response.Error.Code;
        const errorMessage = result.Response.Error.Message;
        const requestId = result.Response.RequestId;
        
        // 提供更友好的错误信息
        let detailedError = `腾讯云混元API错误:
- 错误代码: ${errorCode}
- 错误信息: ${errorMessage}
- 请求ID: ${requestId}

`;
        
        if (errorCode === 'FailedOperation.ServiceNotActivated') {
          detailedError += `解决方案:
1. 访问腾讯云控制台开通混元大模型服务
2. 开通地址: https://console.cloud.tencent.com/hunyuan
3. 确保账户余额充足
4. 检查服务地域设置 (当前: ${this.region})`;
        } else if (errorCode === 'AuthFailure.SignatureFailure') {
          detailedError += `解决方案:
1. 检查SecretId是否正确: ***${this.secretId?.slice(-4)}
2. 检查SecretKey是否正确且未过期
3. 确认API密钥权限是否包含混元服务
4. 检查系统时间是否准确`;
        } else if (errorCode === 'LimitExceeded.QPSLimitExceeded' || errorCode === 'LimitExceeded') {
          detailedError += `解决方案:
1. 当前调用频率过高，请稍后重试
2. 考虑增加请求间隔时间
3. 升级API调用限制配额
4. 实施请求队列机制`;
        } else if (errorCode === 'InvalidParameter') {
          detailedError += `解决方案:
1. 检查输入参数格式是否正确
2. 确认提示词长度是否合适
3. 验证模型名称是否正确
4. 检查请求格式是否符合API规范`;
        } else {
          detailedError += `解决方案:
1. 记录请求ID: ${requestId}
2. 联系腾讯云技术支持
3. 提供详细的错误信息和使用场景`;
        }
        
        throw new Error(detailedError);
      }

      const choice = result.Response?.Choices?.[0];
      if (!choice) {
        throw new Error('腾讯云混元API响应异常：未返回有效的生成结果。请稍后重试或联系技术支持。');
      }

      const textResult = {
        content: choice.Message.Content,
        usage: {
          promptTokens: result.Response.Usage.PromptTokens,
          completionTokens: result.Response.Usage.CompletionTokens,
          totalTokens: result.Response.Usage.TotalTokens,
        },
      };

      console.error(`文本生成完成 - Token使用: ${textResult.usage.totalTokens} (提示: ${textResult.usage.promptTokens}, 回复: ${textResult.usage.completionTokens})`);

      return textResult;
    } catch (error) {
      console.error(`文本生成失败:`, error);
      throw error;
    }
  }
}
