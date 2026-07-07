import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8')) as { version?: string };

function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) || 'manual-or-env-if-available';
  }
}

function createBuildInfo() {
  const buildTime = new Date().toISOString();
  const build = process.env.GITHUB_RUN_ID ? `${buildTime}-${process.env.GITHUB_RUN_ID}` : buildTime;

  return {
    version: packageJson.version || '0.0.0',
    build,
    buildTime,
    commit: process.env.GITHUB_SHA?.slice(0, 7) || getCommitHash(),
    note: 'WonXR WebAR prototype',
  };
}

export default defineConfig(({ command }) => {
  const buildInfo = createBuildInfo();

  return {
    base: command === 'build' ? '/WonXR/' : '/',
    define: {
      __WONXR_BUILD_INFO__: JSON.stringify(buildInfo),
    },
    plugins: [
      {
        name: 'wonxr-version-metadata',
        closeBundle() {
          if (command !== 'build') {
            return;
          }

          const distDir = resolve(rootDir, 'dist');
          if (!existsSync(distDir)) {
            mkdirSync(distDir, { recursive: true });
          }

          writeFileSync(resolve(distDir, 'version.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

          const serviceWorkerPath = resolve(distDir, 'sw.js');
          if (existsSync(serviceWorkerPath)) {
            const serviceWorkerSource = readFileSync(serviceWorkerPath, 'utf-8').replaceAll(
              '__WONXR_SW_VERSION__',
              buildInfo.build,
            );
            writeFileSync(serviceWorkerPath, serviceWorkerSource);
          }
        },
      },
    ],
  };
});
