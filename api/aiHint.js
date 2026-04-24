import { OpenAI } from 'openai';

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || 'ark-d978f943-e1cf-4c2c-82fa-5ff910f9fbec-2faa0';
const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';

const SYSTEM_PROMPT = `你是一个专业的地理游戏助手，擅长分析街景图片并提供有用的猜测提示。

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng parameters' });
    }

    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&fov=90`;

    const client = new OpenAI({
      apiKey: DOUBAO_API_KEY,
      baseURL: DOUBAO_BASE_URL,
    });

    const response = await client.responses.create({
      model: DOUBAO_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: SYSTEM_PROMPT,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: streetViewUrl,
            },
            {
              type: 'input_text',
              text: '分析这张街景图片，找出3个最有信息量的关键点。对于每个关键点，提供精确的坐标位置和有价值的猜测提示。请以JSON格式返回结果。',
            },
          ],
        },
      ],
    });

    let hints = [];
    const responseText = response.output[0]?.content[0]?.text || '';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        hints = parsed.hints || [];
      }
    } catch (parseError) {
      console.error('Failed to parse Doubao response:', parseError);
      console.error('Raw response:', responseText);
      
      hints = [
        {
          id: 1,
          type: '建筑分析',
          x: 50,
          y: 50,
          title: '建筑风格观察',
          hint: '观察图片中的建筑风格，可以帮助你判断这可能位于哪个地区。不同的文化和气候会孕育不同的建筑特色。',
          confidence: 0.7,
        },
        {
          id: 2,
          type: '植被分析',
          x: 30,
          y: 60,
          title: '植被类型分析',
          hint: '注意观察图片中的树木和植被类型。不同的植被分布与气候带密切相关，可以帮助缩小地理位置范围。',
          confidence: 0.7,
        },
        {
          id: 3,
          type: '道路分析',
          x: 70,
          y: 70,
          title: '道路与交通标识',
          hint: '仔细观察道路标识、交通标志和车辆类型。这些线索可以暗示当地的交通规则和可能的国家/地区。',
          confidence: 0.7,
        },
      ];
    }

    res.status(200).json({
      success: true,
      imageUrl: streetViewUrl,
      hints: hints.slice(0, 3),
    });
  } catch (error) {
    console.error('AI Hint API Error:', error);
    res.status(500).json({
      error: 'Failed to generate AI hints',
      message: error.message,
    });
  }
}
