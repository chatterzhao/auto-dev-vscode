import { log } from 'console';
import { inject, injectable } from 'inversify';
import { commands, Disposable, type ExtensionContext, l10n, type Memento, type MessageOptions, window } from 'vscode';

import { ConfigurationService } from './configurationService';
import { IExtensionContext } from './context';

@injectable()
export class ContextStateService {
	constructor(
		@inject(ConfigurationService)
		private readonly configService: ConfigurationService,
	) {}

	requestAccessUserCodebasePermission(options: any) {
		// Implementation for requesting access to user codebase
	}
}
