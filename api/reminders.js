import { handler } from '../server/index.js';
export default function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const originalPath = url.searchParams.get('__originalPath');
  if (originalPath) {
    url.searchParams.delete('__originalPath');
    req.url = originalPath + (url.search ? url.search : '');
  }
  return handler(req, res);
}
