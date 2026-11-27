import { App, Modal, Setting } from 'obsidian';

export function confirmAction(
	app: App,
	title: string,
	message: string,
	labels?: { confirm?: string; cancel?: string },
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new (class extends Modal {
			private settled = false;

			onOpen(): void {
				this.setTitle(title);
				this.contentEl.createEl('p', { text: message });

				new Setting(this.contentEl)
					.addButton((btn) =>
						btn.setButtonText(labels?.cancel ?? 'Cancel').onClick(() => {
							this.finish(false);
						}),
					)
					.addButton((btn) =>
						btn
							.setButtonText(labels?.confirm ?? 'Confirm')
							.setCta()
							.onClick(() => {
								this.finish(true);
							}),
					);
			}

			onClose(): void {
				if (!this.settled) {
					this.settled = true;
					resolve(false);
				}
			}

			private finish(result: boolean): void {
				if (this.settled) {
					return;
				}
				this.settled = true;
				resolve(result);
				this.close();
			}
		})(app);

		modal.open();
	});
}

/** Blocking warning; resolves when the operator acknowledges. */
export function alertAction(
	app: App,
	title: string,
	message: string,
): Promise<void> {
	return new Promise((resolve) => {
		const modal = new (class extends Modal {
			private settled = false;

			onOpen(): void {
				this.setTitle(title);
				this.contentEl.createEl('p', { text: message });

				new Setting(this.contentEl).addButton((btn) =>
					btn
						.setButtonText('OK')
						.setCta()
						.onClick(() => {
							this.finish();
						}),
				);
			}

			onClose(): void {
				if (!this.settled) {
					this.settled = true;
					resolve();
				}
			}

			private finish(): void {
				if (this.settled) {
					return;
				}
				this.settled = true;
				resolve();
				this.close();
			}
		})(app);

		modal.open();
	});
}
