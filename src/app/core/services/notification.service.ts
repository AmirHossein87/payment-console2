import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error';
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  readonly toasts = signal<ToastMessage[]>([]);
  private queue: ToastMessage[] = [];
  private isShowing = false;

  showError(message: string): void {
    this.enqueue({ message, type: 'error', duration: 5000 });
  }

  showSuccess(message: string): void {
    this.enqueue({ message, type: 'success', duration: 5000 });
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private enqueue(toast: Omit<ToastMessage, 'id'>): void {
    const message: ToastMessage = { ...toast, id: ++this.nextId };
    this.queue.push(message);
    if (!this.isShowing) {
      this.showNext();
    }
  }

  private showNext(): void {
    if (this.queue.length === 0) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const message = this.queue.shift()!;
    this.toasts.update((list) => [...list, message]);

    setTimeout(() => {
      this.dismiss(message.id);
      this.showNext();
    }, message.duration);
  }
}
