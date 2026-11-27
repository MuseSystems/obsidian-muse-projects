import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	FILE_EXPLORER_CONTEXT_MENU,
	displayFolderPath,
	isSingleExplorerFile,
	isSingleExplorerFolder,
} from '../src/explorerFolder';

test('a file-tree menu is one destination only for a single folder', () => {
	assert.equal(
		isSingleExplorerFolder(FILE_EXPLORER_CONTEXT_MENU, [{ isFolder: true }]),
		true,
	);
	assert.equal(
		isSingleExplorerFolder(FILE_EXPLORER_CONTEXT_MENU, [{ isFolder: false }]),
		false,
	);
	assert.equal(
		isSingleExplorerFolder(FILE_EXPLORER_CONTEXT_MENU, [
			{ isFolder: true },
			{ isFolder: true },
		]),
		false,
	);
	assert.equal(
		isSingleExplorerFolder(FILE_EXPLORER_CONTEXT_MENU, [
			{ isFolder: true },
			{ isFolder: false },
		]),
		false,
	);
	assert.equal(isSingleExplorerFolder('link-context-menu', [{ isFolder: true }]), false);
	assert.equal(isSingleExplorerFolder(FILE_EXPLORER_CONTEXT_MENU, []), false);
});

test('a file-tree menu names one note only for a single file', () => {
	assert.equal(
		isSingleExplorerFile(FILE_EXPLORER_CONTEXT_MENU, [{ isFolder: false }]),
		true,
	);
	assert.equal(
		isSingleExplorerFile(FILE_EXPLORER_CONTEXT_MENU, [{ isFolder: true }]),
		false,
	);
	assert.equal(
		isSingleExplorerFile(FILE_EXPLORER_CONTEXT_MENU, [
			{ isFolder: false },
			{ isFolder: false },
		]),
		false,
	);
	assert.equal(isSingleExplorerFile('link-context-menu', [{ isFolder: false }]), false);
});

test('the vault root displays as /', () => {
	assert.equal(displayFolderPath('/'), '/');
	assert.equal(displayFolderPath(''), '/');
	assert.equal(displayFolderPath('Clients/Acme'), 'Clients/Acme');
});
