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
} from '@ai-review/core';
import type { Language, Finding } from '@ai-review/core';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

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

async function sendDiagnostics(doc: TextDocument): Promise<void> {
  const staticDiags = await runStaticAnalysis(doc);
  const uri = doc.uri;
  connection.sendDiagnostics({ uri, diagnostics: staticDiags });
}

async function sendDiagnosticsWithHallucinated(doc: TextDocument): Promise<void> {
  const staticDiags = await runStaticAnalysis(doc);
  const halluDiags = await runHallucinatedCheck(doc);
  const uri = doc.uri;
  connection.sendDiagnostics({ uri, diagnostics: [...staticDiags, ...halluDiags] });
}

documents.onDidOpen(async (e) => {
  connection.console.log(`Document opened: ${e.document.uri}`);
  await sendDiagnostics(e.document);
});

documents.onDidSave(async (e) => {
  connection.console.log(`Document saved: ${e.document.uri}`);
  await sendDiagnosticsWithHallucinated(e.document);
});

documents.listen(connection);
connection.listen();
