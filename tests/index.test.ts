import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('index module', () => {
  it('package.json version matches server version constant', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    // Anchor to the McpServer constructor so we read the SERVER version specifically.
    const src = readFileSync('src/index.ts', 'utf-8');
    const versionMatch = src.match(/new McpServer\(\{[\s\S]*?version:\s*'([^']+)'/);
    expect(versionMatch).not.toBeNull();
    expect(versionMatch![1]).toBe(pkg.version);
  });

  it('registers all 9 tools', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    const toolRegistrations = src.match(/server\.tool\(/g);
    expect(toolRegistrations).not.toBeNull();
    expect(toolRegistrations!.length).toBe(9);
  });

  it('startup log message matches package version exactly', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain(`MCP server v${pkg.version} running on stdio`);
  });

  it('includes Ollama health check function', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain('checkOllamaHealth');
  });

  it('registers shutdown signal handlers', () => {
    const src = readFileSync('src/index.ts', 'utf-8');
    expect(src).toContain("process.on('SIGINT'");
    expect(src).toContain("process.on('SIGTERM'");
  });
});
