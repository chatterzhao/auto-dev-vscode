// for Dependency Injection with InversifyJS
import 'reflect-metadata';
import { type ExtensionContext, commands, window, workspace } from 'vscode';

import { ConfigurationService } from 'base/common/configuration/configurationService';
import { IExtensionContext, IExtensionUri } from 'base/common/configuration/context';
import { ContextStateService } from 'base/common/configuration/contextState';
import { WorkspaceFileSystem } from 'base/common/fs';
import { InstantiationService } from 'base/common/instantiation/instantiationService';
import { ILanguageServiceProvider, LanguageServiceProvider } from 'base/common/languages/languageService';
import { log, logger } from 'base/common/log/log';

import { AutoDevExtension } from './AutoDevExtension';
import { LanguageModelsService } from './base/common/language-models/languageModelsService';
import { CommandsService } from './commands/commandsService';
import { ChatViewService } from './editor/views/chat/chatViewService';
import { GitHubIssuesService } from './services/GitHubIssuesService';
import { Container } from 'inversify';

(globalThis as any).self = globalThis;

export async function activate(context: IExtensionContext) {
	const container = new Container();
	container.bind(IExtensionContext).toConstantValue(context);
	container.bind(AutoDevExtension).to(AutoDevExtension);
	container.bind(CommandsService).to(CommandsService);
	container.bind(ConfigurationService).to(ConfigurationService);
	container.bind(ContextStateService).to(ContextStateService); // 添加这一行
	container.bind(LanguageModelsService).to(LanguageModelsService); // 添加这一行
	container.bind(ILanguageServiceProvider).to(LanguageServiceProvider); // 添加这一行
	container.bind(WorkspaceFileSystem).to(WorkspaceFileSystem); // 添加这一行

	const commandsService = container.get(CommandsService);
	await commandsService.register();
}

function getGitHubIssuesHtml(): string {
	return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>GitHub Issues</title>
			</head>
			<body>
				<h1>GitHub Issues</h1>
				<div id="issues-list"></div>
				<script>
					// 声明 acquireVsCodeApi 函数类型
					// declare function acquireVsCodeApi(): any;
					
					const vscode = acquireVsCodeApi();
					
					// 请求 issues 列表
					vscode.postMessage({ command: 'fetchIssues' });

					// 监听来自扩展的消息
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'issuesFetched':
								displayIssues(message.issues);
								break;
						}
					});

					function displayIssues(issues) {
						const issuesList = document.getElementById('issues-list');
						issuesList.innerHTML = issues.map(issue => 
							\`<div>
								<h3>#\${issue.number} \${issue.title}</h3>
								<button onclick="selectIssue(\${issue.number})">View</button>
							</div>\`
						).join('');
					}

					function selectIssue(issueNumber) {
						vscode.postMessage({ command: 'selectIssue', issueNumber: issueNumber });
					}
				</script>
			</body>
			</html>
	`;
}

export function deactivate() { }
