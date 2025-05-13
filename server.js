const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const multer = require('multer');
const path = require("path");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
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

const app = express();

// Configurações do servidor
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: "chave-secreta",
  resave: false,
  saveUninitialized: true
}));

// Página de login
app.get("/", (req, res) => {
  res.render("login", { error: null });
});

// Login do admin
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password], (err, admin) => {
    if (err) return res.send("Erro no banco de dados");
    if (admin) {
      req.session.admin = admin;
      res.redirect("/dashboard");
    } else {
      res.render("login", { error: "Usuário ou senha inválidos" });
    }
  });
});

// Dashboard protegido
app.get('/dashboard', (req, res) => {
  db.all('SELECT * FROM membros', (err, rows) => {
    const mensagem = req.session.mensagem;
    req.session.mensagem = null; // limpa a mensagem depois de exibir
    res.render('dashboard', { membros: rows, mensagem });
  });
});
app.get("/exportar/csv", (req, res) => {
  db.all("SELECT * FROM membros ORDER BY nome", [], (err, membros) => {
    if (err) return res.send("Erro ao gerar CSV");

    const header = "Nome,Email,Data de Nascimento\n";
    const rows = membros.map(m =>
      `${m.nome},${m.email},${new Date(m.data_nascimento).toLocaleDateString("pt-BR")}`
    ).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=membros.csv");
    res.send(header + rows);
  });
});

app.get("/exportar/pdf", (req, res) => {
  db.all("SELECT * FROM membros ORDER BY nome", [], (err, membros) => {
    if (err) return res.send("Erro ao gerar PDF");

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=membros.pdf");

    doc.pipe(res);
    doc.fontSize(18).text("Lista de Membros", { align: "center" });
    doc.moveDown();

    membros.forEach(m => {
      doc
        .fontSize(12)
        .text(`Nome: ${m.nome}`)
        .text(`Email: ${m.email}`)
        .text(`Data de Nascimento: ${new Date(m.data_nascimento).toLocaleDateString("pt-BR")}`)
        .moveDown();
    });

    doc.end();
  });
});
app.get('/membros', (req, res) => {
  db.all('SELECT * FROM membros', (err, membros) => {
    if (err) {
      console.error(err);
      return res.send('Erro ao buscar membros');
    }

    res.render('membros', { membros }); // você precisa ter uma view chamada membros.ejs
  });
});


// Sair
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
app.get("/aniversariantes/hoje", (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  db.all(
    `SELECT * FROM membros WHERE strftime('%d', data_nascimento) = ? AND strftime('%m', data_nascimento) = ?`,
    [dia, mes],
    (err, aniversariantesHoje) => {
      if (err) return res.send("Erro ao buscar aniversariantes do dia.");
      res.render("aniversariantes_hoje", { aniversariantesHoje });
    }
  );
});
// Configuração do armazenamento
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/"); // Pasta onde as fotos serão salvas
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });


app.get("/aniversariantes/hoje", (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  db.all(
    `SELECT * FROM membros WHERE strftime('%d', data_nascimento) = ? AND strftime('%m', data_nascimento) = ?`,
    [dia, mes],
    (err, aniversariantesHoje) => {
      if (err) return res.send("Erro ao buscar aniversariantes do dia.");
      res.render("/enviar-parabens", { aniversariantesHoje });
    }
  );
});


app.get('/aniversariantes', (req, res) => {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1; // mês vai de 0 a 11
  const diaAtual = hoje.getDate();

  // Query para aniversariantes do mês
  db.all(`SELECT * FROM membros WHERE strftime('%m', data_nascimento) = ?`, [
    mesAtual.toString().padStart(2, '0')
  ], (err, mesRows) => {
    if (err) {
      console.error(err);
      res.send('Erro ao buscar aniversariantes do mês');
    } else {
      // Query para aniversariantes do dia
      db.all(`SELECT * FROM membros WHERE strftime('%m', data_nascimento) = ? AND strftime('%d', data_nascimento) = ?`, [
        mesAtual.toString().padStart(2, '0'),
        diaAtual.toString().padStart(2, '0')
      ], (err2, hojeRows) => {
        if (err2) {
          console.error(err2);
          res.send('Erro ao buscar aniversariantes do dia');
        } else {
          res.render('aniversariantes', {
            aniversariantesHoje: hojeRows,
            aniversariantesMes: mesRows
          });
        }
      });
    }
  });
});


app.get('/enviar-parabens/:id', (req, res) => {
  const membroId = req.params.id;

  db.get('SELECT * FROM membros WHERE id = ?', [membroId], (err, membro) => {
    if (err || !membro) {
      console.error(err);
      return res.status(500).send('Erro ao buscar o membro.');
    }

    // Configurar o transporte de e-mail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'paulo.opensource@gmail.com',
        pass: 'qiyg qcik vncc wgdz'

      }
    });

    const mailOptions = {
  from: 'Members In Church <paulo.opensurce@gmail.com>',
  to: membro.email,
  subject: `🎉 Feliz Aniversário, ${membro.nome}!`,
  html: `
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6fa;padding:0;margin:0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.08);font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
          
          <!-- cabeçalho com banner -->
          <tr>
            <td style="background:#7c3aed;text-align:center">
              <img src="https://cdn.pixabay.com/photo/2021/07/30/12/55/birthday-6512544_1280.png" alt="Banner de aniversário" width="600" style="display:block;width:100%;max-width:600px">
            </td>
          </tr>

          <!-- mensagem principal -->
          <tr>
            <td style="padding:32px 40px 24px;color:#333333">
              <h1 style="margin:0 0 12px;font-size:24px;color:#7c3aed">Feliz Aniversário, ${membro.nome}! 🎂</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
                Hoje celebramos a vida que Deus lhe deu e agradecemos por você fazer parte da nossa comunidade.
                Que o Senhor derrame sobre você <strong>alegria, saúde e muitas bênçãos</strong> neste novo ciclo!
              </p>

              <!-- citação/versículo opcional -->
              <blockquote style="margin:0 0 24px;padding:12px 20px;background:#f4f0ff;border-left:4px solid #7c3aed;font-style:italic;color:#555">
                “Porque sou eu que conheço os planos que tenho para vocês, diz o Senhor, planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro.” – Jeremias 29:11
              </blockquote>

              <p style="margin:0 0 24px;font-size:16px">
                Receba nosso abraço carinhoso e conte sempre conosco. <br>
                <strong>Parabéns!</strong> 🎉🎉🎉
              </p>

              <a href="https://members-in-church.example.com" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
                Visitar o site
              </a>
            </td>
          </tr>

          <!-- rodapé simples -->
          <tr>
            <td style="background:#fafafa;padding:20px;text-align:center;font-size:12px;color:#999999">
              Members In Church • Caso não deseje receber mensagens, responda este e-mail.<br>
              &copy; ${new Date().getFullYear()} Members In Church
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  `
};


    // Enviar o e-mail
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erro ao enviar e-mail:', error);
        return res.status(500).send('Erro ao enviar o e-mail.');
      }

      console.log('E-mail enviado:', info.response);
      res.render('enviar-parabens', { membro });
    });
  }); 
});



app.post("/membros", upload.single("foto"), (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  const { nome, email, data_nascimento, telefone, funcao, endereco } = req.body;
  const foto = req.file ? "/uploads/" + req.file.filename : null;

  db.run(
    `INSERT INTO membros (nome, email, data_nascimento, telefone, funcao, endereco, foto)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nome, email, data_nascimento, telefone, funcao, endereco, foto],
    function (err) {
      if (err) {
        console.error("Erro ao cadastrar membro:", err.message);
        return res.send("Erro ao cadastrar membro.");
      }
      req.session.mensagem = "Membro cadastrado com sucesso!";
      res.redirect("/dashboard");
    }
  );
});


// Página de edição de membro
app.get("/editar/:id", (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  db.get("SELECT * FROM membros WHERE id = ?", [req.params.id], (err, membro) => {
    if (err || !membro) return res.send("Membro não encontrado.");
    res.render("editar", { membro });
  });
});

// Atualizando membro
app.post("/editar/:id", upload.single("foto"), (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  const { nome, email, data_nascimento, telefone, funcao, endereco } = req.body;
  const foto = req.file ? `/uploads/${req.file.filename}` : null;

  // Se tiver foto, atualiza com foto. Senão, mantém a foto anterior.
  const sql = foto
    ? `UPDATE membros SET nome = ?, email = ?, data_nascimento = ?, telefone = ?, funcao = ?, endereco = ?, foto = ? WHERE id = ?`
    : `UPDATE membros SET nome = ?, email = ?, data_nascimento = ?, telefone = ?, funcao = ?, endereco = ? WHERE id = ?`;

  const params = foto
    ? [nome, email, data_nascimento, telefone, funcao, endereco, foto, req.params.id]
    : [nome, email, data_nascimento, telefone, funcao, endereco, req.params.id];

  db.run(sql, params, (err) => {
    if (err) return res.send("Erro ao atualizar membro.");
    res.redirect("/dashboard");
  });
});




app.post("/excluir/:id", (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  db.run("DELETE FROM membros WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.send("Erro ao excluir membro.");
    res.redirect("/dashboard");
  });
});


app.post("/enviar-parabens", (req, res) => {
  if (!req.session.admin) return res.redirect("/");

  const { nome, email } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "paulo.opensource@gmail.com",
      pass: "xdba mzgg rqyl rdfs" // use a senha de app gerada
    }
  });

  const mailOptions = {
    from: '"Members In Church" <SEU_EMAIL@gmail.com>',
    to: email,
    subject: `🎉 Feliz Aniversário, ${nome}!`,
    html: `<p>Olá <strong>${nome}</strong>,</p>
           <p>Desejamos a você um dia repleto de bênçãos e alegrias!</p>
           <p>Feliz Aniversário! 🥳</p>
           <p>— Members In Church</p>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      return res.send("Erro ao enviar e-mail.");
    }
    res.render("enviar-parabens", { nome });


  });
});

cron.schedule("0 8 * * *", () => {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  db.all(
    `SELECT nome, email FROM membros WHERE strftime('%d', data_nascimento) = ? AND strftime('%m', data_nascimento) = ?`,
    [dia, mes],
    (err, aniversariantes) => {
      if (err) {
        console.log("Erro ao buscar aniversariantes:", err);
        return;
      }

      if (aniversariantes.length === 0) {
        console.log("Nenhum aniversariante hoje.");
        return;
      }

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "paulo.opensource@gmail.com",
          pass: "xdba mzgg rqyl rdfs"
        }
      });

      aniversariantes.forEach(({ nome, email }) => {
        const mailOptions = {
          from: '"Members In Church" <paulo.opensource@gmail.com>',
          to: email,
          subject: `🎉 Feliz Aniversário, ${nome}!`,
          html: `<p>Olá <strong>${nome}</strong>,</p>
                 <p>Desejamos a você um dia repleto de bênçãos e alegrias!</p>
                 <p>Feliz Aniversário! 🥳</p>
                 <p>— Members In Church</p>`
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) console.log(`Erro ao enviar para ${email}:`, error);
          else console.log(`E-mail automático enviado para ${email}`);
        });
      });
    }
  );
});

const saltRounds = 10;

// Rota GET para exibir o formulário de cadastro
app.get("/cadastro-admin", (req, res) => {
  res.render("cadastrar_admin");
});

// Rota POST para processar o cadastro
app.post("/cadastro-admin", (req, res) => {
  const { nome, email, username, password, confirm_password } = req.body;

  // Verificando se as senhas são iguais
  if (password !== confirm_password) {
    return res.render("cadastrar_admin", { error: "As senhas não coincidem!" });
  }

  // Verificando se o username já existe no banco de dados
  db.get("SELECT * FROM admins WHERE username = ?", [username], (err, adminExistente) => {
    if (err) {
      return res.send("Erro ao verificar o banco de dados");
    }
    if (adminExistente) {
      return res.render("cadastrar_admin", { error: "Nome de usuário já existente!" });
    }

    // Criptografando a senha antes de salvar no banco
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
      if (err) {
        return res.send("Erro ao criptografar a senha");
      }

      // Inserir o novo administrador no banco de dados
      db.run(
        "INSERT INTO admins (nome, email, username, password) VALUES (?, ?, ?, ?)",
        [nome, email, username, hashedPassword],
        (err) => {
          if (err) {
            return res.send("Erro ao cadastrar administrador");
          }
          res.redirect("/"); // Redireciona para a página de login após o cadastro
        }
      );
    });
  });
});

