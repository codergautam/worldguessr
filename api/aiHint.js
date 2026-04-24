import { OpenAI } from 'openai';

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || 'ark-d978f943-e1cf-4c2c-82fa-5ff910f9fbec-2faa0';
const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';

const GEO_PROMPT = `你是一个专业的地理游戏助手，擅长根据经纬度坐标分析地理位置并提供有用的猜测提示。

你知道正确答案（该经纬度对应的实际位置），但不能直接说出答案。

根据给定的经纬度坐标 (lat: {lat}, lng: {lng})，请提供3个最有信息量的地理线索提示。

提示信息应该包括但不限于以下类别：
- 气候带：该地区的典型气候类型和特征
- 植被类型：该地区常见的树木和植被
- 建筑风格：当地传统建筑的典型特征
- 地形地貌：山脉、平原、沙漠、沿海等特征
- 时区信息：该时区对应的地区范围
- 邻近国家：可能相邻的国家或地区
- 文化特征：当地的文化和生活习惯
- 常见语言：该地区可能使用的语言
- 典型景观：该地区常见的自然或人文景观
- 半球位置：北半球/南半球判断
- 经度范围：可能位于哪个大陆

每个提示需要包含：
- id: 1-3的数字
- type: 提示类型（如"气候分析"、"植被分析"、"地形分析"等）
- title: 简短的标题
- hint: 详细的提示信息（不能直接说出国家或城市名称）
- confidence: 0-1的置信度值
- x: 20-80之间的数字（用于在图片上显示光圈的水平位置百分比）
- y: 20-80之间的数字（用于在图片上显示光圈的垂直位置百分比）

输出格式要求（必须是严格的JSON格式）：
{
  "hints": [
    {
      "id": 1,
      "type": "气候分析",
      "x": 35,
      "y": 45,
      "title": "热带气候特征",
      "hint": "该地区位于热带地区，全年高温多雨。这种气候条件下常见棕榈树、香蕉树等热带植被。建筑通常采用开放式设计以适应高温潮湿的气候。",
      "confidence": 0.9
    },
    {
      "id": 2,
      "type": "地形分析",
      "x": 65,
      "y": 55,
      "title": "沿海平原地形",
      "hint": "该地区地势较低，靠近海岸线。沿海地区通常可见海滩、红树林等典型海岸景观。建筑风格可能受到海洋文化的影响。",
      "confidence": 0.85
    },
    {
      "id": 3,
      "type": "文化特征",
      "x": 50,
      "y": 65,
      "title": "多元文化交融",
      "hint": "该地区历史上曾受到多种文化的影响，建筑风格可能融合了东西方元素。常见多种语言并存的情况，宗教建筑也可能呈现多样化特征。",
      "confidence": 0.8
    }
  ]
}

重要规则：
1. 必须返回恰好3个提示
2. 提示信息必须是间接的，不能直接说"这是日本"或"这是巴黎"
3. 每个提示应该关注不同的信息类别
4. confidence值应该反映你对该提示的信心程度（0-1）
5. 必须返回严格合法的JSON格式，不能有任何额外的文字说明
6. x和y值应该在20-80之间，这样光圈会显示在屏幕可见区域内

请记住：你知道正确答案，但不能直接说出来。请提供有价值的地理线索来帮助猜测。`;

const IMAGE_ANALYSIS_PROMPT = `你是一个专业的地理游戏助手，擅长分析街景图片并提供有用的猜测提示。

你知道正确答案，但不能直接说出答案。

你的任务是：
1. 分析街景图片，找出3个最有信息量的关键点
2. 每个关键点需要提供精确的坐标位置（相对于图片的百分比坐标）
3. 为每个关键点提供有价值的提示信息，但不能直接给出答案

提示信息应该包括但不限于以下类别：
- 建筑风格：这种建筑常出现在哪些地区/气候/大洲
- 植被情况：植被类型暗示的气候带
- 地形地貌：山脉、平原、沙漠等特征
- 标志牌文字：语言、字体、交通标志类型
- 标志性建筑：著名地标暗示的城市/国家
- 太阳方位：阴影方向暗示的半球
- 车辆类型：左舵/右舵暗示的国家
- 道路标识：交通规则暗示的地区
- 行人穿着：气候、文化暗示
- 广告牌内容：语言、品牌暗示

坐标格式要求：
- x: 0-100的数字，表示从图片左边缘到关键点的水平距离百分比
- y: 0-100的数字，表示从图片上边缘到关键点的垂直距离百分比

输出格式要求（必须是严格的JSON格式）：
{
  "hints": [
    {
      "id": 1,
      "type": "建筑风格",
      "x": 25,
      "y": 60,
      "title": "独特的建筑风格",
      "hint": "这种彩色的外墙装饰和倾斜的屋顶在北欧地区较为常见，特别是在斯堪的纳维亚半岛。这些建筑通常适应寒冷的气候。",
      "confidence": 0.85
    },
    {
      "id": 2,
      "type": "植被情况",
      "x": 70,
      "y": 45,
      "title": "针叶林植被",
      "hint": "图片中的树木是针叶树（如云杉、松树），这类植被主要分布在温带和寒带地区，如欧洲北部、北美和俄罗斯部分地区。",
      "confidence": 0.9
    },
    {
      "id": 3,
      "type": "道路标识",
      "x": 15,
      "y": 75,
      "title": "交通标志牌",
      "hint": "道路上的标志牌采用了欧盟标准的设计，蓝色背景的指示牌在欧洲国家很常见。",
      "confidence": 0.8
    }
  ]
}

重要规则：
1. 必须返回恰好3个提示
2. 提示信息必须是间接的，不能直接说"这是瑞典"或"这是东京"
3. 坐标必须精确，确保光圈能准确指向关键点
4. 每个提示应该关注不同的信息类别
5. confidence值应该反映你对该提示的信心程度（0-1）
6. 必须返回严格合法的JSON格式，不能有任何额外的文字说明`;

async function getGeoHints(lat, lng) {
  const client = new OpenAI({
    apiKey: DOUBAO_API_KEY,
    baseURL: DOUBAO_BASE_URL,
  });

  const prompt = GEO_PROMPT.replace('{lat}', lat).replace('{lng}', lng);

  try {
    const response = await client.responses.create({
      model: DOUBAO_MODEL,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const responseText = response.output[0]?.content[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.hints || [];
    }
  } catch (error) {
    console.error('Geo hint generation failed:', error.message);
  }

  return [];
}

async function getImageAnalysisHints(imageBase64) {
  const client = new OpenAI({
    apiKey: DOUBAO_API_KEY,
    baseURL: DOUBAO_BASE_URL,
  });

  try {
    const response = await client.responses.create({
      model: DOUBAO_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: IMAGE_ANALYSIS_PROMPT,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: imageBase64,
            },
            {
              type: 'input_text',
              text: '分析这张街景图片，找出3个最有信息量的关键点。对于每个关键点，提供精确的坐标位置和有价值的猜测提示。请以JSON格式返回结果。',
            },
          ],
        },
      ],
    });

    const responseText = response.output[0]?.content[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.hints || [];
    }
  } catch (error) {
    console.error('Image analysis failed:', error.message);
  }

  return [];
}

function getDefaultHints(lat, lng) {
  const hemisphere = lat > 0 ? '北半球' : '南半球';
  const climateZone = Math.abs(lat) < 23.5 ? '热带' : Math.abs(lat) < 45 ? '温带' : '寒带';
  
  return [
    {
      id: 1,
      type: '半球分析',
      x: 25,
      y: 50,
      title: '地理位置分析',
      hint: `该地点位于${hemisphere}。太阳在天空中的轨迹会呈现出${hemisphere === '北半球' ? '从东方升起，向南方倾斜，西方落下' : '从东方升起，向北方倾斜，西方落下'}的特征。这可以帮助你判断大致的纬度范围。`,
      confidence: 0.95,
    },
    {
      id: 2,
      type: '气候分析',
      x: 50,
      y: 50,
      title: '气候带特征',
      hint: `根据纬度判断，该地区属于${climateZone}气候带。${climateZone === '热带' ? '这里全年高温，可能有热带雨林或热带草原景观。植被以常绿阔叶树为主。' : climateZone === '温带' ? '这里四季分明，夏季温暖，冬季可能较冷。植被可能是落叶阔叶林或针叶林。' : '这里气候寒冷，冬季漫长，可能有苔原或针叶林景观。'}`,
      confidence: 0.85,
    },
    {
      id: 3,
      type: '经度分析',
      x: 75,
      y: 50,
      title: '时区与地区',
      hint: `经度约为${lng > 0 ? '东经' : '西经'}${Math.abs(lng).toFixed(1)}度。这个经度范围可能位于${lng >= 30 && lng <= 140 ? '欧亚大陆' : lng > -169 && lng < -30 ? '美洲大陆' : '非洲或大洋洲地区'}。请结合其他线索进行判断。`,
      confidence: 0.8,
    },
  ];
}

function parseHints(responseText) {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.hints || [];
    }
  } catch (error) {
    console.error('Failed to parse hints:', error);
  }
  return [];
}

function normalizeHints(hints, defaultLat, defaultLng) {
  if (!hints || hints.length === 0) {
    return getDefaultHints(defaultLat, defaultLng);
  }

  return hints.slice(0, 3).map((hint, index) => ({
    id: hint.id || (index + 1),
    type: hint.type || '地理分析',
    title: hint.title || '地理位置线索',
    hint: hint.hint || '',
    confidence: hint.confidence || 0.7,
    x: hint.x && hint.x >= 0 && hint.x <= 100 ? hint.x : 25 + (index * 25),
    y: hint.y && hint.y >= 0 && hint.y <= 100 ? hint.y : 50,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lat, lng, imageBase64 } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng parameters' });
    }

    let hints = [];
    let usedImageAnalysis = false;
    let usedGeoAnalysis = false;

    if (imageBase64) {
      console.log(`[AI Hint] Using provided image for analysis, lat: ${lat}, lng: ${lng}`);
      usedImageAnalysis = true;
      
      hints = await getImageAnalysisHints(imageBase64);
      
      if (!hints || hints.length === 0) {
        console.log('[AI Hint] Image analysis returned no hints, falling back to geo analysis');
        usedImageAnalysis = false;
        usedGeoAnalysis = true;
        hints = await getGeoHints(lat, lng);
      }
    } else {
      console.log(`[AI Hint] No image provided, using geo analysis, lat: ${lat}, lng: ${lng}`);
      usedGeoAnalysis = true;
      hints = await getGeoHints(lat, lng);
    }

    if (!hints || hints.length === 0) {
      console.log('[AI Hint] Using default hints');
      usedGeoAnalysis = true;
      hints = getDefaultHints(lat, lng);
    }

    hints = normalizeHints(hints, lat, lng);

    res.status(200).json({
      success: true,
      usedImageAnalysis,
      usedGeoAnalysis,
      hints,
    });
  } catch (error) {
    console.error('AI Hint API Error:', error);
    
    const hints = getDefaultHints(req.body?.lat || 0, req.body?.lng || 0);
    
    res.status(200).json({
      success: true,
      usedImageAnalysis: false,
      usedGeoAnalysis: true,
      hints,
      fallback: true,
      message: '使用备用地理分析模式',
    });
  }
}
