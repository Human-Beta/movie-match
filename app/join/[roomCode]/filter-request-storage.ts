import { pendingFilterSaveSchema, type PendingFilterSave } from "@/lib/room-filters/room-filter-values";

export class FilterRequestStorage {
  private readonly key: string;

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    roomCode: string,
  ) {
    this.key = `movie-match.filter-save.${roomCode}`;
  }

  read(): PendingFilterSave | null {
    const value = this.storage.getItem(this.key);
    if (value === null) {
      return null;
    }
    return pendingFilterSaveSchema.parse(JSON.parse(value));
  }

  persist(request: PendingFilterSave): void {
    this.storage.setItem(this.key, JSON.stringify(request));
  }

  clear(requestId: string): void {
    if (this.read()?.requestId === requestId) {
      this.storage.removeItem(this.key);
    }
  }
}
