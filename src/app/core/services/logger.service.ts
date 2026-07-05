import { environment } from '@environments/environment';

export interface ILogger {
  debug(message: string, ...data: any[]): void;
  info(message: string, ...data: any[]): void;
  success(message: string, ...data: any[]): void;
  warn(message: string, ...data: any[]): void;
  error(message: string, ...data: any[]): void;
  group(label: string): void;
  groupEnd(): void;
  table(data: any): void;
}

interface LevelTheme {
  badge: string;
  text: string;
  icon: string;
}

const THEMES: { [K in 'debug' | 'info' | 'success' | 'warn' | 'error']: LevelTheme } = {
  debug: { badge: 'background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700;font-size:11px', text: 'color:#a5b4fc;font-weight:400;font-size:12px', icon: '🔍' },
  info: { badge: 'background:#0ea5e9;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700;font-size:11px', text: 'color:#7dd3fc;font-weight:400;font-size:12px', icon: 'ℹ️' },
  success: { badge: 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700;font-size:11px', text: 'color:#86efac;font-weight:400;font-size:12px', icon: '✅' },
  warn: { badge: 'background:#f59e0b;color:#1a1a1a;padding:2px 6px;border-radius:3px;font-weight:700;font-size:11px', text: 'color:#fcd34d;font-weight:400;font-size:12px', icon: '⚠️' },
  error: { badge: 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px;font-weight:700;font-size:11px', text: 'color:#fca5a5;font-weight:600;font-size:12px', icon: '🔴' },
};

const SCOPE_STYLE = 'background:#334155;color:#e2e8f0;padding:2px 6px;border-radius:3px;font-weight:600;font-size:11px';
const TIMESTAMP_STYLE = 'color:#64748b;font-size:10px;font-weight:400';

const NOOP = (): void => {};

const NOOP_LOGGER: ILogger = {
  debug: NOOP, info: NOOP, success: NOOP, warn: NOOP, error: NOOP,
  group: NOOP, groupEnd: NOOP, table: NOOP,
};

class RichLogger implements ILogger {
  constructor(private scope: string) {}

  debug(message: string, ...data: any[]) { this.print('debug', message, data); }
  info(message: string, ...data: any[]) { this.print('info', message, data); }
  success(message: string, ...data: any[]) { this.print('success', message, data); }
  warn(message: string, ...data: any[]) { this.print('warn', message, data); }
  error(message: string, ...data: any[]) { this.print('error', message, data); }

  group(label: string) {
    const theme = THEMES.info;
    console.groupCollapsed(`%c${theme.icon} ${label}`, theme.text);
  }

  groupEnd() { console.groupEnd(); }
  table(data: any) { console.table(data); }

  private print(level: string, message: string, data: any[]) {
    const theme = THEMES[level as keyof typeof THEMES];
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log;

    const parts = [`%c${timestamp}`, `%c ${theme.icon} ${level.toUpperCase()} `, `%c${this.scope}`, `%c ${message}`];
    const styles = [TIMESTAMP_STYLE, theme.badge, SCOPE_STYLE, theme.text];

    if (data.length === 0) {
      consoleFn(parts.join(''), ...styles);
    } else if (data.length === 1 && data[0] instanceof Error) {
      consoleFn(parts.join(''), ...styles);
      consoleFn('%c   └─ Stack:', 'color:#94a3b8;font-size:10px', data[0]);
    } else {
      consoleFn(parts.join(''), ...styles, ...data);
    }
  }
}

export class Logger {
  static create(scope: string): ILogger {
    if ((environment as any).enableLogging) return new RichLogger(scope);
    return NOOP_LOGGER;
  }

  static printBootBanner(): void {
    if (!(environment as any).enableLogging) return;
    const bannerStyle = ['color: #38bdf8', 'font-size: 14px', 'font-weight: bold', 'text-shadow: 0 0 5px rgba(56,189,248,0.3)'].join(';');
    const subStyle = 'color: #94a3b8; font-size: 11px;';
    console.log(`%c⚡ Payment Console %c— Dev Mode`, bannerStyle, subStyle);
    console.log('%c   Logging enabled. Stage & production consoles are silent.', 'color: #64748b; font-size: 10px; font-style: italic;');
  }
}
