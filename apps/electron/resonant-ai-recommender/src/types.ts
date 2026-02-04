export interface SceneEvent {
  text: string;
  summary?: string;
  timestamp: number;
}

export interface ArticleRecommendation {
  title: string;
  url: string;
  reason: string;
}

export interface VideoDBConfig {
  apiKey: string;
  collectionId: string;
  baseUrl: string;
}

export interface AppConfig {
  videodb: VideoDBConfig;
  anthropicApiKey: string;
  recommendationInterval: number;
}
