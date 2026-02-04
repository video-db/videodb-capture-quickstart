import { Tray, Menu, nativeImage, shell } from 'electron';
import * as path from 'path';

interface Recommendation {
  title: string;
  url: string;
  reason: string;
}

export class TrayManager {
  private tray: Tray | null = null;
  private isCapturing = false;
  private recommendations: Recommendation[] = [];
  private hasUnseenRecommendations = false;
  private onStart: () => void;
  private onStop: () => void;
  private onQuit: () => void;
  private onTogglePopup: () => void;

  constructor(callbacks: {
    onStart: () => void;
    onStop: () => void;
    onQuit: () => void;
    onTogglePopup: () => void;
  }) {
    this.onStart = callbacks.onStart;
    this.onStop = callbacks.onStop;
    this.onQuit = callbacks.onQuit;
    this.onTogglePopup = callbacks.onTogglePopup;
  }

  create(): void {
    const icon = this.createIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Resonant');
    this.tray.setTitle('');

    // Any click opens popup
    this.tray.on('click', () => {
      this.markAsSeen();
      this.onTogglePopup();
    });
    this.tray.on('right-click', () => {
      this.markAsSeen();
      this.onTogglePopup();
    });
  }

  private markAsSeen(): void {
    if (this.hasUnseenRecommendations) {
      this.hasUnseenRecommendations = false;
      this.tray?.setTitle('');
    }
  }

  private createIcon(): Electron.NativeImage {
    // Load PNG icon from assets
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    const resized = icon.resize({ width: 32, height: 32 });
    resized.setTemplateImage(true);
    return resized;
  }

  setCapturing(capturing: boolean): void {
    this.isCapturing = capturing;
  }

  setRecommendations(recommendations: Recommendation[]): void {
    this.recommendations = recommendations;
    // Show count when new recommendations arrive
    if (this.tray && recommendations.length > 0) {
      this.hasUnseenRecommendations = true;
      this.tray.setTitle(`(${recommendations.length})`);
    }
    console.log(`[Tray] Updated with ${recommendations.length} recommendations:`);
    recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r.title}`));
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
