/* eslint-disable @typescript-eslint/naming-convention */
import { inject, injectable } from 'inversify';
import _ from 'lodash';
import { createNamedElement } from 'src/code-context/ast/TreeSitterWrapper';
import { setTimeout } from 'timers/promises';
import {
	CancellationToken,
	CancellationTokenSource,
	commands,
	Disposable,
	env,
	l10n,
	Position,
	QuickPickItem,
	Range,
	Uri,
	window,
	WorkspaceEdit,
	ViewColumn,
	workspace
} from 'vscode';

import {
	CMD_CODEASPACE_ANALYSIS,
	CMD_CODEASPACE_KEYWORDS_ANALYSIS,
	CMD_CODEBASE_INDEXING,
	CMD_CODEBASE_RETRIEVAL,
	CMD_CREATE_UNIT_TEST,
	CMD_EXPLAIN_CODE,
	CMD_FEEDBACK,
	CMD_FIX_THIS,
	CMD_GEN_CODE_METHOD_COMPLETIONS,
	CMD_GEN_DOCSTRING,
	CMD_GIT_MESSAGE_COMMIT_GENERATE,
	CMD_NEW_CHAT_SESSION,
	CMD_OPEN_SETTINGS,
	CMD_OPTIMIZE_CODE,
	CMD_QUICK_CHAT,
	CMD_QUICK_FIX,
	CMD_SHOW_CHAT_HISTORY,
	CMD_SHOW_CHAT_PANEL,
	CMD_SHOW_SYSTEM_ACTION,
	CMD_SHOW_TUTORIAL,
	CMD_TERMINAL_DEBUG,
	CMD_TERMINAL_EXPLAIN_SELECTION_CONTEXT_MENU,
	CMD_TERMINAL_SEND_TO,
	CMD_OPEN_GITHUB_ISSUES,
	CMD_READ_GITHUB_ISSUE,
	CMD_ANALYZE_GITHUB_ISSUE_DEVELOPMENT,
	CMD_SUBMIT_GITHUB_ISSUE_SUMMARY,
	CMD_FETCH_GITHUB_ISSUES,
	CMD_FETCH_GITHUB_ISSUE_COMMENTS,
	CMD_ADD_GITHUB_ISSUE_COMMENT,
	CMD_SHOW_ISSUE_DETAILS,
} from 'src/base/common/configuration/configuration';
import { IExtensionContext } from 'base/common/configuration/context';
import { getGitExtensionAPI } from 'base/common/git';
import { logger } from 'base/common/log/log';
import { showErrorMessage } from 'base/common/messages/messages';
import { ChatMessageRole } from 'src/base/common/language-models/languageModels';

import { CommitMessageGenAction } from '../action/devops/CommitMessageGenAction';
import { SystemActionType } from '../action/setting/SystemActionType';
import { AutoDevExtension } from '../AutoDevExtension';
import { TextRange } from '../code-search/scope-graph/model/TextRange';
import { addHighlightedCodeToContext, getInput, showTutorial } from './commandsUtils';

@injectable()
export class CommandsService {
	constructor(
		@inject(IExtensionContext)
		private context: IExtensionContext,

		@inject(AutoDevExtension)
		private autodev: AutoDevExtension,
	) { }

	openSettins() {
		commands.executeCommand('workbench.action.openSettings', {
			query: `@ext:${this.context.extension.id}`,
		});
	}

	feedback() {
		env.openExternal(Uri.parse('https://github.com/unit-mesh/auto-dev-vscode/issues'));
	}

	showSystemAction() {
		this.autodev.systemAction.show();
	}

	async showChatPanel() {
		this.autodev.showChatPanel();
	}

	async quickChat() {
		const chat = this.autodev.chat;
		await chat.show();

		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			await chat.send('focusAutoDevInput', undefined);
			return;
		}

		await addHighlightedCodeToContext(editor, selection, chat);
	}
	newChatSession(prompt?: string) {
		this.autodev.newChatSession(prompt);
	}

	async acceptAllAndComment(issueNumber: number, messages: { role: string, content: string }[]) {
		const gitHubIssuesService = await this.autodev.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}

		const comment = messages.map(msg => `${msg.role === ChatMessageRole.Assistant ? 'AI' : 'Human'}: ${msg.content}`).join('\n\n');
		await gitHubIssuesService.addIssueComment(issueNumber, comment);
	}

	showChatHistory() {
		this.autodev.chat.send('viewHistory');
	}

	async explainCode() {
		const chat = this.autodev.chat;

		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			return;
		}

		await chat.show();

		await addHighlightedCodeToContext(editor, selection, chat);

		await setTimeout(800);
		await chat.input(l10n.t('Explain this code'));
	}

	async optimizeCode() {
		const chat = this.autodev.chat;

		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			return;
		}

		await chat.show();

		await addHighlightedCodeToContext(editor, selection, chat);

		await setTimeout(800);
		await chat.input(l10n.t('Optimize the code'));
	}

	async quickFix(message: string, code: string, edit: boolean) {
		const chat = this.autodev.chat;

		const editor = window.activeTextEditor;
		const language = editor?.document?.languageId;

		await chat.show();

		await setTimeout(600);
		await chat.input(
			`${edit ? '/edit ' : ''}${code}\n\n${l10n.t('How do I fix this problem in the above code?')}:
		\`\`\`${language}
		${message}
		\`\`\`
		`,
		);
	}

	async fixThis() {
		const input = getInput();
		if (!input) {
			return;
		}

		const chat = this.autodev.chat;

		await chat.show();

		await setTimeout(800);
		chat.input(`${l10n.t('I got the following error, can you please help explain how to fix it?')}: ${input}`);
	}

	async generateMethod() {
		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		try {
			const document = editor.document;
			const edit = new WorkspaceEdit();
			const elementBuilder = await createNamedElement(this.autodev.treeSitterFileManager, document);
			const currentLine = editor.selection.active.line;
			const ranges = elementBuilder.getElementForAction(currentLine);

			if (ranges.length === 0) {
				return;
			}

			await this.autodev.executeAutoMethodAction(document, ranges[0], edit);
		} catch (error) {
			logger.error(`Commands error`, error);
			showErrorMessage('Command Call Error');
		}
	}

	async generateDocstring() {
		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		try {
			const document = editor.document;
			const edit = new WorkspaceEdit();
			const elementBuilder = await createNamedElement(this.autodev.treeSitterFileManager, document);
			const currentLine = editor.selection.active.line;
			const ranges = elementBuilder.getElementForAction(currentLine);

			if (ranges.length === 0) {
				return;
			}

			await this.autodev.executeAutoDocAction(document, ranges[0], edit);
		} catch (error) {
			logger.error(`Commands error`, error);
			showErrorMessage('Command Call Error');
		}
	}

	async generateUnitTest() {
		const editor = window.activeTextEditor;
		if (!editor) {
			return;
		}

		try {
			const document = editor.document;
			const elementBuilder = await createNamedElement(this.autodev.treeSitterFileManager, document);

			const selectionStart: number = editor?.selection.start.line ?? 0;
			const selectionEnd: number = editor?.selection.end.line ?? document.lineCount;
			const ranges = elementBuilder.getElementForSelection(selectionStart, selectionEnd);

			if (ranges.length === 0) {
				return;
			}

			await this.autodev.executeAutoTestAction(document, ranges[0], new WorkspaceEdit());
		} catch (error) {
			logger.error(`Commands error`, error);
			showErrorMessage('Command Call Error');
		}
	}

	startCodebaseIndexing() {
		this.autodev.createCodebaseIndex();
	}

	showCodebasePanel() {
		const input = window.createQuickPick<CodebaseResultItem>();

		input.title = 'Codebase Retrieval';
		input.placeholder = 'Enter keywords to retrieve codebase from';
		input.ignoreFocusOut = true;

		input.show();

		let cancellation: CancellationTokenSource | undefined;

		const retrievalCode = async (value: string, token: CancellationToken) => {
			input.busy = true;

			try {
				const result = await this.autodev.retrievalCode(
					value,
					{
						withFullTextSearch: true,
						withSemanticSearch: true,
					},
					token,
				);

				if (token.isCancellationRequested) {
					return;
				}

				input.busy = true;

				input.items = result.map(item => {
					return {
						label: item.name,
						description: item.content.slice(0, 128),
						path: item.path,
						range: item.range,
					};
				});
			} catch (err) {
				showErrorMessage('Error: ' + (err as Error).message);
			} finally {
				input.busy = false;
			}
		};

		input.onDidChangeValue(
			_.debounce((value: string) => {
				cancellation?.cancel();
				cancellation = new CancellationTokenSource();
				retrievalCode(value, cancellation.token);
			}, 500),
		);

		input.onDidChangeSelection(items => {
			const item = items[0];

			window.showTextDocument(Uri.file(item.path), {
				selection: new Range(
					new Position(item.range.start.line, item.range.start.column),
					new Position(item.range.end.line, item.range.end.column),
				),
			});

			input.hide();
		});

		input.onDidHide(() => {
			cancellation?.cancel();
			input.dispose();
		});
	}

	async generateCommitMessage() {
		const api = getGitExtensionAPI();

		if (api) {
			const repo = api.repositories[0];
			await new CommitMessageGenAction(this.autodev).handleDiff(repo.inputBox);
		}
	}

	showTutorial() {
		showTutorial(this.context.extensionUri);
	}

	codespaceCodeAnalysis(input: string) {
		return this.autodev.catalyser.query(input, SystemActionType.SemanticSearchCode);
	}

	codespaceKeywordsAnalysis(input: string) {
		return this.autodev.catalyser.query(input, SystemActionType.SemanticSearchKeyword);
	}

	async explainTerminalSelectionContextMenu() {
		try {
			const terminalContents = await this.autodev.ideAction.getTerminalContents(1);

			await this.autodev.chat.show();

			await setTimeout(600);
			await this.autodev.chat.input(
				`${l10n.t('I got the following error, can you please help explain how to fix it?')}\n\n${terminalContents.trim()}`,
			);
		} catch (e) {
			logger.error((e as Error).message);
		}
	}

	terminalSendTo(text: string) {
		this.autodev.ideAction.runCommand(text).catch(error => {
			window.showErrorMessage((error as Error).message);
		});
	}

	async terminalDebug() {
		const terminalContents = await this.autodev.ideAction.getTerminalContents(1);

		await setTimeout(600);
		await this.autodev.chat.input(
			`${l10n.t('I got the following error, can you please help explain how to fix it?')}\n\n${terminalContents.trim()}`,
		);
	}

	async openGitHubIssues() {
		const gitHubIssuesService = await this.autodev.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}

		const issues = await gitHubIssuesService.fetchIssues();
		const panel = window.createWebviewPanel(
			'githubIssues',
			'GitHub Issues',
			ViewColumn.One,
			{ enableScripts: true }
		);

		panel.webview.html = this.getGitHubIssuesHtml(issues!);
	}

	private getGitHubIssuesHtml(issues: { id: number; number: number; title: string }[]): string {
		const config = workspace.getConfiguration('autodev.github');
		let repositoryName = config.get<string>('repositoryName');
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>GitHub Issues</title>
			</head>
			<body>
				<h1>GitHub Issues for ${repositoryName}</h1>
				<div id="issues-list">
					${issues.map(issue => `
						<div>
							<h3>#${issue.number} ${issue.title}</h3>
							<button onclick="selectIssue(${issue.number})">View</button>
						</div>
					`).join('')}
				</div>
				<script>
					const vscode = acquireVsCodeApi();

					function selectIssue(issueNumber) {
						vscode.postMessage({ command: 'selectIssue', issueNumber: issueNumber });
					}
				</script>
			</body>
			</html>
		`;
	}

	async register() {
		const registeredCommands = await commands.getCommands();

		const registerCommandIfNotExists = (commandId: string, callback: (...args: any[]) => any) => {
			if (!registeredCommands.includes(commandId)) {
				return commands.registerCommand(commandId, callback);
			}
			return undefined;
		};

		// General Commands
		const openSettingsCommand = registerCommandIfNotExists(CMD_OPEN_SETTINGS, this.openSettins.bind(this));
		if (openSettingsCommand) openSettingsCommand.dispose();

		const showTutorialCommand = registerCommandIfNotExists(CMD_SHOW_TUTORIAL, this.showTutorial.bind(this));
		if (showTutorialCommand) showTutorialCommand.dispose();

		const feedbackCommand = registerCommandIfNotExists(CMD_FEEDBACK, this.feedback.bind(this));
		if (feedbackCommand) feedbackCommand.dispose();

		const showSystemActionCommand = registerCommandIfNotExists(CMD_SHOW_SYSTEM_ACTION, this.showSystemAction.bind(this));
		if (showSystemActionCommand) showSystemActionCommand.dispose();

		// Chat Commands
		const showChatPanelCommand = registerCommandIfNotExists(CMD_SHOW_CHAT_PANEL, this.showChatPanel.bind(this));
		if (showChatPanelCommand) showChatPanelCommand.dispose();

		const quickChatCommand = registerCommandIfNotExists(CMD_QUICK_CHAT, this.quickChat.bind(this));
		if (quickChatCommand) quickChatCommand.dispose();

		const newChatSessionCommand = registerCommandIfNotExists(CMD_NEW_CHAT_SESSION, this.newChatSession.bind(this));
		if (newChatSessionCommand) newChatSessionCommand.dispose();

		const showChatHistoryCommand = registerCommandIfNotExists(CMD_SHOW_CHAT_HISTORY, this.showChatHistory.bind(this));
		if (showChatHistoryCommand) showChatHistoryCommand.dispose();

		// ContextMenu Commands
		const explainCodeCommand = registerCommandIfNotExists(CMD_EXPLAIN_CODE, this.explainCode.bind(this));
		if (explainCodeCommand) explainCodeCommand.dispose();

		const optimizeCodeCommand = registerCommandIfNotExists(CMD_OPTIMIZE_CODE, this.optimizeCode.bind(this));
		if (optimizeCodeCommand) optimizeCodeCommand.dispose();

		const fixThisCommand = registerCommandIfNotExists(CMD_FIX_THIS, this.fixThis.bind(this));
		if (fixThisCommand) fixThisCommand.dispose();

		const quickFixCommand = registerCommandIfNotExists(CMD_QUICK_FIX, this.quickFix.bind(this));
		if (quickFixCommand) quickFixCommand.dispose();

		const genDocstringCommand = registerCommandIfNotExists(CMD_GEN_DOCSTRING, this.generateDocstring.bind(this));
		if (genDocstringCommand) genDocstringCommand.dispose();

		const genCodeMethodCompletionsCommand = registerCommandIfNotExists(CMD_GEN_CODE_METHOD_COMPLETIONS, this.generateMethod.bind(this));
		if (genCodeMethodCompletionsCommand) genCodeMethodCompletionsCommand.dispose();

		const createUnitTestCommand = registerCommandIfNotExists(CMD_CREATE_UNIT_TEST, this.generateUnitTest.bind(this));
		if (createUnitTestCommand) createUnitTestCommand.dispose();

		// Codebase Commands
		const codebaseIndexingCommand = registerCommandIfNotExists(CMD_CODEBASE_INDEXING, this.startCodebaseIndexing.bind(this));
		if (codebaseIndexingCommand) codebaseIndexingCommand.dispose();

		const codebaseRetrievalCommand = registerCommandIfNotExists(CMD_CODEBASE_RETRIEVAL, this.showCodebasePanel.bind(this));
		if (codebaseRetrievalCommand) codebaseRetrievalCommand.dispose();

		// Chat Slash Commands
		const codespaceAnalysisCommand = registerCommandIfNotExists(CMD_CODEASPACE_ANALYSIS, this.codespaceCodeAnalysis.bind(this));
		if (codespaceAnalysisCommand) codespaceAnalysisCommand.dispose();

		const codespaceKeywordsAnalysisCommand = registerCommandIfNotExists(CMD_CODEASPACE_KEYWORDS_ANALYSIS, this.codespaceKeywordsAnalysis.bind(this));
		if (codespaceKeywordsAnalysisCommand) codespaceKeywordsAnalysisCommand.dispose();

		// Terminal Commands
		const terminalExplainSelectionContextMenuCommand = registerCommandIfNotExists(CMD_TERMINAL_EXPLAIN_SELECTION_CONTEXT_MENU, this.explainTerminalSelectionContextMenu.bind(this));
		if (terminalExplainSelectionContextMenuCommand) terminalExplainSelectionContextMenuCommand.dispose();

		const terminalSendToCommand = registerCommandIfNotExists(CMD_TERMINAL_SEND_TO, this.terminalSendTo.bind(this));
		if (terminalSendToCommand) terminalSendToCommand.dispose();

		const terminalDebugCommand = registerCommandIfNotExists(CMD_TERMINAL_DEBUG, this.terminalDebug.bind(this));
		if (terminalDebugCommand) terminalDebugCommand.dispose();

		// Other Commands
		const gitMessageCommitGenerateCommand = registerCommandIfNotExists(CMD_GIT_MESSAGE_COMMIT_GENERATE, this.generateCommitMessage.bind(this));
		if (gitMessageCommitGenerateCommand) gitMessageCommitGenerateCommand.dispose();

		// GitHub Commands
		const openGitHubIssuesCommand = registerCommandIfNotExists(CMD_OPEN_GITHUB_ISSUES, this.openGitHubIssues.bind(this));
		if (openGitHubIssuesCommand) openGitHubIssuesCommand.dispose();

		const readGitHubIssueCommand = registerCommandIfNotExists(CMD_READ_GITHUB_ISSUE, this.autodev.readGitHubIssue.bind(this));
		if (readGitHubIssueCommand) readGitHubIssueCommand.dispose();

		const analyzeGitHubIssueDevelopmentCommand = registerCommandIfNotExists(CMD_ANALYZE_GITHUB_ISSUE_DEVELOPMENT, this.autodev.analyzeGitHubIssueDevelopment.bind(this));
		if (analyzeGitHubIssueDevelopmentCommand) analyzeGitHubIssueDevelopmentCommand.dispose();

		const submitGitHubIssueSummaryCommand = registerCommandIfNotExists(CMD_SUBMIT_GITHUB_ISSUE_SUMMARY, this.autodev.submitGitHubIssueSummary.bind(this));
		if (submitGitHubIssueSummaryCommand) submitGitHubIssueSummaryCommand.dispose();

		const fetchGitHubIssuesCommand = registerCommandIfNotExists(CMD_FETCH_GITHUB_ISSUES, this.autodev.fetchGitHubIssues.bind(this));
		if (fetchGitHubIssuesCommand) fetchGitHubIssuesCommand.dispose();

		const fetchGitHubIssueCommentsCommand = registerCommandIfNotExists(CMD_FETCH_GITHUB_ISSUE_COMMENTS, this.autodev.fetchGitHubIssueComments.bind(this));
		if (fetchGitHubIssueCommentsCommand) fetchGitHubIssueCommentsCommand.dispose();

		const addGitHubIssueCommentCommand = registerCommandIfNotExists(CMD_ADD_GITHUB_ISSUE_COMMENT, this.autodev.addGitHubIssueComment.bind(this));
		if (addGitHubIssueCommentCommand) addGitHubIssueCommentCommand.dispose();

		const showIssueDetailsCommand = registerCommandIfNotExists(CMD_SHOW_ISSUE_DETAILS, this.autodev.showIssueDetails.bind(this));
		if (showIssueDetailsCommand) showIssueDetailsCommand.dispose();

		// Codespace Commands
		const codespaceAnalysisCommand2 = registerCommandIfNotExists(CMD_CODEASPACE_ANALYSIS, this.codespaceCodeAnalysis.bind(this));
		if (codespaceAnalysisCommand2) codespaceAnalysisCommand2.dispose();

		const codespaceKeywordsAnalysisCommand2 = registerCommandIfNotExists(CMD_CODEASPACE_KEYWORDS_ANALYSIS, this.codespaceKeywordsAnalysis.bind(this));
		if (codespaceKeywordsAnalysisCommand2) codespaceKeywordsAnalysisCommand2.dispose();
	}
}

interface CodebaseResultItem extends QuickPickItem {
	path: string;
	range: TextRange;
}
