import type { Book } from '../types';

interface BookSelectorProps {
  books: Book[];
  activeBookId: string | null;
  onSelect: (bookId: string) => void;
  onAdd: () => void;
}

export function BookSelector({ books, activeBookId, onSelect, onAdd }: BookSelectorProps) {
  return (
    <section className="book-selector">
      {books.map((book) => (
        <button
          type="button"
          key={book.id}
          className={`tap book-chip ${book.id === activeBookId ? 'active' : ''}`}
          onClick={() => onSelect(book.id)}
        >
          {book.name}
        </button>
      ))}
      <button type="button" className="tap book-add-btn" onClick={onAdd}>
        +
      </button>
    </section>
  );
}
