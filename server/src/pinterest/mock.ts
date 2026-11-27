import path from 'node:path';
import { config } from '../config';
import { JsonFile } from '../store';
import type { Board, Pin, PinterestService } from '../types';
import { PinterestApiError } from './client';

/** Varied aspect ratios to exercise the masonry grid and card framing. */
const SIZES: Array<[number, number]> = [
  [600, 900], // 2:3 classic pin
  [600, 600], // square
  [540, 960], // 9:16 story
  [600, 750], // 4:5
  [900, 600], // 3:2 landscape
  [500, 1250], // extra tall infographic
  [600, 1000], // 3:5
  [800, 600], // 4:3
];

const COLORS = ['#E8D5C4', '#C9D6DF', '#F2E2D2', '#D8E2DC', '#FFE5D9', '#E4C1F9', '#CDE7BE', '#F6D6AD'];

const SEED_BOARDS: Array<{ id: string; name: string; domain: string; titles: string[] }> = [
  {
    id: 'mock-board-kitchen',
    name: 'Dream Kitchen',
    domain: 'example.com/home',
    titles: [
      'Warm oak cabinets with brass pulls', 'Open shelving styled with ceramics', 'Terrazzo countertop inspiration',
      'Sage green kitchen island', 'Small galley kitchen makeover', 'Hidden pantry door idea',
      'Moody black kitchen with wood accents', 'Farmhouse sink & vintage faucet', 'Breakfast nook with built-in bench',
      'Copper pots hanging rail', 'Arched range hood in plaster', 'Checkerboard floor tiles',
    ],
  },
  {
    id: 'mock-board-travel',
    name: 'Places to Go',
    domain: 'example.com/travel',
    titles: [
      'Sunrise over the Dolomites', 'Hidden beaches of the Algarve', 'Kyoto in autumn',
      'Lisbon tram ride at golden hour', 'Road trip: Pacific Coast Highway', 'Lavender fields in Provence',
      'Northern lights cabin in Norway', 'Santorini blue domes', 'Marrakech riad courtyard',
      'Cherry blossoms in Seoul', 'Patagonia hiking guide', 'Tiny Scottish island village',
    ],
  },
  {
    id: 'mock-board-style',
    name: 'Outfit Ideas',
    domain: 'example.com/style',
    titles: [
      'Oversized blazer + straight jeans', 'Linen set for summer', 'Fall layering with a trench coat',
      'Minimal capsule wardrobe', 'Chunky knit and wide-leg trousers', 'Monochrome cream outfit',
      'Weekend market look', 'Silk slip skirt styling', 'Rainy day outfit formula',
      'Classic white sneakers, 5 ways', 'Color-blocking with red', 'Vintage denim jacket finds',
    ],
  },
  {
    id: 'mock-board-garden',
    name: 'Garden Projects',
    domain: 'example.com/garden',
    titles: [
      'Raised bed layout for beginners', 'DIY trellis from branches', 'Balcony herb garden',
      'Cottage garden planting plan', 'Pollinator-friendly flowers', 'Stone path with creeping thyme',
      'Greenhouse made from old windows', 'Shade garden with ferns', 'Container tomatoes guide',
      'Wildflower meadow lawn swap', 'Rain barrel setup', 'Fairy lights pergola',
    ],
  },
  {
    id: 'mock-board-art',
    name: 'Prints & Posters',
    domain: 'example.com/art',
    titles: [
      'Mid-century botanical prints', 'Gallery wall arrangement guide', 'Abstract shapes in terracotta',
      'Vintage travel posters', 'Line drawing portraits', 'Matisse-inspired cutouts',
      'Japanese woodblock waves', 'Moody still life oil painting', 'Risograph print studio',
      'Minimal mountain poster', 'Hand-lettered quote print', 'Bauhaus exhibition poster',
    ],
  },
];

const FAVORITES: Board = {
  id: 'mock-board-favorites',
  name: 'Favorites',
  description: 'An empty board to sort into',
  pinCount: 0,
  privacy: 'SECRET',
  thumbnails: [],
};

function buildSeedPins() {
  const byBoard = new Map<string, Pin[]>();
  let i = 0;
  for (const b of SEED_BOARDS) {
    byBoard.set(
      b.id,
      b.titles.map((title) => {
        const [w, h] = SIZES[i % SIZES.length];
        const n = i++;
        const seed = `pinsorter-${n}`;
        const thumbH = Math.round((400 * h) / w);
        return {
          id: `mock-${n}`,
          title,
          description: `A sample pin from the “${b.name}” demo board.`,
          link: `https://${b.domain}/${n}`,
          imageUrl: `https://picsum.photos/seed/${seed}/${w}/${h}`,
          thumbUrl: `https://picsum.photos/seed/${seed}/400/${thumbH}`,
          width: w,
          height: h,
          dominantColor: COLORS[n % COLORS.length],
          boardId: b.id,
          boardName: b.name,
        };
      }),
    );
  }
  return byBoard;
}

interface MockDb {
  createdBoards: Board[];
  copies: Record<string, Pin[]>;
}

const delay = (min: number, max: number) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

export class MockPinterestService implements PinterestService {
  private readonly seed = buildSeedPins();
  readonly db = new JsonFile<MockDb>(path.join(config.dataDir, 'mock-db.json'), () => ({
    createdBoards: [],
    copies: {},
  }));

  private baseBoards(): Board[] {
    return [
      ...SEED_BOARDS.map((b) => ({
        id: b.id,
        name: b.name,
        description: '',
        pinCount: 0,
        privacy: 'PUBLIC',
        thumbnails: [],
      })),
      FAVORITES,
    ];
  }

  private pinsFor(boardId: string): Pin[] {
    return [...(this.seed.get(boardId) ?? []), ...(this.db.data.copies[boardId] ?? [])];
  }

  async getUser() {
    return { username: 'demo_user' };
  }

  async listBoards() {
    await delay(120, 300);
    return [...this.baseBoards(), ...this.db.data.createdBoards].map((b) => {
      const pins = this.pinsFor(b.id);
      return { ...b, pinCount: pins.length, coverUrl: pins[0]?.thumbUrl, thumbnails: pins.slice(1, 3).map((p) => p.thumbUrl) };
    });
  }

  async listBoardPins(board: Board) {
    await delay(150, 400);
    return this.pinsFor(board.id);
  }

  async createBoard(input: { name: string; description?: string; privacy?: 'PUBLIC' | 'SECRET' }) {
    await delay(200, 400);
    const board: Board = {
      id: `mock-board-${Date.now().toString(36)}`,
      name: input.name,
      description: input.description ?? '',
      privacy: input.privacy ?? 'PUBLIC',
      pinCount: 0,
      thumbnails: [],
    };
    this.db.data.createdBoards.push(board);
    this.db.save();
    return board;
  }

  async savePin(pin: Pin, boardId: string) {
    await delay(200, 600);
    const board = [...this.baseBoards(), ...this.db.data.createdBoards].find((b) => b.id === boardId);
    if (!board) throw new PinterestApiError(404, 'Board not found');
    if (Math.random() < config.mockFailureRate) {
      if (Math.random() < 0.5) throw new PinterestApiError(429, 'Simulated rate limit (demo mode)', 4000);
      throw new PinterestApiError(503, 'Simulated server hiccup (demo mode)');
    }
    // A new copy on the destination board. The original pin is not touched.
    const copy: Pin = { ...pin, id: `mock-copy-${pin.id}-${Date.now().toString(36)}`, boardId, boardName: board.name };
    (this.db.data.copies[boardId] ??= []).push(copy);
    this.db.save();
    return { createdPinId: copy.id };
  }
}
