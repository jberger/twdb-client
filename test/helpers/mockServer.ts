// test/helpers/mockServer.ts
import http from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

export interface MockServer {
  url: string;
  userAgents: string[]; // UA header seen on each request, in order
  requestTimes: number[]; // ms timestamp of each request
  machineCreates: Record<string, string>[]; // multipart text fields of each create/update POST
  photoCreates: Record<string, string>[]; // multipart text fields of each create POST
  photoEdits: Record<string, string>[]; // multipart text fields of each edit POST
  photoDeletes: string[]; // request URLs of each delete GET
  photoOrderings: { galleryId: string; ids: string[] }[]; // each ordering POST (gallery + ids in order)
  linkCreates: Record<string, string>[]; // urlencoded fields of each create.weblink POST
  linkDeletes: string[]; // request URLs of each delete.weblink GET
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
// All text fields of a multipart body, as a map (test-grade).
const mpFields = (body: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/name="([^"]+)"\r?\n\r?\n([\s\S]*?)\r?\n--/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
};

export async function startMockServer(): Promise<MockServer> {
  const userAgents: string[] = [];
  const requestTimes: number[] = [];
  const machineCreates: Record<string, string>[] = [];
  const photoCreates: Record<string, string>[] = [];
  const photoEdits: Record<string, string>[] = [];
  const photoDeletes: string[] = [];
  const photoOrderings: { galleryId: string; ids: string[] }[] = [];
  const linkCreates: Record<string, string>[] = [];
  const linkDeletes: string[] = [];
  let flakyHits = 0;

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

    // Models for the public model browser (bare <option> list; composite-id values).
    if (req.method === 'GET' && url.pathname === '/mfr.42.model_list') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fixture('model-list-42.html'));
      return;
    }

    // Models for the CREATE form (value-less <option> list → submitted value is the bare name).
    if (req.method === 'GET' && url.pathname === '/mfr.42.models_list') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(fixture('models-list-42.html'));
      return;
    }

    // Create (id=0) / update (id=N). Requires serial_no; replies with a page linking the gallery.
    if (req.method === 'POST' && url.pathname === '/typewriter_edit.php') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        machineCreates.push(mpFields(body));
        const id = mpField(body, 'id');
        const serial = mpField(body, 'serial_no');
        // Mirror TWDB: the REQUIRED field is the `model` TEXT input. (The `models` <select> is just a
        // picker; the live form's JS copies the chosen name into `model`.) So `models` alone — with an
        // empty `model` — is rejected as "required fields not filled", exactly like real TWDB.
        const model = mpField(body, 'model');
        if (!serial || model.trim() === '') {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(
            '<html><body><div class="alert alert-danger">Error: Required fields were not filled out.</div></body></html>',
          );
          return;
        }
        const gid = id && id !== '0' ? id : '25059';
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>Saved. <a href="https://twdb/see.${gid}.typewriter">View gallery</a></body></html>`);
      });
      return;
    }

    // Gallery page (see.<id>.typewriter): carries the canonical public URL the create flow reads.
    const seeMatch = url.pathname.match(/^\/see\.(\d+)\.typewriter$/);
    if (req.method === 'GET' && seeMatch) {
      const gid = seeMatch[1];
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        `<html><head><link rel="canonical" href="https://twdb/1932-test-machine.${gid}.typewriter" /></head><body>gallery ${gid}</body></html>`,
      );
      return;
    }

    // Gallery photos page (auth required).
    if (req.method === 'GET' && url.pathname === '/typewriter_editor_photos.php') {
      if (!authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(fixture('photos-list.html'));
      return;
    }

    // Add photo: capture fields, reply with a photos page whose newest gp_id (max) is 999999.
    if (req.method === 'POST' && url.pathname === '/typewriter_photo_create.php') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        photoCreates.push(mpFields(body));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body>
          <form action="typewriter_photo_edit.php">
            <input name="gp_id" value="192579" />
            <img src="https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg" />
          </form>
          <form action="typewriter_photo_edit.php">
            <input name="gp_id" value="999999" />
            <img src="https://typewriterdatabase.com/img/g25286_999999__999999_1781919743.jpg" />
          </form>
        </body></html>`);
      });
      return;
    }

    // Edit photo: capture fields, reply OK.
    if (req.method === 'POST' && url.pathname === '/typewriter_photo_edit.php') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        photoEdits.push(mpFields(body));
        res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Saved.</body></html>');
      });
      return;
    }

    // Delete photo: record the URL, reply OK.
    if (req.method === 'GET' && url.pathname === '/typewriter_photo_delete.php') {
      photoDeletes.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Deleted.</body></html>');
      return;
    }

    // Reorder photos (urlencoded ids[] in order). Capture gallery_id + ids, reply OK.
    if (req.method === 'POST' && url.pathname === '/typewriter_editor_photos_ordering_ajax.php') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        photoOrderings.push({ galleryId: url.searchParams.get('gallery_id') ?? '', ids: params.getAll('ids[]') });
        res.writeHead(200, { 'content-type': 'text/html' }); res.end('ok');
      });
      return;
    }

    // Links editor page (auth required).
    if (req.method === 'GET' && url.pathname === '/typewriter_editor_links.php') {
      if (!authed) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(LOGIN_FORM); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(fixture('links-list.html'));
      return;
    }

    // Add weblink (urlencoded). Capture fields, reply OK.
    if (req.method === 'POST' && url.pathname === '/create.weblink') {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        linkCreates.push(Object.fromEntries(params.entries()));
        res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Link saved.</body></html>');
      });
      return;
    }

    // Delete weblink: record the URL, reply OK.
    if (req.method === 'GET' && url.pathname === '/delete.weblink') {
      linkDeletes.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>Deleted.</body></html>');
      return;
    }

    // Public hunter export (CSV/TAB). No login required.
    if (req.method === 'GET' && url.pathname === '/typewriter_list_ajax.php' && url.searchParams.get('output') === 'csv') {
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end(fixture('02-list-7773.csv'));
      return;
    }

    // Flaky: 503 on the first hit, 200 thereafter (for retry tests).
    if (req.method === 'GET' && url.pathname === '/flaky') {
      flakyHits += 1;
      if (flakyHits === 1) { res.writeHead(503); res.end('busy'); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>ok</body></html>');
      return;
    }
    // Always-500 (for exhausted-retry test).
    if (req.method === 'GET' && url.pathname === '/down') { res.writeHead(500); res.end('down'); return; }

    res.writeHead(404); res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    userAgents,
    requestTimes,
    machineCreates,
    photoCreates,
    photoEdits,
    photoDeletes,
    photoOrderings,
    linkCreates,
    linkDeletes,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
