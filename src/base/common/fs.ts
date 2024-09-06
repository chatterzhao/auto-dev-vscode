import { inject, injectable } from 'inversify';
import { promises as fs } from 'fs';
import { Uri, workspace } from 'vscode';

@injectable()
export class WorkspaceFileSystem {
	constructor() {}

	async readFile(path: string): Promise<string> {
		const uri = Uri.file(path);
		const data = await workspace.fs.readFile(uri);
		return Buffer.from(data).toString('utf8');
	}

	async writeFile(path: string, content: string): Promise<void> {
		const uri = Uri.file(path);
		const data = Buffer.from(content, 'utf8');
		await workspace.fs.writeFile(uri, data);
	}

	async deleteFile(path: string): Promise<void> {
		const uri = Uri.file(path);
		await workspace.fs.delete(uri);
	}

	async createDirectory(path: string): Promise<void> {
		const uri = Uri.file(path);
		await workspace.fs.createDirectory(uri);
	}
}
