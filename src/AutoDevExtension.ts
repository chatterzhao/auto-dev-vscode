import { inject, injectable } from 'inversify';
import { CancellationToken, Disposable, ProgressLocation, TextDocument, window, WorkspaceEdit, workspace, commands } from 'vscode';

import { ConfigurationService } from 'base/common/configuration/configurationService';
import { IExtensionContext } from 'base/common/configuration/context';
import { ContextStateService } from 'base/common/configuration/contextState';
import { WorkspaceFileSystem } from 'base/common/fs';
import { ILanguageServiceProvider } from 'base/common/languages/languageService';
import { logger } from 'base/common/log/log';

import { AutoDocActionExecutor } from './action/autodoc/AutoDocActionExecutor';
import { AutoTestActionExecutor } from './action/autotest/AutoTestActionExecutor';
import { AutoMethodActionExecutor } from './action/autoMethod/AutoMethodActionExecutor';

import {
	registerAutoDevProviders,
	registerCodeLensProvider,
	registerCodeSuggestionProvider,
	registerQuickFixProvider,
	registerRenameAction,
} from './action/ProviderRegister';
import { SystemActionService } from './action/setting/SystemActionService';
import { Catalyser } from './agent/catalyser/Catalyser';
import { LanguageModelsService } from 'base/common/language-models/languageModelsService';
import { ChunkerManager } from './code-search/chunk/ChunkerManager';
import { CodebaseIndexer } from './code-search/indexing/CodebaseIndexer';
import { LanceDbIndex } from './code-search/indexing/LanceDbIndex';
import { DefaultRetrieval } from './code-search/retrieval/DefaultRetrieval';
import { RetrieveOption } from './code-search/retrieval/Retrieval';
import { TeamTermService } from './domain/TeamTermService';
import { NamedElement } from './editor/ast/NamedElement';
import { TreeSitterFileManager } from './editor/cache/TreeSitterFileManager';
import { AutoDevStatusManager } from './editor/editor-api/AutoDevStatusManager';
import { QuickActionService } from './editor/editor-api/QuickAction';
import { VSCodeAction } from './editor/editor-api/VSCodeAction';
import { ChatViewService } from './editor/views/chat/chatViewService';
import { ActionType } from './prompt-manage/ActionType';
import { CustomActionExecutor } from './prompt-manage/custom-action/CustomActionExecutor';
import { VSCodeTemplateLoader } from './prompt-manage/loader/VSCodeTemplateLoader';
import { PromptManager } from './prompt-manage/PromptManager';
import { TeamPromptsBuilder } from './prompt-manage/team-prompts/TeamPromptsBuilder';
import { TemplateContext } from './prompt-manage/template/TemplateContext';
import { TemplateRender } from './prompt-manage/template/TemplateRender';
import { IProjectService } from './ProviderTypes';
import { ToolchainContextManager } from './toolchain-context/ToolchainContextManager';
import { GitHubIssuesService } from './services/GitHubIssuesService';


@injectable()
export class AutoDevExtension {
	private gitHubIssuesService: GitHubIssuesService | null = null;

	// Vscode
	ideAction: VSCodeAction;
	statusBarManager: AutoDevStatusManager;
	quickAction: QuickActionService;
	systemAction: SystemActionService;

	// Ast
	treeSitterFileManager: TreeSitterFileManager;

	// Agents
	catalyser: Catalyser;

	// Toolchain
	promptManager: PromptManager;
	teamPromptsBuilder: TeamPromptsBuilder;
	toolchainContextManager: ToolchainContextManager;

	// Storages
	private vectorStore: LanceDbIndex;
	retrieval: DefaultRetrieval;
	codebaseIndexer: CodebaseIndexer;

	constructor(
		@inject(ConfigurationService)
		public config: ConfigurationService,

		@inject(IExtensionContext)
		public extensionContext: IExtensionContext,

		@inject(ContextStateService)
		public contextState: ContextStateService,

		@inject(LanguageModelsService)
		public lm: LanguageModelsService,

		@inject(ILanguageServiceProvider)
		public lsp: ILanguageServiceProvider,

		@inject(WorkspaceFileSystem)
		public fs: WorkspaceFileSystem,

		@inject(ChatViewService)
		public chat: ChatViewService,

		@inject(IProjectService)
		public teamTerm: TeamTermService,
	) {
		this.ideAction = new VSCodeAction();
		this.statusBarManager = new AutoDevStatusManager();

		const templateLoader = new VSCodeTemplateLoader(this.extensionContext.extensionUri);
		const templateRender = new TemplateRender(templateLoader);

		this.catalyser = new Catalyser(this, this.teamTerm);

		this.teamPromptsBuilder = new TeamPromptsBuilder(this.config);
		this.quickAction = new QuickActionService(
			this.teamPromptsBuilder,
			new CustomActionExecutor(this.lm, templateRender, this.statusBarManager),
			this,
		);

		this.systemAction = new SystemActionService(this);

		this.toolchainContextManager = new ToolchainContextManager();
		this.promptManager = new PromptManager(this.extensionContext, this.toolchainContextManager);

		this.treeSitterFileManager = new TreeSitterFileManager(this.lsp);

		const chunkerManager = new ChunkerManager(this.lsp);

		this.vectorStore = new LanceDbIndex(this.lm, path => this.ideAction.readFile(path), chunkerManager);
		this.codebaseIndexer = new CodebaseIndexer(this.ideAction, this.vectorStore, this.lsp, chunkerManager);
		this.retrieval = new DefaultRetrieval(this.vectorStore);
	}

	/**
	 * @deprecated This is compatible with the object, please do not use
	 */
	get embeddingsProvider() {
		const model = this.lm.resolveEmbeddingModel({});

		return {
			id: model.identifier,
			embed(input: string[]) {
				return model.provideEmbedDocuments(input, {});
			},
		};
	}

	async createCodebaseIndex() {
		const granted = await this.contextState.requestAccessUserCodebasePermission({
			modal: true,
		});

		if (!granted) {
			return;
		}

		this.statusBarManager.setIsLoading('Codebase indexing...');
		this.contextState.setCodebaseIndexingStatus(true);

		try {
			await window.withProgress(
				{
					location: ProgressLocation.Notification,
					title: 'Codebase',
					cancellable: true,
				},
				async (progress, token) => {
					const workspaceDirs = this.ideAction.getWorkspaceDirectories();

					for await (const update of this.codebaseIndexer.refresh(workspaceDirs, token)) {
						progress.report({
							increment: update.progress * 10,
							message: update.desc,
						});
						logger.debug(update.desc);
					}
				},
			);
		} catch (error) {
			logger.error((error as Error).message);
			logger.show(false);
		} finally {
			this.contextState.setCodebaseIndexingStatus(false);
			this.statusBarManager.reset();
		}
	}

	async retrievalCode(query: string, options: RetrieveOption, token?: CancellationToken) {
		const granted = await this.contextState.requestAccessUserCodebasePermission({
			modal: true,
		});

		if (!granted) {
			return [];
		}

		// TODO check if the codebase is indexed?

		const model = this.lm.resolveEmbeddingModel({});

		const results = await this.retrieval.retrieve(
			query,
			this.ideAction,
			{
				id: model.identifier,
				embed(input: string[]) {
					return model.provideEmbedDocuments(input, {}, token);
				},
			},
			options,
		);

		return results;
	}

	generateInstruction(type: ActionType, context: TemplateContext) {
		return this.promptManager.generateInstruction(type, context);
	}

	showChatPanel() {
		this.chat.show();
	}

	newChatSession(prompt?: string) {
		this.chat.newSession(prompt);
		this.chat.show();
	}

	addValueToChatInput(value: string) {
		this.chat.input(value);
		this.chat.show();
	}

	executeAutoDocAction(document: TextDocument, nameElement: NamedElement, edit?: WorkspaceEdit) {
		return new AutoDocActionExecutor(this, document, nameElement, edit).execute();
	}
	executeAutoMethodAction(document: TextDocument, nameElement: NamedElement, edit?: WorkspaceEdit) {
		return new AutoMethodActionExecutor(this, document, nameElement, edit).execute();
	}

	executeAutoTestAction(document: TextDocument, nameElement: NamedElement, edit?: WorkspaceEdit) {
		return new AutoTestActionExecutor(this, document, nameElement, edit).execute();
	}

	executeCustomAction(document: TextDocument, nameElement: NamedElement, edit?: WorkspaceEdit) {
		this.quickAction.show();
	}

	register() {
		return Disposable.from(
			registerCodeSuggestionProvider(this),
			registerCodeLensProvider(this),
			registerQuickFixProvider(this),
			registerAutoDevProviders(this),
			registerRenameAction(this),
		);
	}

	run() {
		// Show notifications
		this.contextState.requestAccessUserCodebasePermission({});
	}

	async getGitHubIssuesService(): Promise<GitHubIssuesService | null> {
		if (!this.gitHubIssuesService) {
			// Use VSCode API
			const config = workspace.getConfiguration('autodev.github');
			let token = config.get<string>('token');
			let account = config.get<string>('account');
			let repositoryName = config.get<string>('repositoryName');
			if (!token || !account || !repositoryName) {
				const action = await window.showErrorMessage(
					'GitHub 配置未设置，设置后可以与 Issues 交互。您想现在设置吗？',
					'Open Settings'
				);
				if (action === 'Open Settings') {
					await commands.executeCommand('workbench.action.openSettings', 'autodev.github');
					// Wait for the user to set the github
					await new Promise<void>(resolve => {
						const disposable = workspace.onDidChangeConfiguration(e => {
							if (e.affectsConfiguration('autodev.github')) {
								disposable.dispose();
								resolve();
							};
						});
					});
					// Re-fetch the token after the user has had a chance to set it
					token = config.get<string>('token');
					account = config.get<string>('account');
					repositoryName = config.get<string>('repositoryName');
				}
				if (!token) {
					window.showErrorMessage('GitHub  is still not set. Cannot interact with Issues.');
					return null;
				}
			}
			this.gitHubIssuesService = new GitHubIssuesService(this.config, this.lm, token!, account!, repositoryName!);
		}
		return this.gitHubIssuesService;
	}

	async readGitHubIssue(issueNumber: number) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}
		return gitHubIssuesService.fetchIssueContent(issueNumber.toString());
	}

	async analyzeGitHubIssueDevelopment(issueNumber: number, developmentIdea: string) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}
		return gitHubIssuesService.analyzeIssueDevelopment(issueNumber, developmentIdea);
	}

	async submitGitHubIssueSummary(issueNumber: number, summary: string) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}
		return gitHubIssuesService.submitIssueSummary(issueNumber, summary);
	}

	async fetchGitHubIssues() {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return [];
		}
		return gitHubIssuesService.fetchIssues();
	}

	async fetchGitHubIssueComments(issueNumber: number) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return [];
		}
		return gitHubIssuesService.fetchIssueComments(issueNumber);
	}

	async addGitHubIssueComment(issueNumber: number, comment: string) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}
		return gitHubIssuesService.addIssueComment(issueNumber, comment);
	}

	async showIssueDetails(issueNumber: number) {
		const gitHubIssuesService = await this.getGitHubIssuesService();
		if (!gitHubIssuesService) {
			return;
		}
		const issueContent = await gitHubIssuesService.fetchIssueContent(issueNumber.toString());
		window.showInformationMessage(issueContent);
	}

}
