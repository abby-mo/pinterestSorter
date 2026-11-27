export type Mode = 'mock' | 'live';
export type Decision = 'save' | 'skip';

export interface Board {
  id: string;
  name: string;
  description: string;
  pinCount: number;
  privacy: string;
  coverUrl?: string;
  thumbnails: string[];
}

export interface Pin {
  id: string;
  title: string;
  description?: string;
  link?: string;
  imageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
  dominantColor?: string;
  boardId: string;
  boardName: string;
}

export interface SessionMeta {
  id: string;
  source: string;
  sourceName: string;
  destBoardId: string;
  destBoardName: string;
  createdAt: number;
  updatedAt: number;
  saved: number;
  skipped: number;
}

export interface Status {
  mode: Mode;
  hasCredentials: boolean;
  connected: boolean;
  username: string | null;
  saveDelayMs: number;
}

export interface QueueSummary {
  pending: number;
  sending: number;
  done: number;
  failed: number;
  retrying: number;
  nextRetryAt: number | null;
  failures: Array<{ id: string; pinTitle: string; error?: string; attempts: number }>;
}

export type SaveStatus = 'pending' | 'sending' | 'done' | 'failed';
