import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'python' },
    ],
  };

  client = new LanguageClient(
    'ai-review',
    'ai-review — AI Code Reviewer',
    serverOptions,
    clientOptions,
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.tooltip = 'ai-review — AI Code Reviewer';
  statusBarItem.command = 'ai-review.reviewFile';

  client.onNotification('ai-review/statusUpdate', (params: { type: string; text: string }) => {
    statusBarItem.text = params.text;
    statusBarItem.show();

    if (params.type === 'done') {
      setTimeout(() => {
        statusBarItem.hide();
      }, 3000);
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-review.clearCache', async () => {
      try {
        const result = await client.sendRequest<{ entriesRemoved: number }>('ai-review/clearCache');
        vscode.window.showInformationMessage(
          `ai-review: Cache cleared — ${result.entriesRemoved} entries removed`,
        );
      } catch {
        vscode.window.showErrorMessage('ai-review: Failed to clear cache');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-review.reviewFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      try {
        await client.sendRequest('ai-review/reviewFile', { uri: doc.uri.toString() });
      } catch {
        vscode.window.showErrorMessage('ai-review: Failed to review file');
      }
    }),
  );

  context.subscriptions.push(statusBarItem);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
