// A small PostgREST stand-in backed by a REAL local Postgres (via psql), so tests run the actual SQL functions in
// supabase/sql/supabase-yn-core.sql. Test-only: values are inlined into SQL, never use this for real traffic.
import { execFileSync } from 'node:child_process';

export function makePg({ host, port }) {
  const run = sql => {
    try { return execFileSync('psql', ['-h', host, '-p', String(port), '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch (e) { throw new Error(`Supabase 400: ${String(e.stderr || e.message).slice(0, 300)}`); }
  };
  const q = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const lit = v => Array.isArray(v) ? q('{' + v.map(x => '"' + String(x).replace(/(["\\])/g, '\\$1') + '"').join(',') + '}')
    : v !== null && typeof v === 'object' ? q(JSON.stringify(v)) : typeof v === 'number' || typeof v === 'boolean' ? String(v) : q(v);
  const ident = c => { if (!/^[a-z_][a-z0-9_]*$/.test(c)) throw new Error('bad column ' + c); return c; };

  function where(params) {
    const parts = [];
    for (const [k, raw] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const col = ident(k);
      let m;
      if ((m = /^not\.is\.(null|true|false)$/.exec(raw))) parts.push(`${col} is not ${m[1]}`);
      else if ((m = /^is\.(null|true|false)$/.exec(raw))) parts.push(`${col} is ${m[1]}`);
      else if ((m = /^in\.\((.*)\)$/.exec(raw))) parts.push(`${col} in (${m[1].split(',').map(q).join(',')})`);
      else if ((m = /^(eq|neq|gt|gte|lt|lte)\.(.*)$/s.exec(raw))) parts.push(`${col} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[m[1]]} ${q(m[2])}`);
      else throw new Error('unsupported filter ' + k + '=' + raw);
    }
    return parts.length ? ' where ' + parts.join(' and ') : '';
  }
  const VOID = new Set(['yn_core_audit', 'yn_core_housekeeping']);

  async function sb(pathAndQuery, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const [path, qs = ''] = pathAndQuery.split('?');
    const params = [...new URLSearchParams(qs)];
    const get = k => params.find(([x]) => x === k)?.[1];
    const body = init.body ? JSON.parse(init.body) : null;
    const wantRows = method === 'GET' || /return=representation/.test(init.headers?.Prefer || '');
    if (path.startsWith('rpc/')) {
      const fn = ident(path.slice(4));
      const args = Object.entries(body || {}).map(([k, v]) => `${ident(k)} => ${v === null ? 'null' : v !== null && typeof v === 'object' ? q(JSON.stringify(v)) : q(v)}`).join(', ');
      if (VOID.has(fn)) { run(`select public.${fn}(${args})`); return null; }
      const out = run(`select r::text from (select public.${fn}(${args}) as r) t`);
      return out ? JSON.parse(out) : null;
    }
    const table = ident(path);
    let inner;
    if (method === 'GET') {
      const sel = get('select') && /^[a-z_,*]+$/.test(get('select')) ? get('select') : '*';
      const order = get('order') ? ' order by ' + get('order').split(',').map(o => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ') : '';
      const limit = get('limit') ? ` limit ${Number(get('limit'))}` : '';
      inner = `select ${sel} from public.${table}${where(params)}${order}${limit}`;
      return JSON.parse(run(`select coalesce(json_agg(t), '[]'::json) from (${inner}) t`));
    }
    if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].map(ident);
      inner = `insert into public.${table} (${cols.join(',')}) values ${rows.map(r => '(' + cols.map(c => (c in r ? lit(r[c]) : 'default')).join(',') + ')').join(',')} returning *`;
    } else if (method === 'PATCH') {
      inner = `update public.${table} set ${Object.entries(body).map(([k, v]) => `${ident(k)} = ${lit(v)}`).join(', ')}${where(params)} returning *`;
    } else if (method === 'DELETE') {
      inner = `delete from public.${table}${where(params)} returning *`;
    } else throw new Error('unsupported method ' + method);
    const out = run(`with r as (${inner}) select coalesce(json_agg(r), '[]'::json) from r`);
    return wantRows ? JSON.parse(out) : null;
  }
  return { sb, run };
}
