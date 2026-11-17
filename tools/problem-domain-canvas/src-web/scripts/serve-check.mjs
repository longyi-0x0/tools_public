/**
 * 产物自检：用 node 起一个静态服务器把 ../site 打开，断言 200 且返回 HTML，再把页面引用的资源逐个拉一遍。
 * 运行：`node scripts/serve-check.mjs`（不需要浏览器，也不需要额外依赖）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..', '..', 'site');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const file = path.resolve(siteDir, relative);
  if (!file.startsWith(siteDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  response.end(fs.readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
console.log(`静态服务器：http://127.0.0.1:${port}/  (root = ${siteDir})`);

let failed = false;
const index = await fetch(`http://127.0.0.1:${port}/`);
const html = await index.text();
console.log(`GET / → ${index.status} ${index.headers.get('content-type')}`);
console.log(`  含 #root：${html.includes('id="root"')}；含 main 脚本：${/assets\/.+\.js/.test(html)}`);
if (index.status !== 200 || !html.includes('id="root"')) failed = true;

for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)) {
  const asset = match[1];
  const response = await fetch(`http://127.0.0.1:${port}/${asset.replace('./', '')}`);
  console.log(`GET ${asset} → ${response.status} (${response.headers.get('content-type')})`);
  if (response.status !== 200) failed = true;
}

server.close();
if (failed) {
  console.error('产物自检失败');
  process.exit(1);
}
console.log('产物自检通过');
