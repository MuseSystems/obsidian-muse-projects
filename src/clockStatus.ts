import type { ClockScan } from './clockFlow';
import { openClockRefusalMessage, runClockOut } from './clockFlow';
import type MuseProjectsPlugin from './main';
import { formatElapsed } from './stamps';

/** Status bar view of the vault's open clock. Click runs Clock out. */
export class ClockStatus {
	private readonly item: HTMLElement;
	private timer: number | null = null;
	private mode: 'none' | 'one' | 'many' | 'skipped' = 'none';
	private openStart = 0;
	private openCode = '';
	private unreadCount = 0;

	constructor(private readonly plugin: MuseProjectsPlugin) {
		this.item = plugin.addStatusBarItem();
		this.item.addClass('mod-clickable');
		this.item.style.cursor = 'pointer';
		this.item.hide();
		plugin.registerDomEvent(this.item, 'click', () => {
			void runClockOut(plugin);
		});
		plugin.clockWatch.subscribe((scan) => this.refresh(scan));
	}

	private ensureTimer(on: boolean): void {
		if (on) {
			if (this.timer !== null) {
				return;
			}
			this.timer = window.setInterval(() => this.paintOne(), 1000);
			this.plugin.registerInterval(this.timer);
			return;
		}
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	private oneLabel(): string {
		const elapsed = `${this.openCode} ${formatElapsed(Date.now() - this.openStart)}`;
		if (this.unreadCount < 1) {
			return elapsed;
		}
		return `${elapsed} · ${this.unreadCount} unreadable`;
	}

	private paintOne(): void {
		if (this.mode !== 'one') {
			return;
		}
		this.item.setText(this.oneLabel());
		this.item.setAttr('title', 'Clock out');
	}

	refresh(scan: ClockScan): void {
		this.unreadCount = scan.unreadable.length;
		const open = scan.opens[0];
		if (scan.opens.length === 1 && open) {
			this.mode = 'one';
			this.openStart = open.startInstant;
			this.openCode = open.code;
			this.item.show();
			this.paintOne();
			this.ensureTimer(true);
			return;
		}
		this.ensureTimer(false);
		if (scan.opens.length > 1) {
			this.mode = 'many';
			const text = openClockRefusalMessage(scan.opens);
			this.item.show();
			this.item.setText(
				this.unreadCount > 0 ? `${text} · ${this.unreadCount} unreadable` : text,
			);
			this.item.setAttr('title', text);
			return;
		}
		if (this.unreadCount > 0) {
			this.mode = 'skipped';
			const label =
				this.unreadCount === 1 ? '1 unreadable time list' : `${this.unreadCount} unreadable time lists`;
			this.item.show();
			this.item.setText(label);
			this.item.setAttr('title', label);
			return;
		}
		this.mode = 'none';
		this.item.hide();
		this.item.setText('');
	}
}
