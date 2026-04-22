import type { WordCard } from './types';

export class SpacedRepetitionQueue {
  private queue: WordCard[];
  private easyCount = 0;
  private hardCount = 0;
  private totalShown = 0;

  constructor(words: WordCard[], shuffle = true) {
    this.queue = shuffle ? this.shuffleArray([...words]) : [...words];
  }

  get current(): WordCard | null {
    return this.queue[0] ?? null;
  }

  get progress() {
    return {
      remaining: this.queue.length,
      easy: this.easyCount,
      hard: this.hardCount,
      total: this.totalShown,
    };
  }

  markEasy(): WordCard | null {
    this.queue.shift();
    this.easyCount++;
    this.totalShown++;
    return this.current;
  }

  markHard(): WordCard | null {
    const word = this.queue.shift();
    if (word) {
      this.queue.push(word);
      this.hardCount++;
      this.totalShown++;
    }
    return this.current;
  }

  get isDone(): boolean {
    return this.queue.length === 0;
  }

  private shuffleArray<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
