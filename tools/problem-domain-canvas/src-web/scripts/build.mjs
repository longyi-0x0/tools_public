/**
 * 构建：`node scripts/build.mjs`。
 *
 * 两步都在进程内完成，不起子进程转译：
 *   1. TypeScript 编译器 API 把 src/ 编成 ESM（.build/，import 里的 .ts 自动改写成 .js）；
 *   2. Vite 的 build() 打包 .build/ 到 ../site，base "./"、清空 outDir、esbuild: false。
 *
 * 为什么不直接 `vite build`：Vite 用 esbuild 的**服务进程**转译 TSX（进程靠管道 stdio 通信），
 * 受限沙箱禁止带管道 stdio 的子进程（spawn EPERM），直出必然失败。
 * 本脚本仍产出 Vite 的静态产物（相对路径、无 .map），发布脚本只拷 site/。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const buildDir = path.join(webRoot, '.build');
const siteDir = path.resolve(webRoot, '..', 'site');

// Vite 在 Windows 上会 `exec("net use")` 探测网络盘，同属「带管道 stdio 的子进程」，
// 在受限沙箱里抛 spawn EPERM。这条探测只影响 realpath 快慢，直接告诉它「没有网络盘」。
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
childProcess.exec = (_command, options, callback) => {
  const done = typeof options === 'function' ? options : callback;
  if (typeof done === 'function') done(null, '', '');
  return { on() { return this; }, kill() {} };
};

const { build } = await import('vite');

/**
 * Vite 的 `vite:define` 插件在代码里匹配到 `process.env` / `import.meta.env` 就会调 esbuild 做替换（又会 spawn EPERM）。
 * 这里在它之前把两种写法都换成字面量（我们自己的代码不用这些变量，`import.meta.env` 由 SPK1 试接的
 * Excalidraw 依赖 jotai 引入），它便提前返回。只用 Vite/Rollup 的插件钩子，不改依赖、不伪造产物。
 */
const processEnvShim = {
  name: 'pdc-process-env-shim',
  enforce: 'pre',
  transform(code) {
    if (!code.includes('process.env') && !code.includes('import.meta.env')) return null;
    return {
      code: code
        .replaceAll('process.env.NODE_ENV', '"production"')
        .replaceAll('process.env', '({})')
        .replaceAll('import.meta.env.MODE', '"production"')
        .replaceAll('import.meta.env', '({MODE:"production"})'),
      map: null,
    };
  },
};

function reportDiagnostics(diagnostics) {
  const host = {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => webRoot,
    getNewLine: () => '\n',
  };
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
}

/** 1. tsc 进程内编译（库调用，不起子进程）。 */
function compileToJs() {
  fs.rmSync(buildDir, { recursive: true, force: true });

  const configPath = path.join(webRoot, 'tsconfig.build.json');
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    reportDiagnostics([read.error]);
    process.exit(1);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, webRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    reportDiagnostics(errors);
    process.exit(1);
  }
  fs.cpSync(path.join(webRoot, 'src', 'styles'), path.join(buildDir, 'styles'), { recursive: true });
}

/** 2. index.html 指向编译后的入口（源码 index.html 仍指向 /src/main.tsx 供 dev 用）。 */
function prepareHtml() {
  const source = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  const html = source.replace('src="/src/main.tsx"', 'src="./main.js"');
  if (!html.includes('./main.js')) {
    throw new Error('index.html 里没找到 /src/main.tsx 入口，构建脚本需要同步修改');
  }
  fs.writeFileSync(path.join(buildDir, 'index.html'), html, 'utf8');
}

async function bundle() {
  await build({
    root: buildDir,
    configFile: false,
    base: './',
    esbuild: false,
    plugins: [processEnvShim],
    logLevel: 'warn',
    build: {
      outDir: siteDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: false,
      cssMinify: false,
      target: 'es2020',
    },
  });
}

function checkOutput() {
  const indexPath = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('构建完成但 site/index.html 不存在');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (/https?:\/\//.test(html)) throw new Error('site/index.html 里有绝对 http(s) 引用');
  if (!html.includes('./assets/')) {
    throw new Error('site/index.html 的资源引用不是相对路径（应形如 ./assets/...）');
  }
  const assets = fs.readdirSync(path.join(siteDir, 'assets'));
  console.log('site/index.html：');
  for (const line of html.split('\n').filter((line) => line.includes('assets/'))) {
    console.log('  ' + line.trim());
  }
  console.log('site/assets：', assets.join(', '));
  console.log('构建完成 →', siteDir);
}

compileToJs();
prepareHtml();
await bundle();
checkOutput();
