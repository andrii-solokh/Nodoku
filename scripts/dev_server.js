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
const MAGIC = {
  '.wasm': Buffer.from([0x00, 0x61, 0x73, 0x6d]),
  '.pck': Buffer.from('GDPC')
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}

function hasMagicHeader(filePath, ext, cb) {
  const magic = MAGIC[ext];
  if (!magic) return cb(null, false);
  const buf = Buffer.alloc(magic.length);
  fs.open(filePath, 'r', (openErr, fd) => {
    if (openErr) return cb(openErr, false);
    fs.read(fd, buf, 0, magic.length, 0, (readErr) => {
      fs.close(fd, () => {});
      if (readErr) return cb(readErr, false);
      cb(null, buf.equals(magic));
    });
  });
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

    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-cache'
    };

    if (!isBrotliAsset) {
      res.writeHead(200, headers);
      return fs.createReadStream(filePath).pipe(res);
    }

    hasMagicHeader(filePath, ext, (magicErr, isUncompressed) => {
      if (magicErr) {
        log('500 magic', urlPath, magicErr.message || magicErr);
        return send(res, 500, 'Read Error');
      }

      if (isUncompressed) {
        res.writeHead(200, headers);
        return fs.createReadStream(filePath).pipe(res);
      }

      const useBrotli = !forceDecompress && canBrotli;
      if (useBrotli) {
        headers['Content-Encoding'] = 'br';
        res.writeHead(200, headers);
        return fs.createReadStream(filePath).pipe(res);
      }

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
    });
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
