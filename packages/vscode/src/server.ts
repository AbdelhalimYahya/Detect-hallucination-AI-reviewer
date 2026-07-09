import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  Diagnostic,
  Position,
  Range,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createDeprecatedApiRule,
  createSecurityRule,
  checkHallucinatedPackages,
  reviewFileWithAI,
  ResultCache,
} from '@ai-review/core';
import type { Language, Finding, ReviewConfig } from '@ai-review/core';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const cache = new ResultCache();
let cachedApiKey: string | undefined;
let cachedModel: string | undefined;

async function getApiKey(): Promise<string | undefined> {
  if (cachedApiKey !== undefined) return cachedApiKey;
  try {
    const config = await connection.workspace.getConfiguration('ai-review');
    cachedApiKey = config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || undefined;
  } catch {
    cachedApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  }
  return cachedApiKey;
}

async function getModel(): Promise<string> {
  if (cachedModel === undefined) {
    try {
      const config = await connection.workspace.getConfiguration('ai-review');
      cachedModel = config?.model || 'claude-haiku-4-5';
    } catch {
      cachedModel = 'claude-haiku-4-5';
    }
  }
  return cachedModel!;
}

function detectLanguage(uri: string): Language {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'py') return 'python';
  return 'unknown';
}

function findingToDiagnostic(finding: Finding): Diagnostic {
  const severityMap: Record<string, DiagnosticSeverity> = {
    error: DiagnosticSeverity.Error,
    warning: DiagnosticSeverity.Warning,
    info: DiagnosticSeverity.Information,
  };

  const line = Math.max(0, finding.line - 1);
  const col = Math.max(0, finding.column - 1);
  const endLine = finding.endLine ? Math.max(0, finding.endLine - 1) : line;
  const endCol = finding.endColumn ? Math.max(0, finding.endColumn - 1) : col + 1;

  return Diagnostic.create(
    Range.create(Position.create(line, col), Position.create(endLine, endCol)),
    finding.message,
    severityMap[finding.severity] ?? DiagnosticSeverity.Information,
    finding.id,
    'ai-review',
  );
}

connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
  };
});

connection.onDidChangeConfiguration(() => {
  cachedApiKey = undefined;
  cachedModel = undefined;
});

async function runStaticAnalysis(doc: TextDocument): Promise<Diagnostic[]> {
  const language = detectLanguage(doc.uri);
  if (language === 'unknown') return [];

  const content = doc.getText();
  const filePath = doc.uri;

  const deprecatedRule = createDeprecatedApiRule();
  const securityRule = createSecurityRule();

  const deprecatedFindings = deprecatedRule.check(content, filePath, language);
  const securityFindings = securityRule.check(content, filePath, language);

  return [...deprecatedFindings, ...securityFindings].map(findingToDiagnostic);
}

async function runHallucinatedCheck(doc: TextDocument): Promise<Diagnostic[]> {
  const language = detectLanguage(doc.uri);
  if (language === 'unknown') return [];

  const content = doc.getText();
  const filePath = doc.uri;

  try {
    const findings = await checkHallucinatedPackages(content, filePath, language);
    return findings.map(findingToDiagnostic);
  } catch {
    return [];
  }
}

async function sendDiagnosticsWithAI(doc: TextDocument): Promise<void> {
  const staticDiags = await runStaticAnalysis(doc);
  const halluDiags = await runHallucinatedCheck(doc);
  const allStatic = [...staticDiags, ...halluDiags];

  connection.sendDiagnostics({ uri: doc.uri, diagnostics: allStatic });

  const apiKey = await getApiKey();
  if (!apiKey) {
    connection.sendNotification('ai-review/statusUpdate', {
      type: 'disabled',
      text: 'ai-review: No API key — AI checks disabled',
    });
    return;
  }

  connection.sendNotification('ai-review/statusUpdate', {
    type: 'analyzing',
    text: '$(loading~spin) ai-review: Analyzing...',
  });

  const content = doc.getText();
  const cached = await cache.get(content);

  let aiFindings: Finding[];
  if (cached) {
    aiFindings = cached.findings.filter((f) => f.source === 'ai');
    connection.console.log(`Cache hit for ${doc.uri}`);
  } else {
    const language = detectLanguage(doc.uri);
    const model = await getModel();
    const config: ReviewConfig = { anthropicApiKey: apiKey, model };
    const result = await reviewFileWithAI({
      file: doc.uri,
      language,
      content,
      config,
      enabledChecks: { complexity: true, conventions: false },
    });
    aiFindings = result.findings;

    const fileReview = {
      file: doc.uri,
      language,
      findings: aiFindings,
      tokensUsed: result.tokensUsed,
    };
    await cache.set(content, fileReview);
  }

  connection.sendNotification('ai-review/statusUpdate', {
    type: 'done',
    text: '$(check) ai-review: Done',
  });

  const aiDiags = aiFindings.map(findingToDiagnostic);
  connection.sendDiagnostics({ uri: doc.uri, diagnostics: [...allStatic, ...aiDiags] });
}

connection.onRequest('ai-review/clearCache', async (): Promise<{ entriesRemoved: number }> => {
  const stats = await cache.stats();
  await cache.clear();
  return { entriesRemoved: stats.entries };
});

connection.onRequest('ai-review/reviewFile', async (params: { uri: string }): Promise<void> => {
  const doc = documents.get(params.uri);
  if (!doc) return;
  await sendDiagnosticsWithAI(doc);
});

documents.onDidOpen(async (e) => {
  connection.console.log(`Document opened: ${e.document.uri}`);
  const staticDiags = await runStaticAnalysis(e.document);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: staticDiags });
});

documents.onDidSave(async (e) => {
  connection.console.log(`Document saved: ${e.document.uri}`);
  await sendDiagnosticsWithAI(e.document);
});

documents.listen(connection);
connection.listen();
