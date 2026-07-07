import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('version alignment', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

  it('package.json version is semver', () => {
    const parts = pkg.version.split('.');
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(Number.isInteger(Number(part))).toBe(true);
    }
  });

  it('CHANGELOG mentions current version', () => {
    const changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain(pkg.version);
  });

  it('package name is @mcptoolshop/sensor-humor', () => {
    expect(pkg.name).toBe('@mcptoolshop/sensor-humor');
  });

  // cdt-004: the two hardcoded version literals in src/index.ts (the McpServer capability
  // version reported over the wire, and the startup log line) are the strings most likely to
  // drift when package.json is bumped. Assert they track pkg.version so a stale literal turns
  // CI red instead of shipping a wrong version in the MCP handshake.
  it('src/index.ts version literals match package.json', () => {
    const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

    const mcpMatch = indexSrc.match(/version:\s*'([\d.]+)'/);
    expect(mcpMatch, 'McpServer version literal not found in src/index.ts').not.toBeNull();
    expect(mcpMatch![1]).toBe(pkg.version);

    const logMatch = indexSrc.match(/MCP server v([\d.]+) running on stdio/);
    expect(logMatch, 'startup log version string not found in src/index.ts').not.toBeNull();
    expect(logMatch![1]).toBe(pkg.version);
  });
});
