import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(aqui, '..', 'db', 'schema.sql'), 'utf8');

await pool.query(sql);
console.log('schema aplicado');
await pool.end();
