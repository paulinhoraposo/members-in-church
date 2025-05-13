const express = require("express");
const router = express.Router();

module.exports = (db) => {
  // Tela de login
  router.get("/", (req, res) => {
    res.render("login");
  });

  // Login do administrador
  router.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get(
      "SELECT * FROM admins WHERE username = ? AND password = ?",
      [username, password],
      (err, row) => {
        if (row) {
          req.session.admin = true;
          res.redirect("/dashboard");
        } else {
          res.send("Login inválido");
        }
      }
    );
  });

  // Painel do admin
  router.get("/dashboard", (req, res) => {
    if (!req.session.admin) return res.redirect("/");
    res.render("dashboard");
  });

  // Cadastro de membro
  router.post("/cadastrar", (req, res) => {
    const { nome, data_nascimento } = req.body;
    db.run(
      "INSERT INTO users (nome, data_nascimento) VALUES (?, ?)",
      [nome, data_nascimento],
      (err) => {
        if (err) console.error(err);
        res.redirect("/dashboard");
      }
    );
  });

  // Aniversariantes do mês
  router.get("/aniversariantes", (req, res) => {
    const mesAtual = new Date().getMonth() + 1;
    db.all(
      "SELECT * FROM users WHERE strftime('%m', data_nascimento) = ?",
      [mesAtual.toString().padStart(2, "0")],
      (err, rows) => {
        res.render("aniversariantes", { users: rows });
      }
    );
  });

  return router;
};

const db = new sqlite3.Database("./db/database.db", (err) => {
  if (err) {
    console.error("Erro ao conectar com o banco de dados:", err.message);
  } else {
    console.log("Conexão com o banco de dados estabelecida com sucesso.");
  }

  // Criação da tabela 'admins' se não existir
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `, (err) => {
    if (err) {
      console.error("Erro ao criar tabela admins:", err.message);
    } else {
      console.log("Tabela 'admins' criada com sucesso (ou já existe).");
    }
  });
});
