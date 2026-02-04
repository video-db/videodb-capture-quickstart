import Anthropic from '@anthropic-ai/sdk';
import type { SceneEvent, ArticleRecommendation } from '../types';

export class AnthropicService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async getArticleRecommendations(sceneEvents: SceneEvent[]): Promise<ArticleRecommendation[]> {
    if (sceneEvents.length === 0) {
      return [];
    }

    const activitySummary = sceneEvents
      .map(e => e.text || e.summary || '')
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a smart content curator that recommends interesting and engaging articles based on what the user is currently working on.

Recent screen activity:
${activitySummary}

Based on this activity, recommend 2-3 interesting articles that would resonate with the user. Focus on:

1. **Insightful blog posts** - Thought-provoking articles from platforms like:
   - Medium (https://medium.com/@author/article-slug)
   - Dev.to (https://dev.to/author/article-title)
   - Hacker News top articles (https://news.ycombinator.com)
   - Personal tech blogs

2. **Engaging tutorials** - Not dry documentation, but well-written guides:
   - freeCodeCamp (https://www.freecodecamp.org/news/...)
   - Smashing Magazine (https://www.smashingmagazine.com/...)
   - CSS-Tricks (https://css-tricks.com/...)

3. **YouTube videos** - Educational and entertaining tech content:
   - Fireship, Traversy Media, The Coding Train, 3Blue1Brown, etc.
   - Format: https://www.youtube.com/watch?v=VIDEO_ID

4. **Interesting reads** - Articles that go deeper into topics:
   - Martin Fowler's blog, Kent C. Dodds, Dan Abramov, etc.
   - Research papers explained simply
   - Industry insights and trends

AVOID: Dry official documentation. Focus on content that teaches, inspires, or provides unique insights.

IMPORTANT: Only recommend URLs you are confident actually exist. Use well-known article URLs.

Respond with a JSON array:
[
  {
    "title": "Catchy article title",
    "url": "https://actual-url.com/article",
    "reason": "Brief, engaging reason why this is worth reading"
  }
]

Only output the JSON array, nothing else.`;

    try {
      console.log('[Anthropic] Calling API...');
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      console.log('[Anthropic] API response received');

      const content = response.content[0];
      if (content.type !== 'text') {
        console.log('[Anthropic] Response not text type:', content.type);
        return [];
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[Anthropic] Could not parse JSON from response:', content.text.slice(0, 200));
        return [];
      }

      const recommendations: ArticleRecommendation[] = JSON.parse(jsonMatch[0]);
      console.log(`[Anthropic] Parsed ${recommendations.length} recommendations`);
      return recommendations.slice(0, 3);
    } catch (e: any) {
      console.error('[Anthropic] Error getting recommendations:', e?.message || e);
      if (e?.status) console.error('[Anthropic] Status:', e.status);
      if (e?.error) console.error('[Anthropic] Error details:', e.error);
      return [];
    }
  }
}
