import { scanClocks, type ClockScan } from './clockFlow';
import type MuseProjectsPlugin from './main';

const REFRESH_MS = 50;

/**
 * One vault clock scan, shared by the status bar, task controls, and menus.
 * Metadata and vault events in the same burst become one scan.
 */
export class ClockWatch {
	private scan: ClockScan | null = null;
	private timer: number | null = null;
	private readonly listeners = new Set<(scan: ClockScan) => void>();

	constructor(private readonly plugin: MuseProjectsPlugin) {}

	start(): void {
		const kick = () => this.schedule();
		this.plugin.registerEvent(this.plugin.app.metadataCache.on('changed', kick));
		this.plugin.registerEvent(this.plugin.app.metadataCache.on('resolved', kick));
		this.plugin.registerEvent(this.plugin.app.vault.on('delete', kick));
		this.plugin.registerEvent(this.plugin.app.vault.on('rename', kick));
		this.plugin.register(() => this.stop());
		this.plugin.app.workspace.onLayoutReady(() => this.publish());
	}

	subscribe(listener: (scan: ClockScan) => void): void {
		this.listeners.add(listener);
		if (this.scan) listener(this.scan);
	}

	/** Last scan. A pending refresh runs first. Computes one when nothing has run yet. */
	current(): ClockScan {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
			this.publish();
		}
		if (!this.scan) {
			this.scan = this.compute();
		}
		return this.scan;
	}

	private schedule(): void {
		if (this.timer !== null) {
			return;
		}
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.publish();
		}, REFRESH_MS);
	}

	private publish(): void {
		this.scan = this.compute();
		for (const listener of [...this.listeners]) {
			listener(this.scan);
		}
	}

	private compute(): ClockScan {
		return scanClocks(this.plugin.app, this.plugin.settings.projectTemplatesPath);
	}

	private stop(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.listeners.clear();
	}
}
