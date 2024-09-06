import { Octokit } from "@octokit/rest";
import { inject, injectable } from 'inversify';
import { ConfigurationService } from '../base/common/configuration/configurationService';
import { LanguageModelsService } from '../base/common/language-models/languageModelsService';
import { ChatMessageRole } from '../base/common/language-models/languageModels';
import { window, workspace, Disposable, commands } from 'vscode';

@injectable()
export class GitHubIssuesService implements Disposable {
    private octokit: Octokit | null = null;

    constructor(
        @inject(ConfigurationService) private configService: ConfigurationService,
        @inject(LanguageModelsService) private languageModelsService: LanguageModelsService,
        private token: string,
        private account: string,
        private repositoryName: string
    ) { }

    private async initialize() {
        if (!this.octokit) {
            const config = workspace.getConfiguration('autodev.github');
            const token = config.get<string>('token');
            const account = config.get<string>('account');
            const repositoryName = config.get<string>('repositoryName');

            if (token) {
                this.octokit = new Octokit({ auth: token });
            } else {
                console.error('GitHub token is not set in GitHubIssuesService');
                throw new Error('GitHub token is not set. Please set it in the settings.');
            }

            if (!account || !repositoryName) {
                console.error('GitHub account or repository name is not set in GitHubIssuesService');
                throw new Error('GitHub account or repository name is not set. Please set it in the settings.');
            }
        }
    }

    async fetchIssues() {
        try {
            await this.initialize();
            if (!this.octokit) {
                throw new Error('Octokit not initialized');
            }
            const config = workspace.getConfiguration('autodev.github');
            const account = config.get<string>('account');
            const repositoryName = config.get<string>('repositoryName');
            const response = await this.octokit.issues.listForRepo({
                owner: account!,
                repo: repositoryName!,
                state: 'open'
            });
            return response.data.map(issue => ({
                id: issue.id,
                number: issue.number,
                title: issue.title
            }));
        } catch (error) {
            console.error("Error fetching GitHub issues:", error);
            const action = await window.showErrorMessage(
                'Failed to fetch GitHub issues. Please check if the repository has issues or if the GitHub settings are wrong. Do you want to check the GitHub settings?',
                { modal: true },
                'Open Settings',
                'Navigate to GitHub',
                'Try Again Later'
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
                return;
            } else if (action === 'Try Again Later') {
                return;
                // 这里可以添加稍后再试的逻辑
            } else if (action === 'Navigate to GitHub') {
                const url = 'https://github.com';
                const openDefaultBrowser = await import('open');
                await openDefaultBrowser.default(url);
                return;
            }
            return [];
        }
    }

    async fetchIssueComments(issueNumber: number) {
        try {
            await this.initialize();
            if (!this.octokit) {
                throw new Error('Octokit not initialized');
            }
            const config = workspace.getConfiguration('autodev.github');
            const account = config.get<string>('account');
            const repositoryName = config.get<string>('repositoryName');
            const response = await this.octokit.issues.listComments({
                owner: account!,
                repo: repositoryName!,
                issue_number: issueNumber
            });
            return response.data.map(comment => ({
                id: comment.id,
                body: comment.body,
                user: {
                    login: comment.user?.login
                }
            }));
        } catch (error) {
            console.error("Error fetching GitHub issue comments:", error);
            window.showErrorMessage('Failed to fetch issue comments. Please check your connection and try again.');
            return [];
        }
    }

    async addIssueComment(issueNumber: number, comment: string) {
        try {
            await this.initialize();
            if (!this.octokit) {
                throw new Error('Octokit not initialized');
            }
            const config = workspace.getConfiguration('autodev.github');
            const account = config.get<string>('account');
            const repositoryName = config.get<string>('repositoryName');
            await this.octokit.issues.createComment({
                owner: account!,
                repo: repositoryName!,
                issue_number: issueNumber,
                body: comment
            });
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async submitIssueSummary(issueNumber: number, summary: string) {
        return this.addIssueComment(issueNumber, `## Summary\n\n${summary}`);
    }

    async fetchIssueContent(issueNumber: string) {
        try {
            await this.initialize();
            if (!this.octokit) {
                throw new Error('Octokit not initialized');
            }
            const config = workspace.getConfiguration('autodev.github');
            const account = config.get<string>('account');
            const repositoryName = config.get<string>('repositoryName');
            const [issueResponse, commentsResponse] = await Promise.all([
                this.octokit.issues.get({
                    owner: account!,
                    repo: repositoryName!,
                    issue_number: parseInt(issueNumber)
                }),
                this.octokit.issues.listComments({
                    owner: account!,
                    repo: repositoryName!,
                    issue_number: parseInt(issueNumber)
                })
            ]);
            const issueBody = issueResponse.data.body || '';
            const comments = commentsResponse.data.map(comment => comment.body).join('\n\n');
            return `Issue:\n${issueBody}\n\nComments:\n${comments}`;
        } catch (error) {
            console.error("Error fetching issue content:", error);
            return '';
        }
    }

    async analyzeIssueDevelopment(issueNumber: number, developmentIdea: string) {
        const issueContent = await this.fetchIssueContent(issueNumber.toString());
        const analysis = await this.sendToAIAssistant(`Analyze this development idea for the following issue:\n\nIssue and comments:\n${issueContent}\n\nDevelopment idea:\n${developmentIdea}`);
        return analysis;
    }

    public async sendToAIAssistant(content: string) {
        try {
            const response = await this.languageModelsService.chat([
                { role: ChatMessageRole.System, content: 'You are an AI assistant analyzing GitHub issues.' },
                { role: ChatMessageRole.User, content: `Analyze the following GitHub issue:\n\n${content}` }
            ]);
            return typeof response === 'string' ? response : JSON.stringify(response);
        } catch (error) {
            console.error("Error sending to AI assistant:", error);
            return '';
        }
    }

    public async analyzeIssueContent(issueContent: string) {
        return this.sendToAIAssistant(issueContent);
    }

    public dispose() {
        // 清理任何需要释放的资源
        this.octokit = null;
    }
}