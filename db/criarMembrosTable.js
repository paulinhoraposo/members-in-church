const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/database.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS membros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT,
      data_nascimento TEXT
    )
  `, (err) => {
    if (err) {
      console.error("Erro ao criar tabela membros:", err);
    } else {
      console.log("Tabela 'membros' criada com sucesso.");
    }
    db.close();
  });
});
