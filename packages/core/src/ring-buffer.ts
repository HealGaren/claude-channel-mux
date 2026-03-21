export class RingBuffer<T> {
  private buf: T[]
  private head = 0
  private count = 0

  constructor(private capacity: number) {
    this.buf = new Array(capacity)
  }

  push(item: T): void {
    this.buf[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  toArray(): T[] {
    if (this.count < this.capacity) {
      return this.buf.slice(0, this.count)
    }
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)]
  }

  get size(): number {
    return this.count
  }
}
