const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

// Verificar se a pasta db existe
if (!fs.existsSync("./db")) {
  fs.mkdirSync("./db");
}

const db = new sqlite3.Database("./db/database.db", (err) => {
  if (err) return console.error("Erro ao abrir o banco:", err.message);
});

// Criar a tabela admins, se não existir
db.run(
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL
  )`,
  (err) => {
    if (err) {
      console.error("Erro ao criar tabela:", err.message);
      return;
    }

    // Inserir o administrador
    db.run(
      "INSERT INTO admins (username, password) VALUES (?, ?)",
      ["admin", "1234"],
      (err) => {
        if (err) return console.log("Erro ao inserir admin:", err.message);
        console.log("Administrador criado com sucesso!");
        db.close();
      }
    );
  }
);

