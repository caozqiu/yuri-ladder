import test from 'node:test';
import assert from 'node:assert/strict';
import {SQLiteDatabase} from '../src/sqlite.mjs';
test('SQLite adapter preserves parameters, result metadata and atomic batch rollback',async()=>{
  const db=new SQLiteDatabase(':memory:');
  try{
    await db.prepare('CREATE TABLE sample(id TEXT PRIMARY KEY,value TEXT)').run();
    const id='1585265976143433728',value="x'; DROP TABLE sample; --";
    const result=await db.prepare('INSERT INTO sample VALUES (?,?)').bind(id,value).run();assert.equal(result.meta.changes,1);
    assert.equal((await db.prepare('SELECT * FROM sample WHERE id=?').bind(id).first()).value,value);
    assert.throws(()=>db.batch([db.prepare('INSERT INTO sample VALUES (?,?)').bind('second','ok'),db.prepare('INSERT INTO missing_table VALUES (?)').bind('fail')]));
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM sample').first('n'),1);
    const rows=await db.prepare('SELECT id FROM sample').all();assert.equal(rows.results[0].id,id);
  }finally{db.close();}
});
