import { Component, computed, HostListener, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DateRange {
  from: string | null;
  to: string | null;
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
})
export class DateRangePickerComponent {
  readonly from = input<string | null>(null);
  readonly to = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  // When true the dropdown opens upward (use inside modals with overflow-y:auto)
  readonly openUp = input<boolean>(false);

  readonly rangeChange = output<DateRange>();

  readonly isOpen = signal(false);
  readonly currentMonth = signal<Date>(new Date());

  readonly calendarDays = computed(() => {
    const d = this.currentMonth();
    const year = d.getFullYear();
    const month = d.getMonth();
    const startDayOfWeek = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotal = new Date(year, month, 0).getDate();
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthTotal - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    for (let i = 1; i <= 42 - days.length; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  });

  readonly monthName = computed(() =>
    this.currentMonth().toLocaleDateString('default', { month: 'long', year: 'numeric' })
  );

  readonly rangeText = computed(() => {
    const from = this.from();
    const to = this.to();
    if (!from && !to) return 'Select date range…';
    const fmt = (s: string) =>
      new Date(s + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric', year: '2-digit' });
    if (from && !to) return `From ${fmt(from)}`;
    if (!from && to) return `Until ${fmt(to)}`;
    return `${fmt(from!)} – ${fmt(to!)}`;
  });

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    const opening = !this.isOpen();
    this.isOpen.set(opening);
    if (opening) {
      const f = this.from();
      this.currentMonth.set(f ? new Date(f + 'T00:00:00') : new Date());
    }
  }

  clearRange(event: MouseEvent): void {
    event.stopPropagation();
    this.rangeChange.emit({ from: null, to: null });
  }

  selectDate(d: Date): void {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const from = this.from();
    const to = this.to();
    if (!from || (from && to)) {
      this.rangeChange.emit({ from: dateStr, to: null });
    } else {
      const fromTime = new Date(from + 'T00:00:00').getTime();
      if (d.getTime() < fromTime) {
        this.rangeChange.emit({ from: dateStr, to: null });
      } else {
        this.rangeChange.emit({ from, to: dateStr });
        this.isOpen.set(false);
      }
    }
  }

  prevMonth(event: MouseEvent): void {
    event.stopPropagation();
    const c = this.currentMonth();
    this.currentMonth.set(new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }

  nextMonth(event: MouseEvent): void {
    event.stopPropagation();
    const c = this.currentMonth();
    this.currentMonth.set(new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }

  setToday(event: MouseEvent): void {
    event.stopPropagation();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    this.rangeChange.emit({ from: `${yyyy}-${mm}-${dd}`, to: null });
    this.currentMonth.set(new Date());
  }

  isStart(d: Date): boolean {
    const from = this.from();
    return !!from && d.getTime() === new Date(from + 'T00:00:00').getTime();
  }

  isEnd(d: Date): boolean {
    const to = this.to();
    return !!to && d.getTime() === new Date(to + 'T00:00:00').getTime();
  }

  isInRange(d: Date): boolean {
    const from = this.from();
    const to = this.to();
    if (!from || !to) return false;
    const t = d.getTime();
    return t > new Date(from + 'T00:00:00').getTime() && t < new Date(to + 'T00:00:00').getTime();
  }

  @HostListener('document:click')
  onOutsideClick(): void {
    this.isOpen.set(false);
  }
}
