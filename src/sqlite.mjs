import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';

// The existing query and sync code uses this small subset of D1's interface.
export class SQLiteDatabase {
  constructor(filename) {
    if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true});
    this.connection=new DatabaseSync(filename);
    this.connection.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; PRAGMA synchronous=NORMAL;');
  }
  prepare(sql){return new Statement(this,sql);}
  batch(statements){
    this.connection.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(s=>{if(s.db!==this)throw new Error('Statement belongs to another database');return s.execute();});this.connection.exec('COMMIT');return Promise.resolve(results);}
    catch(error){this.connection.exec('ROLLBACK');throw error;}
  }
  migrate(directory){
    this.connection.exec('CREATE TABLE IF NOT EXISTS standalone_migrations(name TEXT PRIMARY KEY)');
    for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()){
      if(this.connection.prepare('SELECT name FROM standalone_migrations WHERE name=?').get(name))continue;
      this.connection.exec('BEGIN IMMEDIATE');
      try{this.connection.exec(readFileSync(join(directory,name),'utf8'));this.connection.prepare('INSERT INTO standalone_migrations(name) VALUES (?)').run(name);this.connection.exec('COMMIT');}
      catch(error){this.connection.exec('ROLLBACK');throw error;}
    }
  }
  close(){this.connection.close();}
}
class Statement {
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.db,this.sql,values);}
  execute(){const r=this.db.connection.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  run(){return Promise.resolve(this.execute());}
  first(column){const row=this.db.connection.prepare(this.sql).get(...this.values);return Promise.resolve(column?(row?.[column]??null):(row??null));}
  all(){return Promise.resolve({success:true,results:this.db.connection.prepare(this.sql).all(...this.values)});}
}
