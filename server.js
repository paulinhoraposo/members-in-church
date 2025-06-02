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
const app = express();
const moment = require('moment');
const fs = require('fs');



const dbPath = path.join(__dirname, 'db', 'database.db');

function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioId || req.session.adminId) {
    next(); // Usuário autenticado, prossiga para a rota
  } else {
    res.redirect('/'); // Redireciona para a página inicial de login
  }
}

function verificarQualquerAutenticado(req, res, next) {
  if (req.session.admin_id || req.session.usuarioId) {
    next();
  } else {
    res.redirect('/login_usuario'); // redireciona para login de usuário como padrão
  }
}


// Função para validar o tipo
function validarTipo(tipo) {
  const tiposValidos = ['Entrada', 'Saída'];
  return tiposValidos.includes(tipo);
}

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
const upload = multer({ storage });

// Configurações do servidor
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use('/uploads', express.static('uploads'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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
  const { email, senha } = req.body;

  db.get("SELECT * FROM admins WHERE email = ? AND senha = ?", [email, senha], (err, row) => {
    console.error(err); 
    if (err) return res.send("Erro no banco de dados");
    if (!row) {
      console.log('Login inválido: email ou senha incorretos');
      return res.status(401).send('Usuário ou senha inválidos');
    }
    if (row) {
      req.session.adminId = row.id;
      console.log("Sessão após login:", req.session); 
      res.redirect("/dashboard");
    } else {
      res.render("login", { error: "Usuário ou senha inválidos" });
    }

    
  });
});

function verificarQualquerAutenticado(req, res, next) {
  if (req.session && (req.session.usuarioId || req.session.adminId)) {
    return next();
  } else {
    return res.redirect('/login');
  }
}

app.get('/lista_membros', verificarQualquerAutenticado, (req, res) => {
  const db = new sqlite3.Database('C:/Members-In-Church/db/database.db');
  const usuarioId = req.session.usuario_id || req.session.adminId;

  const sql = `
  SELECT membros.*, ministerios.nome AS ministerio_nome
  FROM membros
  LEFT JOIN ministerios ON membros.ministerio_id = ministerios.id
  WHERE membros.admin_id = ?

`;

db.all(sql, [usuarioId], (err, membros) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao buscar membros');
    }

    res.render('lista_membros', { membros,
      mensagem: null
     });
  });
});

// Cadastro do ministério
app.post('/ministerios', (req, res) => {
  const { nome, descricao } = req.body;
  const sql = 'INSERT INTO ministerios (nome, descricao) VALUES (?, ?)';
  db.run(sql, [nome, descricao], function (err) {
    if (err) {
      console.error(err);
      return res.send('Erro ao salvar ministério.');
    }
    res.redirect('/ministerios');
  });
});

app.get('/ministerios', (req, res) => {
    const adminId = req.session.adminId;

  db.all('SELECT * FROM ministerios', (err, rows) => {
    if (err) {
      console.error(err);
      return res.send('Erro ao buscar ministérios.');
    }
    res.render('ministerios', { ministerios: rows });
  });
});

app.get('/cadastrar-ministerio', (req, res) => {
  res.render('cadastrar_ministerio');
});



app.post('/lista_membros', verificarQualquerAutenticado, (req, res) => {
  const { nome, data_nascimento, sexo, telefone, email } = req.body;
  const adminId = req.session.adminId || req.session.usuarioId;

  const db = new sqlite3.Database('C:/Members-In-Church/db/database.db');
  const query = `
    INSERT INTO membros (nome, data_nascimento, sexo, telefone, email, admin_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.run(query, [nome, data_nascimento, sexo, telefone, email, adminId], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao cadastrar membro.');
    }
    // redirecione para a lista
    res.redirect('/lista_membros');
  });
});




// Rota do dashboard - acessível tanto por administradores quanto usuários vinculados
app.get('/dashboard', verificarQualquerAutenticado, (req, res) => {
  const adminId = req.session.admin_id || req.session.adminId; // compatível com ambos

  const sql = 'SELECT * FROM membros WHERE admin_id = ?';

  db.all(sql, [adminId], (err, membros) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao buscar membros');
    }

    const totalMembros = membros.length;

    // Gráfico de aniversariantes por mês
    const membrosPorMes = Array(12).fill(0);
    membros.forEach(m => {
      if (m.data_nascimento) {
        const mes = new Date(m.data_nascimento).getMonth(); // 0 = jan
        membrosPorMes[mes]++;
      }
    });

    // Faixa etária
    const faixaEtaria = [0, 0, 0, 0]; // [0-18, 19-30, 31-50, 51+]
    const agora = new Date();
    membros.forEach(m => {
      if (m.data_nascimento) {
        const nascimento = new Date(m.data_nascimento);
        const idade = agora.getFullYear() - nascimento.getFullYear();
        if (idade <= 18) faixaEtaria[0]++;
        else if (idade <= 30) faixaEtaria[1]++;
        else if (idade <= 50) faixaEtaria[2]++;
        else faixaEtaria[3]++;
      }
    });

    // Por sexo
    const porSexo = { Masculino: 0, Feminino: 0, Outros: 0 };
    membros.forEach(m => {
      const sexo = (m.sexo || '').toLowerCase();
      if (sexo === 'masculino') porSexo.Masculino++;
      else if (sexo === 'feminino') porSexo.Feminino++;
      else porSexo.Outros++;
    });

    res.render('dashboard', {
      totalMembros,
      membrosPorMes,
      faixaEtaria,
      porSexo
    });
  });
});

app.get("/financas", (req, res) => {
  const adminId = req.session.adminId;

  if (!adminId) {
    return res.redirect("/login");
  }

  db.all("SELECT * FROM lancamentos WHERE admin_id = ?", [adminId], (err, lancamentos) => {
    if (err) {
      console.error("Erro ao buscar lançamentos:", err);
      return res.send("Erro ao carregar os lançamentos");
    }

    let totalEntradas = 0;
    let totalSaidas = 0;

    lancamentos.forEach((l) => {
      if (l.tipo === "Entrada") {
        totalEntradas += l.valor;
      } else if (l.tipo === "Saída") {
        totalSaidas += l.valor;
      }
    });

    const saldoAtual = totalEntradas - totalSaidas;

    res.render("financas", {
      lancamentos,
      totalEntradas,
      totalSaidas,
      saldoAtual
    });
  });
});



app.post('/financas/lancamento', (req, res) => {
    if (!req.session.adminId) {
      console.log('Admin não está logado. Sessão:', req.session);
    return res.status(401).send('Não autorizado');
    }

  const { tipo, valor, descricao, categoria, forma_pagamento, data } = req.body;
  const adminId = req.session.adminId;

  const query = `INSERT INTO lancamentos (admin_id, tipo, valor, descricao, categoria, forma_pagamento, data) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [adminId, tipo, valor, descricao, categoria, forma_pagamento, data], function(err) {
    if (err) {
      console.error('Erro ao inserir lançamento:', err);
      return res.status(500).send('Erro ao salvar lançamento');
    }

    res.redirect('/financas');
  });
});

app.get('/financas/exportar/pdf', (req, res) => {
  const adminId = req.session.adminId;

  db.all('SELECT * FROM lancamentos WHERE admin_id = ?', [adminId], (err, lancamentos) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao buscar dados');
    }

    const PDFDocument = require('pdfkit');
    const moment = require('moment');

    const doc = new PDFDocument();
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_financeiro.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);

    doc.fontSize(18).text('Relatório Financeiro', { align: 'center' });
    doc.moveDown();

    lancamentos.forEach(l => {
      doc
        .fontSize(12)
        .text(`Data: ${moment(l.data).format('DD/MM/YYYY')}`)
        .text(`Tipo: ${l.tipo}`)
        .text(`Categoria: ${l.categoria}`)
        .text(`Forma de Pagamento: ${l.forma_pagamento}`)
        .text(`Valor: R$ ${l.valor.toFixed(2)}`)
        .text(`Observação: ${l.descricao || '---'}`)
        .moveDown();
    });

    doc.end();
  });
});




app.get("/exportar/csv", verificarAutenticacao, (req, res) => {
    const adminId = req.session.adminId;
 db.all("SELECT * FROM membros WHERE admin_id = ?", [adminId], (err, membros) => {
    if (err) return res.send("Erro ao gerar CSV");

    const header = "Nome,Email,Data de Nascimento, Função, Telefone, sexo\n";
    const rows = membros.map(m =>
      `${m.nome},${m.email},${new Date(m.data_nascimento).toLocaleDateString("pt-BR")}`
    ).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=membros.csv");
    res.send(header + rows);
  });
});


// Exportar PDF
app.get('/exportar/pdf', verificarAutenticacao, (req, res) => {
  const adminId = req.session.adminId; // Recupera o ID do admin logado

  db.all('SELECT * FROM membros WHERE admin_id = ?', [adminId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar membros para exportar PDF:', err);
      return res.status(500).send('Erro ao gerar PDF');
    }

    const doc = new PDFDocument();
    const filePath = path.join(__dirname, 'public', 'relatorio_membros.pdf');
    const writeStream = fs.createWriteStream(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=membros.pdf');
    doc.pipe(writeStream);

    doc.fontSize(18).text('Relatório de Membros', { align: 'center' });
    doc.moveDown();

    rows.forEach(membro => {
      doc
        .fontSize(12)
        .text(`Nome: ${membro.nome}`)
        .text(`Sexo: ${membro.sexo}`)
        .text(`Data de Nascimento: ${membro.data_nascimento}`)
        .text(`Telefone: ${membro.telefone}`)
        .text(`Email: ${membro.email}`)
        .text(`Bairro: ${membro.bairro}`)
        .text(`Cidade: ${membro.cidade}`)
        .text('--------------------------');
    });

    doc.end();

    writeStream.on('finish', () => {
      res.download(filePath, 'relatorio_membros.pdf');
    });
  });
});

//Rota para pagina cadastro de membros
app.get('/cadastro_membros', (req, res) => {
  const adminId = req.session.adminId || req.session.userId; // 👈 ISSO É ESSENCIAL

  const sql = 'SELECT * FROM ministerios WHERE admin_id = ?';
  db.all(sql, [adminId], (err, ministerios) => {
    if (err) {
      console.error("Erro ao buscar ministérios:", err);
      return res.send("Erro ao carregar ministérios.");
    }
      console.log("Ministérios encontrados:", ministerios);

    res.render("cadastro_membros", { ministerios, mensagem: null });// você precisa ter uma view chamada membros.ejs
  });
});

// Body parser (certifique-se de ter logo no topo do arquivo)
app.use(express.urlencoded({ extended: true }));

// Rota POST de cadastro de membro
app.post('/cadastro_membros', verificarQualquerAutenticado, upload.single('foto'),           // se não tiver campo de foto, remova esta linha
  (req, res) => {
    // agora req.body deve existir
    const { nome, data_nascimento, sexo, telefone, email, ministerio } = req.body;
    const adminId = req.session.adminId || req.session.usuarioId;

    
    const db = new sqlite3.Database('C:/Members-In-Church/db/database.db');
    const sql = `
      INSERT INTO membros 
        (nome, data_nascimento, sexo, telefone, email, admin_id, ministerio_id, foto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const fotoPath = req.file ? '/uploads/' + req.file.filename : null;

    db.run(sql,
      [nome, data_nascimento, sexo, telefone, email, adminId, fotoPath],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).send('Erro ao cadastrar membro.');
        }
        // redireciona pra listagem
        res.redirect('/lista_membros');
      }
    );
  }
);


//Rota para cadastro de Usuários
app.get('/usuarios', verificarAutenticacao, (req, res) => {
  const adminId = req.session.adminId;

  db.all('SELECT * FROM usuarios WHERE admin_id = ?', [adminId], (err, usuarios) => {
    if (err) {
      console.error(err);
      return res.send('Erro ao buscar usuarios');
    }

    res.render('usuarios', { usuarios, mensagem: null });
   });
});

//Rota protegida
app.get('/usuario/dashboard', verificarUsuarioAutenticado, (req, res) => {
  const usuarioId = req.session.usuarioId;
  db.get('SELECT * FROM usuarios WHERE id = ?', [usuarioId], (err, usuario) => {
    if (err || !usuario) {
      return res.redirect('/usuario/login');
    }
    res.render('usuario_dashboard', { usuario });
  });
});


app.post('/usuarios', verificarAutenticacao, async (req, res) => {
  const { nome, data_nascimento, telefone, email, senha } = req.body;
  const adminId = req.session.adminId;

  if (!nome || !email || !senha) {
    return res.render('usuarios', { usuarios: [], mensagem: 'Preencha todos os campos!' });
  }

  try {
    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // Insere os dados no banco, incluindo a senha criptografada
    db.run(
      'INSERT INTO usuarios (nome, data_nascimento, telefone, email, senha, admin_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, data_nascimento, telefone, email, hashedPassword, adminId],
      function (err) {
        if (err) {
          console.error(err);
          return res.render('usuarios', { usuarios: [], mensagem: 'Erro ao cadastrar usuário.' });
        }

        // Redireciona após o cadastro
        res.redirect('/dashboard');
      }
    );
  } catch (error) {
    console.error(error);
    res.render('usuarios', { usuarios: [], mensagem: 'Erro ao cadastrar usuário.' });
  }
});


function verificarUsuarioAutenticado(req, res, next) {
  if (req.session && req.session.usuarioId) {
    next();
  } else {
    res.redirect('/login_usuario');
  }
}


// Página de login do usuário
app.get('/usuario/login', (req, res) => {
  res.render('login_usuario', { error: null });
});

app.get('/login_usuario', (req, res) => {
  res.render('login_usuario', { error: null });
});

// Login do usuário
app.post('/usuario/login', (req, res) => {
  const { email, senha } = req.body;

  db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err);
      return res.render('login_usuario', { error: 'Erro interno ao buscar usuário.' });
    }

    if (!usuario) {
      return res.render('login_usuario', { error: 'E-mail ou senha incorretos.' });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.render('login_usuario', { error: 'E-mail ou senha incorretos.' });
    }

    // Armazena ID do usuário e o admin vinculado
    req.session.usuarioId = usuario.id;
    req.session.usuarioEmail = usuario.email;
    req.session.adminId = usuario.admin_id; // importante!

    res.redirect('/dashboard'); // redireciona para o dashboard compartilhado
  });
});


//Rota para o usuário listar os membros
app.get('/usuario/membros', verificarUsuarioAutenticado, (req, res) => {
  const adminId = req.session.adminId;

  db.all('SELECT * FROM membros WHERE admin_id = ?', [adminId], (err, membros) => {
    if (err) {
      console.error('Erro ao buscar membros:', err);
      return res.status(500).send('Erro ao buscar membros.');
    }

    res.render('dashboard', {
      membros,
      mensagem: null,
      admin: null,
      usuario: { nome: req.session.userNome, email: req.session.userEmail }
    });
  });
});


// Sair
app.get("/logout", verificarAutenticacao, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});
app.get("/aniversariantes/hoje", verificarAutenticacao, (req, res) => {
  if (!req.session.adminId) return res.redirect("/");

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




app.get('/aniversariantes', verificarAutenticacao, (req, res) => {
  const adminId = req.session.adminId;
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1; // mês vai de 0 a 11
  const diaAtual = hoje.getDate();

  // Query para aniversariantes do mês
  db.all(
    "SELECT * FROM membros WHERE strftime('%m', data_nascimento) = ? AND admin_id = ?",
    [mesAtual.toString().padStart(2, '0'), adminId],
    (err, mesRows) => {
      if (err) {
        console.error(err);
        res.send('Erro ao buscar aniversariantes do mês');
      } else {
        // Query para aniversariantes do dia
        db.all(
          `SELECT * FROM membros WHERE strftime('%m', data_nascimento) = ? AND strftime('%d', data_nascimento) = ? AND admin_id = ?`,
          [
            mesAtual.toString().padStart(2, '0'),
            diaAtual.toString().padStart(2, '0'),
            adminId
          ],
          (err2, hojeRows) => {
            if (err2) {
              console.error(err2);
              res.send('Erro ao buscar aniversariantes do dia');
            } else {
              res.render('aniversariantes', {
                aniversariantesHoje: hojeRows,
                aniversariantesMes: mesRows
              });
            }
          }
        );
      }
    }
  );
});


app.get('/enviar-parabens/:id', verificarAutenticacao, (req, res) => {
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
      res.render('enviar-parabens', { membro, mensagem: 'Email Enviado com Sucesso!' });
    });
  }); 
});



app.post("/cadastro_membros", verificarAutenticacao, upload.single("foto"), (req, res) => {
  if (!req.session.adminId) return res.redirect("/");

  const { nome, email, data_nascimento, telefone, funcao, endereco, sexo, } = req.body;
  const foto = req.file ? "/uploads/" + req.file.filename : null;
  const adminId = req.session.adminId || req.session.usuarioId;
  const db = new sqlite3.Database('C:/Members-In-Church/db/database.db');

  db.run(
    `INSERT INTO membros (nome, email, data_nascimento, telefone, funcao, endereco, foto, admin_id, sexo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nome, email, data_nascimento, telefone, funcao, endereco, foto, adminId, sexo],
    function (err) {
      if (err) {
        console.error("Erro ao cadastrar membro:", err.message);
        return res.send("Erro ao cadastrar membro.");
      }
      req.session.mensagem = "Membro cadastrado com sucesso!";
      res.redirect("/lista_membros");
    }
  );
});

// Ver membros (para usuários)
app.get('/usuario/membros', verificarUsuarioAutenticado, (req, res) => {
  const adminId = req.session.userId;

  db.all('SELECT * FROM membros WHERE admin_id = ?', [adminId], (err, membros) => {
    if (err) {
      console.error('Erro ao buscar membros:', err);
      return res.status(500).send('Erro ao buscar membros.');
    }

    res.render('dashboard', { membros, mensagem: null }); // Corrigido!
  });
});



// Página de edição de membro
app.get("/editar/:id", verificarAutenticacao, (req, res) => {
  const id = req.params.id; // <- primeiro pega o ID
  const adminId = req.session.adminId || req.session.userId;
  const membroId = req.params.id;
  console.log('ID recebido:', id); // ✅ Verifique isso no terminal
  const sqlMembro = 'SELECT * FROM membros WHERE id = ? AND admin_id = ?';
  const sqlMinisterios = 'SELECT * FROM ministerios';


db.get(sqlMembro, [id, adminId], (err, membro) => {
    if (err || !membro) {
      console.error('Erro ao buscar membro:', err);
      return res.send("Membro não encontrado.");
    }

    db.all(sqlMinisterios, (err, ministerios) => {
      if (err) {
        console.error('Erro ao buscar ministérios:', err);
        return res.send("Erro ao buscar ministérios.");
      }

      res.render("editar", { membro, ministerios, mensagem: null });
    });
  });
});

// Atualizando membro
app.post("/editar/:id", verificarQualquerAutenticado, upload.single("foto"), (req, res) => {
  if (!req.session.adminId) return res.redirect("/");
  const id = req.params.id;
const { nome, email, data_nascimento, telefone, funcao, endereco, sexo, ministerio_id } = req.body;
  const foto = req.file ? `/uploads/${req.file.filename}` : null;

  // Se tiver foto, atualiza com foto. Senão, mantém a foto anterior.
  const sql = foto
    ? `UPDATE membros SET nome = ?, email = ?, data_nascimento = ?, telefone = ?, funcao = ?, endereco = ?, sexo = ?, ministerio_id = ?, foto = ? WHERE id = ?`
    : `UPDATE membros SET nome = ?, email = ?, data_nascimento = ?, telefone = ?, funcao = ?, endereco = ?, sexo = ?, ministerio_id = ? WHERE id = ?`;

  const params = foto
    ? [nome, email, data_nascimento, telefone, funcao, endereco, sexo, ministerio_id, foto, req.params.id]
    : [nome, email, data_nascimento, telefone, funcao, endereco, sexo, ministerio_id, req.params.id];

  db.run(sql, params, (err) => {
    if (err) {
  console.error("Erro no UPDATE:", err.message);
  return res.send("Erro ao atualizar membro.");
}

console.log("Membro atualizado com sucesso.");
req.session.mensagem = "Membro Atualizado com sucesso!";
res.redirect("/lista_membros");

  });
});




app.post("/excluir/:id", verificarAutenticacao, (req, res) => {
  if (!req.session.adminId) return res.redirect("/");

  db.run("DELETE FROM membros WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.send("Erro ao excluir membro.");
    res.redirect("/dashboard");
  });
});


app.post("/enviar-parabens", verificarAutenticacao, (req, res) => {
  if (!req.session.adminId) return res.redirect("/");

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
    html: `
  <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
    <h2 style="color: #4CAF50;">🎉 Feliz Aniversário, ${nome}! 🎉</h2>
    <p style="font-size: 16px;">
      Que o Senhor continue te abençoando com saúde, alegria e muitos motivos para sorrir.
    </p>
    <p style="font-size: 16px;">
      Toda a família da igreja celebra esse dia especial com você. 🙌
    </p>
    <p style="margin-top: 30px;">Com carinho,<br><strong>Igreja Members In Church</strong></p>
  </div>
`

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

const db = new sqlite3.Database("./db/database.db", (err) => {
  if (err) {
    console.error("Erro ao conectar com o banco de dados:", err.message);
  } else {
    console.log("Conexão com o banco de dados estabelecida com sucesso.");
  }

  db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    admin_id INTEGER,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
  )
`);



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
  }); // <-- fecha o callback da criação da tabela admins
}); // <-- fecha o callback da conexão com o banco de dados

