const http = require('http');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const root = path.resolve(process.argv[2] || 'public');
const host = process.env.HOST || '127.0.0.1';
const port = parseInt(process.env.PORT || '8080', 10);
const forceDecompress = process.env.DECOMPRESS_BROTLI === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const BROTLI_EXT = new Set(['.wasm', '.pck']);

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}

const server = http.createServer((req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch (_) {
    return send(res, 400, 'Bad Request');
  }

  if (urlPath === '/') urlPath = '/index.html';

  const safePath = path.normalize(urlPath).replace(/^\.+/, '');
  const filePath = path.join(root, safePath);
  if (!filePath.startsWith(root)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      log('404', urlPath);
      return send(res, 404, 'Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const canBrotli = acceptEncoding.includes('br');
    const isBrotliAsset = BROTLI_EXT.has(ext);
    const useBrotli = isBrotliAsset && !forceDecompress && canBrotli;

    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-cache'
    };

    if (useBrotli) {
      headers['Content-Encoding'] = 'br';
    }

    if (isBrotliAsset && !useBrotli) {
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          log('500 read', urlPath, readErr.message || readErr);
          return send(res, 500, 'Read Error');
        }
        zlib.brotliDecompress(data, (decErr, out) => {
          if (decErr) {
            log('500 brotli', urlPath, decErr.message || decErr);
            return send(res, 500, 'Decompress Error');
          }
          headers['Content-Length'] = out.length;
          res.writeHead(200, headers);
          res.end(out);
        });
      });
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      log('500 stream', urlPath, streamErr.message || streamErr);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Stream Error');
    });
    stream.pipe(res);
  });
});

server.on('clientError', (err) => {
  log('clientError', err.message || err);
});

server.listen(port, host, () => {
  log(`Dev server: http://${host}:${port} (root=${root})`);
  if (forceDecompress) {
    log('Serving brotli assets decompressed (DECOMPRESS_BROTLI=1)');
  }
});
