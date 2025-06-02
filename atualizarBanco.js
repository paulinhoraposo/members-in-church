const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/database.db");

db.serialize(() => {
  db.run("ALTER TABLE membros ADD COLUMN telefone TEXT", (err) => {
    if (err) console.log("Telefone já existe ou erro:", err.message);
  });

  db.run("ALTER TABLE membros ADD COLUMN funcao TEXT", (err) => {
    if (err) console.log("Função já existe ou erro:", err.message);
  });

  db.run("ALTER TABLE membros ADD COLUMN endereco TEXT", (err) => {
    if (err) console.log("Endereço já existe ou erro:", err.message);
  });

  console.log("Atualização concluída.");
});

db.close();
