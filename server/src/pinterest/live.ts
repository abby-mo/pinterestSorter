import { config } from '../config';
import { getAccessToken, refreshAccessToken } from '../auth';
import type { Board, Pin, PinterestService } from '../types';
import { PinterestApiError, SafePinterestClient } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */

type ImageSet = Record<string, { url: string; width: number; height: number } | undefined>;

function toBoard(b: any): Board {
  return {
    id: String(b.id),
    name: b.name ?? 'Untitled board',
    description: b.description ?? '',
    pinCount: Number(b.pin_count ?? 0),
    privacy: b.privacy ?? 'PUBLIC',
    coverUrl: b.media?.image_cover_url ?? undefined,
    thumbnails: b.media?.pin_thumbnail_urls ?? [],
  };
}

export function toPin(p: any, board: Board): Pin | null {
  const images: ImageSet = p.media?.images ?? {};
  const large = images['1200x'] ?? images['600x'] ?? images['400x300'] ?? images['150x150'];
  const grid = images['600x'] ?? large;
  const imageUrl = large?.url ?? p.media?.cover_image_url;
  if (!imageUrl) return null;
  const description: string | undefined = p.description || undefined;
  return {
    id: String(p.id),
    title: p.title || p.alt_text || description?.slice(0, 90) || 'Untitled pin',
    description,
    link: p.link || undefined,
    imageUrl,
    thumbUrl: grid?.url ?? imageUrl,
    width: large?.width || p.media?.width || 600,
    height: large?.height || p.media?.height || 900,
    dominantColor: p.dominant_color || undefined,
    boardId: board.id,
    boardName: board.name,
  };
}

export class LivePinterestService implements PinterestService {
  readonly client = new SafePinterestClient({
    baseUrl: config.apiBase,
    getToken: getAccessToken,
    refreshToken: refreshAccessToken,
  });

  async getUser() {
    const me = await this.client.request<{ username: string }>('GET', '/user_account');
    return { username: me.username };
  }

  async listBoards() {
    const boards: Board[] = [];
    for await (const b of this.client.paginate<any>('/boards')) boards.push(toBoard(b));
    return boards;
  }

  async listBoardPins(board: Board) {
    const pins: Pin[] = [];
    for await (const p of this.client.paginate<any>(`/boards/${board.id}/pins`)) {
      const pin = toPin(p, board);
      if (pin) pins.push(pin);
    }
    return pins;
  }

  async createBoard(input: { name: string; description?: string; privacy?: 'PUBLIC' | 'SECRET' }) {
    const b = await this.client.request<any>('POST', '/boards', {
      body: { name: input.name, description: input.description ?? '', privacy: input.privacy ?? 'PUBLIC' },
    });
    return toBoard(b);
  }

  /**
   * Copy a pin to `boardId`. The original pin and its board are untouched.
   * 1) Re-pin via POST /pins/{id}/save
   * 2) (auto/create) fall back to POST /pins with the same image + link
   */
  async savePin(pin: Pin, boardId: string) {
    if (config.saveStrategy !== 'create') {
      try {
        const r = await this.client.request<any>('POST', `/pins/${pin.id}/save`, {
          body: { board_id: boardId },
        });
        return { createdPinId: r?.id ? String(r.id) : undefined };
      } catch (err) {
        const fallback =
          config.saveStrategy === 'auto' &&
          err instanceof PinterestApiError &&
          [404, 405, 501].includes(err.status);
        if (!fallback) throw err;
      }
    }
    const r = await this.client.request<any>('POST', '/pins', {
      body: {
        board_id: boardId,
        title: pin.title.slice(0, 100),
        description: pin.description?.slice(0, 800),
        link: pin.link,
        media_source: { source_type: 'image_url', url: pin.imageUrl },
      },
    });
    return { createdPinId: r?.id ? String(r.id) : undefined };
  }
}
