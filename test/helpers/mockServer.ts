// test/helpers/mockServer.ts
import http from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

export interface MockServer {
  url: string;
  userAgents: string[]; // UA header seen on each request, in order
  requestTimes: number[]; // ms timestamp of each request
  close: () => Promise<void>;
}

const LOGIN_FORM = `<html><body>
  <form action="login.php" method="post">
    <input name="username"><input type="password" name="passwd">
    <input type="submit" name="commit" value="Sign In">
  </form></body></html>`;

const DASHBOARD = `<html><head><title>Dashboard</title></head><body>Welcome</body></html>`;
const PUBLIC = `<html><head><title>Public</title></head><body>hi</body></html>`;

const fixture = (f: string): string => readFileSync(`fixtures/${f}`, 'utf8');
// Extract a text field value from a multipart/form-data body (test-grade).
const mpField = (body: string, name: string): string => {
  const m = body.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--`, 'i'));
  return m ? m[1].trim() : '';
};

export async function startMockServer(): Promise<MockServer> {
  const userAgents: string[] = [];
  const requestTimes: number[] = [];

  const server = http.createServer((req, res) => {
    userAgents.push(req.headers['user-agent'] ?? '');
    requestTimes.push(Date.now());
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cookies = req.headers.cookie ?? '';
    const authed = cookies.includes('sid=good');

    if (req.method === 'POST' && url.pathname === '/login.php') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        if (params.get('username') === 'good' && params.get('passwd') === 'secret') {
          res.writeHead(302, { 'set-cookie': 'sid=good; Path=/', location: '/dashboard' });
          res.end();
        } else {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(LOGIN_FORM); // failure: login form is re-rendered
        }
      });
      return;
    }

    if (url.pathname === '/dashboard') {
      if (authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(DASHBOARD); }
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); }
      return;
    }

    if (url.pathname === '/public') {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(PUBLIC); return;
    }

    // Brand list = the create form (cat_id <select>).
    if (req.method === 'GET' && url.pathname === '/typewriter_edit.php') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body><form method="post">${fixture('brand-options.html')}</form></body></html>`);
      return;
    }

    // Models for a brand (bare <option> list).
    if (req.method === 'GET' && url.pathname === '/mfr.42.model_list') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fixture('model-list-42.html'));
      return;
    }

    // Create (id=0) / update (id=N). Requires serial_no; replies with a page linking the gallery.
    if (req.method === 'POST' && url.pathname === '/typewriter_edit.php') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const id = mpField(body, 'id');
        const serial = mpField(body, 'serial_no');
        if (!serial) {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<html><body>Error: serial number is required.</body></html>');
          return;
        }
        const gid = id && id !== '0' ? id : '25059';
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>Saved. <a href="https://twdb/see.${gid}.typewriter">View gallery</a></body></html>`);
      });
      return;
    }

    res.writeHead(404); res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    userAgents,
    requestTimes,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
