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
  /** Large image for the swipe card. */
  imageUrl: string;
  /** ~600px wide image for grids. */
  thumbUrl: string;
  width: number;
  height: number;
  dominantColor?: string;
  boardId: string;
  boardName: string;
}

export interface DecisionRecord {
  pinId: string;
  decision: Decision;
  at: number;
  pin: Pin;
}

export interface Session {
  id: string;
  /** 'all' or a board id */
  source: string;
  sourceName: string;
  destBoardId: string;
  destBoardName: string;
  createdAt: number;
  updatedAt: number;
  decisions: DecisionRecord[];
}

export type QueueStatus = 'pending' | 'sending' | 'done' | 'failed';

export interface QueueItem {
  id: string;
  sessionId: string;
  pin: Pin;
  destBoardId: string;
  status: QueueStatus;
  attempts: number;
  /** Not sent before this time: the undo grace window. */
  sendAfter: number;
  /** Backoff: not retried before this time. */
  nextAttemptAt: number;
  lastError?: string;
  createdPinId?: string;
  doneAt?: number;
}

export interface AppState {
  sessions: Record<string, Session>;
  queue: QueueItem[];
}

/**
 * Everything the app is able to do to a Pinterest account.
 * Deliberately has no delete / move / update operations.
 */
export interface PinterestService {
  getUser(): Promise<{ username: string }>;
  listBoards(): Promise<Board[]>;
  listBoardPins(board: Board): Promise<Pin[]>;
  createBoard(input: { name: string; description?: string; privacy?: 'PUBLIC' | 'SECRET' }): Promise<Board>;
  /** Copies (re-pins) a pin onto a board. Never modifies the original. */
  savePin(pin: Pin, boardId: string): Promise<{ createdPinId?: string }>;
}
