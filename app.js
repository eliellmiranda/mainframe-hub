(function(){
  // Nada aqui — login-screen começa display:none no HTML.
  // tryRestoreSession decide o que mostrar assim que o DOM carregar.
})();

document.addEventListener('DOMContentLoaded', () => {
// INVITE_CODE removido do front — validado via Edge Function (validate-invite)
const SESSION_KEY = 'mfhub.session.v4';
const REMEMBER_KEY = 'mfhub.remember.v1';
const SEED_VERSION = 20260330;
const STREAK_KEY = 'mfhub.streak.v1';
function getStreakData() { return readLS(STREAK_KEY, { lastDate:'', count:0, longest:0 }); }
function updateStreak() {
  const today = new Date().toISOString().slice(0,10);
  const s = getStreakData();
  if (s.lastDate === today) return s; // already updated today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const newCount = s.lastDate === yesterday ? s.count + 1 : 1;
  const newLongest = Math.max(newCount, s.longest || 0);
  const updated = { lastDate:today, count:newCount, longest:newLongest };
  writeLS(STREAK_KEY, updated);
  return updated;
}

const VERSES = [
  { text: 'Consagra ao Senhor tudo o que fazes, e os teus planos serão bem-sucedidos.', ref: 'Provérbios 16:3' },
  { text: 'Seja a graça do Senhor nosso Deus sobre nós; confirma o trabalho das nossas mãos.', ref: 'Salmos 90:17' },
  { text: 'Tudo posso naquele que me fortalece.', ref: 'Filipenses 4:13' },
  { text: 'Porque eu sei os planos que tenho para vocês — planos de fazê-los prosperar e não de causar dano, planos de dar a vocês esperança e um futuro.', ref: 'Jeremias 29:11' },
  { text: 'Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento; reconheça o Senhor em todos os seus caminhos, e ele endireitará as suas veredas.', ref: 'Provérbios 3:5-6' },
  { text: 'Não te mandei eu? Sê forte e corajoso! Não te apavores nem desanimes, pois o Senhor, teu Deus, estará contigo por onde quer que andares.', ref: 'Josué 1:9' },
  { text: 'É como árvore plantada junto a ribeiros de águas, que dá o seu fruto no tempo certo, e cuja folha não murcha; tudo o que faz prospera.', ref: 'Salmos 1:3' },
  { text: 'Emunah — fé fiel, confiança firme. O justo viverá pela sua fé.', ref: 'Habacuque 2:4' },
  { text: 'Pois sou eu que te fortaleço e te ajudo; sou eu que te sustento com minha justa destra.', ref: 'Isaías 41:10' },
  { text: 'Buscai primeiro o reino de Deus e a sua justiça, e todas essas coisas vos serão acrescentadas.', ref: 'Mateus 6:33' },
];
let currentVerseIdx = new Date().getDate() % VERSES.length;
function getDailyVerse() { return VERSES[currentVerseIdx]; }
function nextVerse() {
  currentVerseIdx = (currentVerseIdx + 1) % VERSES.length;
  // Re-render only the verse cards without full renderAll
  document.querySelectorAll('.verse-text').forEach(el => { el.textContent = '"' + getDailyVerse().text + '"'; });
  document.querySelectorAll('.verse-ref').forEach(el => { el.textContent = getDailyVerse().ref; });
}

const SUPABASE_URL = String(window.MFHUB_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(window.MFHUB_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_ENABLED = !!(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY);
const supabaseClient = SUPABASE_ENABLED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const SEEDS = {"exercises": [{"name": "COBOL — Básico", "desc": "Exercícios introdutórios de lógica, entrada de dados, laços e decisões.", "items": [{"title": "1. Olá, mundo com entrada", "prompt": "Crie um programa COBOL que:\n\nexiba uma mensagem de boas-vindas\nreceba o nome do usuário\nexiba Olá, <nome>", "answer": ""}, {"title": "2. Soma de dois números", "prompt": "Faça um programa que:\n\nleia dois números inteiros\nsome os valores\nmostre o resultado", "answer": ""}, {"title": "3. Maior de dois números", "prompt": "Leia dois números e informe qual deles é o maior.\nSe forem iguais, mostrar mensagem apropriada.", "answer": ""}, {"title": "4. Par ou ímpar", "prompt": "Receba um número inteiro e informe se ele é par ou ímpar.", "answer": ""}, {"title": "5. Cálculo de média", "prompt": "Leia 3 notas de um aluno, calcule a média e informe:\n\nAPROVADO se média >= 7\nRECUPERACAO se média entre 5 e 6,99\nREPROVADO se média < 5", "answer": ""}, {"title": "6. Tabuada", "prompt": "Leia um número e exiba sua tabuada de 1 a 10.", "answer": ""}, {"title": "7. Contador de 1 a 100", "prompt": "Mostre na tela os números de 1 até 100 usando PERFORM VARYING.", "answer": ""}, {"title": "8. Fatorial", "prompt": "Leia um número inteiro positivo e calcule o fatorial dele.\n\nNível intermediário", "answer": ""}]}, {"name": "COBOL — Intermediário", "desc": "Strings, datas, salário, leitura de arquivo, validações e OCCURS.", "items": [{"title": "9. Manipulação de string", "prompt": "Receba nome e sobrenome em campos separados e monte:\n\nnome completo\niniciais\nquantidade de caracteres", "answer": ""}, {"title": "10. Conversão de data", "prompt": "Receba uma data no formato AAAAMMDD e exiba no formato DD/MM/AAAA.", "answer": ""}, {"title": "11. Cálculo de salário líquido", "prompt": "Receba:\n\nsalário bruto\npercentual de desconto INSS\npercentual de desconto IR\n\nCalcule e mostre o salário líquido.", "answer": ""}, {"title": "12. Leitura de arquivo sequencial", "prompt": "Crie um programa que leia um arquivo com registros:\n\ncódigo do cliente\nnome\nsaldo\n\nExiba todos os registros lidos.", "answer": ""}, {"title": "13. Totalização de arquivo", "prompt": "Dado um arquivo de vendas com:\n\ncódigo do produto\nquantidade\nvalor unitário\n\nCalcule:\n\ntotal por registro\ntotal geral do arquivo", "answer": ""}, {"title": "14. Validação de CPF simples", "prompt": "Receba um CPF com 11 posições e valide:\n\nse contém apenas números\nse tem tamanho correto\n\nNão precisa calcular dígitos verificadores.", "answer": ""}, {"title": "15. Tabela em memória", "prompt": "Crie uma tabela com 10 nomes em OCCURS e permita:\n\ncarregar os nomes\npesquisar um nome informado\ndizer se encontrou ou não", "answer": ""}, {"title": "16. Classificação por faixa etária", "prompt": "Leia idade e classifique:\n\ncriança: 0 a 12\nadolescente: 13 a 17\nadulto: 18 a 59\nidoso: 60+\nNível avançado", "answer": ""}]}, {"name": "COBOL — Avançado", "desc": "Mestre x movimento, quebra de controle, merge, paginação, FILE STATUS e CALL.", "items": [{"title": "17. Processamento mestre x movimento", "prompt": "Considere:\n\narquivo mestre de clientes\narquivo movimento com inclusões, alterações e exclusões\n\nFaça um programa que atualize o mestre e gere:\n\nnovo mestre\nrelatório de inconsistências", "answer": ""}, {"title": "18. Quebra de controle", "prompt": "Leia um arquivo de vendas ordenado por filial e por produto e gere:\n\nsubtotal por produto\nsubtotal por filial\ntotal geral", "answer": ""}, {"title": "19. Merge de arquivos", "prompt": "Receba dois arquivos ordenados pelo código do cliente e gere um terceiro arquivo consolidado.", "answer": ""}, {"title": "20. Relatório paginado", "prompt": "Leia um arquivo e gere um relatório com:\n\ncabeçalho\ndetalhe\nrodapé\nnumeração de páginas\ncontagem de linhas por página", "answer": ""}, {"title": "21. Tratamento de erro de arquivo", "prompt": "Monte um programa com FILE STATUS para tratar:\n\narquivo não encontrado\nerro de leitura\nfim de arquivo", "answer": ""}, {"title": "22. Módulos e CALL", "prompt": "Crie:\n\num programa principal\num subprograma que calcule juros simples\n\nO principal envia capital, taxa e tempo; o subprograma devolve o valor dos juros.\n\nJCL\nNível básico", "answer": ""}]}, {"name": "JCL — Básico", "desc": "JOB, IEFBR14, alocação, exclusão, cópia, impressão e SORT simples.", "items": [{"title": "23. JOB simples", "prompt": "Escreva um JCL com:\n\nJOB\nEXEC PGM=IEFBR14\nDD\n\nObjetivo: apenas executar um job válido.", "answer": ""}, {"title": "24. Alocação de dataset", "prompt": "Crie um JCL usando IEFBR14 para criar um dataset sequencial com:\n\nDSORG=PS\nRECFM=FB\nLRECL=80\nespaço primário e secundário", "answer": ""}, {"title": "25. Exclusão de dataset", "prompt": "Monte um JCL para apagar um dataset existente.", "answer": ""}, {"title": "26. Copiar arquivo com IEBGENER", "prompt": "Use IEBGENER para copiar um dataset de entrada para outro dataset de saída.", "answer": ""}, {"title": "27. Imprimir dataset", "prompt": "Use IEBGENER ou utilitário equivalente para enviar um dataset para saída SYSOUT.", "answer": ""}, {"title": "28. Ordenação simples com SORT", "prompt": "Crie um JCL com SORT para ordenar um arquivo pelo campo de código em ordem crescente.\n\nNível intermediário", "answer": ""}]}, {"name": "JCL — Intermediário e Avançado", "desc": "SORT com filtros, temporários, COND, IF/THEN/ELSE, GDG, PROC e restart.", "items": [{"title": "29. SORT com filtro", "prompt": "Usando SORT, selecione apenas registros cujo tipo seja A e grave em um novo dataset.", "answer": ""}, {"title": "30. SORT com SUM FIELDS=NONE", "prompt": "Dado um arquivo com registros duplicados por chave, elimine duplicidades.", "answer": ""}, {"title": "31. Passagem de datasets temporários", "prompt": "Monte um job com 3 steps:\n\nStep 1 cria arquivo temporário\nStep 2 ordena\nStep 3 imprime\n\nUse dataset temporário &&TEMP.", "answer": ""}, {"title": "32. Uso de COND", "prompt": "Crie um job onde:\n\nstep 2 só executa se o step 1 terminar com RC = 0", "answer": ""}, {"title": "33. IDCAMS para catálogo", "prompt": "Faça um JCL com IDCAMS para:\n\nlistar um dataset\nverificar existência", "answer": ""}, {"title": "34. Geração de GDG", "prompt": "Crie uma base GDG e depois um JCL que grave uma nova geração.", "answer": ""}, {"title": "35. PROC simples", "prompt": "Crie um procedimento catalogado ou instream com:\n\nprograma\ndatasets de entrada e saída\nparâmetros simbólicos\nNível avançado", "answer": ""}, {"title": "36. Job com restart", "prompt": "Monte um job com vários steps e indique como fazer restart a partir do step 3.", "answer": ""}, {"title": "37. IF/THEN/ELSE no JCL", "prompt": "Crie um JCL que:\n\nexecute um step\nteste o return code\nexecute caminhos diferentes conforme o resultado", "answer": ""}, {"title": "38. Backup e restore lógico", "prompt": "Faça um job que:\n\ncopie dataset original para backup\nrode um programa\ncaso falhe, restaure o backup", "answer": ""}, {"title": "39. Geração de relatório com múltiplos steps", "prompt": "Monte um job com:\n\nleitura do arquivo bruto\nsort\nexecução de programa COBOL\nimpressão do relatório final", "answer": ""}, {"title": "40. Override em PROC", "prompt": "Crie uma PROC com 2 steps e, no job chamador, altere um DSN por override.\n\nDB2\nNível básico", "answer": ""}]}, {"name": "DB2 — Básico e Intermediário", "desc": "CREATE, INSERT, SELECT, JOIN, GROUP BY, CASE, LIKE e UPDATE.", "items": [{"title": "41. Criar tabela de clientes", "prompt": "Escreva o CREATE TABLE para uma tabela CLIENTES com:\n\nID_CLIENTE\nNOME\nCPF\nDATA_NASCIMENTO\nSALDO\n\nDefina chave primária.", "answer": ""}, {"title": "42. Inserir registros", "prompt": "Insira 5 clientes na tabela criada.", "answer": ""}, {"title": "43. Consultar todos os registros", "prompt": "Faça um SELECT * na tabela.", "answer": ""}, {"title": "44. Filtrar por saldo", "prompt": "Liste apenas clientes com saldo maior que 1000.", "answer": ""}, {"title": "45. Ordenação", "prompt": "Liste os clientes em ordem alfabética de nome.", "answer": ""}, {"title": "46. Atualização simples", "prompt": "Atualize o saldo de um cliente específico.", "answer": ""}, {"title": "47. Exclusão simples", "prompt": "Delete um cliente pelo ID.\n\nNível intermediário", "answer": ""}, {"title": "48. Funções agregadas", "prompt": "Crie consultas que retornem:\n\nquantidade de clientes\nsoma dos saldos\nmédia dos saldos\nmaior saldo\nmenor saldo", "answer": ""}, {"title": "49. GROUP BY", "prompt": "Considere uma tabela VENDAS com:\n\nID_VENDA\nID_CLIENTE\nVALOR\nDATA_VENDA\n\nListe o total vendido por cliente.", "answer": ""}, {"title": "50. JOIN básico", "prompt": "Considere tabelas CLIENTES e VENDAS.\nFaça um JOIN para mostrar:\n\nnome do cliente\ndata da venda\nvalor", "answer": ""}, {"title": "51. Subselect", "prompt": "Liste os clientes que possuem pelo menos uma venda.", "answer": ""}, {"title": "52. CASE", "prompt": "Faça uma consulta que classifique o cliente:\n\nPREMIUM se saldo > 10000\nINTERMEDIARIO se saldo entre 5000 e 10000\nBASICO caso contrário", "answer": ""}, {"title": "53. LIKE e BETWEEN", "prompt": "Monte consultas usando:\n\nLIKE para nomes iniciados por A\nBETWEEN para saldos entre 1000 e 5000", "answer": ""}, {"title": "54. UPDATE com condição", "prompt": "Aumente em 10% o saldo de todos os clientes com saldo inferior a 500.\n\nNível avançado", "answer": ""}]}, {"name": "DB2 — Avançado", "desc": "Cursores, SQLCODE, COMMIT, integridade, índices e VIEW.", "items": [{"title": "55. Cursores em COBOL/DB2", "prompt": "Descreva e implemente um programa COBOL com DB2 que:\n\ndeclare cursor\nabra cursor\nfaça fetch até fim\nexiba os dados", "answer": ""}, {"title": "56. Tratamento de SQLCODE", "prompt": "Crie um programa que trate:\n\nSQLCODE = 0\nSQLCODE = 100\nSQLCODE < 0", "answer": ""}, {"title": "57. INSERT com validação", "prompt": "Antes de inserir um cliente, verifique se o CPF já existe.\nSe existir, não inserir.", "answer": ""}, {"title": "58. UPDATE com COMMIT", "prompt": "Faça um programa COBOL/DB2 que atualize vários registros e execute COMMIT a cada 100 linhas.", "answer": ""}, {"title": "59. DELETE com integridade", "prompt": "Considere CLIENTES e VENDAS.\nTente excluir um cliente que tenha vendas associadas e trate a integridade referencial.", "answer": ""}, {"title": "60. JOIN com agregação", "prompt": "Liste:\n\nnome do cliente\nquantidade de vendas\nvalor total vendido\nmédia de valor por venda", "answer": ""}, {"title": "61. Índices", "prompt": "Escreva comandos para criar índice:\n\npor CPF\npor NOME\nDepois explique em qual tipo de consulta cada índice ajuda.", "answer": ""}, {"title": "62. VIEW", "prompt": "Crie uma VIEW chamada VW_CLIENTES_ATIVOS que mostre apenas clientes com saldo positivo.\n\nExercícios integrados", "answer": ""}]}, {"name": "Fluxos Integrados e Desafios", "desc": "Integração entre COBOL, JCL e DB2 com cenários batch mais completos.", "items": [{"title": "63. COBOL + JCL", "prompt": "Crie:\n\num programa COBOL que leia um arquivo de produtos\ncalcule valor total em estoque (quantidade * valor unitário)\ngere um relatório de saída\n\nDepois monte o JCL para executar esse programa.", "answer": ""}, {"title": "64. COBOL + DB2", "prompt": "Crie um programa COBOL/DB2 que:\n\nreceba um ID_CLIENTE\nconsulte nome e saldo na tabela CLIENTES\nexiba os dados\ntrate cliente não encontrado", "answer": ""}, {"title": "65. JCL + SORT + COBOL", "prompt": "Monte um fluxo em que:\n\no JCL ordena o arquivo de entrada\no COBOL faz quebra de controle por filial\ngera relatório final", "answer": ""}, {"title": "66. COBOL + DB2 + JCL", "prompt": "Monte uma solução completa:\n\ntabela VENDAS\nprograma COBOL que leia vendas do dia no DB2\ngere arquivo sequencial\njob JCL que execute o programa e imprima a saída", "answer": ""}, {"title": "67. Carga batch", "prompt": "Cenário:\n\nexiste um arquivo com novos clientes\no COBOL valida os dados\nregistros válidos são inseridos no DB2\ninválidos vão para arquivo de rejeição\no JCL executa todo o processo\n\nDesenvolva o fluxo completo.", "answer": ""}, {"title": "68. Reconciliação de saldos", "prompt": "Você possui:\n\narquivo externo com saldos\ntabela DB2 com saldos atuais\n\nCrie um processo que:\n\ncompare os valores\ngere relatório de divergências\natualize a tabela quando apropriado\n\nUse COBOL para processamento e JCL para execução.\n\nDesafios extras", "answer": ""}, {"title": "69. Simulação bancária", "prompt": "Crie um mini sistema batch com:\n\ncadastro de contas\nmovimentações\ncálculo de saldo final\nrelatório por agência\n\nPode usar arquivos ou DB2.", "answer": ""}, {"title": "70. Folha de pagamento", "prompt": "Desenvolva um processo que:\n\nleia arquivo de funcionários\ncalcule salário líquido\ngrave arquivo de pagamento\ngere relatório de totais\nexecute tudo via JCL", "answer": ""}, {"title": "71. Controle de estoque", "prompt": "Implemente:\n\ntabela de produtos\nmovimentações de entrada e saída\natualização de estoque\nlistagem de produtos abaixo do mínimo", "answer": ""}, {"title": "72. Fechamento mensal", "prompt": "Crie um job batch mensal que:\n\nselecione dados no DB2\nordene por filial e data\nprocesse via COBOL\ngere relatório final\nfaça backup da saída", "answer": ""}]}], "interviews": [{"name": "Entrevistas — Fundamentos Mainframe", "desc": "Perguntas de base para júnior: plataforma, z/OS, datasets e fluxo geral.", "items": [{"title": "Mainframe e z/OS", "prompt": "O que é um mainframe e em que tipo de empresa ele costuma ser mais usado?"}, {"title": "Mainframe x servidor comum", "prompt": "Qual a diferença entre mainframe e servidor comum?"}, {"title": "z/OS", "prompt": "O que é o z/OS?"}, {"title": "TSO/ISPF", "prompt": "O que é TSO/ISPF e para que serve?"}, {"title": "Dataset", "prompt": "O que é um dataset no mainframe?"}, {"title": "PDS/PDSE", "prompt": "Qual a diferença entre dataset sequencial e PDS/PDSE?"}, {"title": "Member", "prompt": "O que é uma member dentro de uma PDS?"}, {"title": "LOADLIB", "prompt": "O que é uma LOADLIB?"}, {"title": "Fonte x copybook x load module", "prompt": "Qual a diferença entre fonte COBOL, copybook e load module?"}, {"title": "Job", "prompt": "O que é um job?"}]}, {"name": "Entrevistas — COBOL, Arquivos e JCL", "desc": "Perguntas técnicas de júnior e júnior/intermediário sobre COBOL, arquivos e batch.", "items": [{"title": "Divisões do COBOL", "prompt": "Quais são as divisões principais de um programa COBOL?"}, {"title": "WORKING-STORAGE e FILE SECTION", "prompt": "Para que servem a WORKING-STORAGE SECTION e a FILE SECTION?"}, {"title": "PIC X x PIC 9", "prompt": "Qual a diferença entre PIC X e PIC 9?"}, {"title": "COMP-3", "prompt": "O que é COMP-3 e por que ele é usado?"}, {"title": "PERFORM", "prompt": "Qual a diferença entre PERFORM UNTIL e PERFORM VARYING?"}, {"title": "88 level", "prompt": "O que é um 88 level e por que ele é útil?"}, {"title": "READ / WRITE / REWRITE", "prompt": "Qual a diferença entre READ, WRITE e REWRITE?"}, {"title": "FILE STATUS", "prompt": "Para que serve o FILE STATUS?"}, {"title": "EOF", "prompt": "O que é EOF e como normalmente tratamos isso em COBOL?"}, {"title": "JCL básico", "prompt": "Quais são os principais blocos de um JCL?"}, {"title": "EXEC e DD", "prompt": "O que faz uma EXEC? O que faz uma DD?"}, {"title": "DISP", "prompt": "O que significa DISP=SHR, DISP=OLD e DISP=NEW,CATLG,DELETE?"}, {"title": "SYSOUT e MSGCLASS", "prompt": "Para que serve o SYSOUT? O que é MSGCLASS?"}, {"title": "PROC / COND / IF", "prompt": "O que é um PROC? O que é COND em JCL? O que é IF/THEN/ELSE em JCL e quando usar?"}]}, {"name": "Entrevistas — VSAM, DB2 e CICS", "desc": "Perguntas de acesso a dados, transações e programas online.", "items": [{"title": "VSAM", "prompt": "O que é VSAM? Qual a diferença entre KSDS e ESDS?"}, {"title": "Chave VSAM", "prompt": "O que é uma chave em um arquivo VSAM? Em que cenário usar KSDS?"}, {"title": "VSAM x DB2", "prompt": "Qual a diferença entre arquivo VSAM e tabela DB2?"}, {"title": "Cursor", "prompt": "O que é cursor? Quando usar cursor e quando evitar?"}, {"title": "COMMIT", "prompt": "O que é COMMIT? Por que COMMIT é importante em rotinas com DB2?"}, {"title": "SELECT INTO x cursor", "prompt": "Qual a diferença entre SELECT INTO e cursor?"}, {"title": "Índice e lock", "prompt": "O que é índice em DB2? Como um índice ajuda performance? O que é lock?"}, {"title": "Deadlock", "prompt": "O que é deadlock em alto nível?"}, {"title": "CICS", "prompt": "O que é CICS? Qual a diferença entre programa batch e programa online em CICS?"}, {"title": "COMMAREA", "prompt": "O que é COMMAREA? O que significa pseudo-conversational?"}, {"title": "Tempo de resposta", "prompt": "Qual a importância do tempo de resposta no CICS?"}, {"title": "Cenário bancário", "prompt": "Em que cenário um banco usaria CICS?"}]}, {"name": "Entrevistas — Pleno, Arquitetura e Troubleshooting", "desc": "Perguntas mais fortes sobre desenho de solução, performance e investigação de incidentes.", "items": [{"title": "Fluxo batch", "prompt": "Como você desenharia um fluxo batch de processamento de lançamentos bancários?"}, {"title": "Múltiplos programas", "prompt": "Como separar validação, postagem, auditoria e conciliação em programas diferentes?"}, {"title": "VSAM x DB2", "prompt": "Quando usar VSAM e quando usar DB2 em uma aplicação corporativa?"}, {"title": "Reprocessamento seguro", "prompt": "Como você pensaria em reprocessamento seguro de uma rotina batch?"}, {"title": "Restart", "prompt": "Como você desenharia um mecanismo de restart?"}, {"title": "Performance", "prompt": "Quais fatores impactam performance em COBOL batch?"}, {"title": "Gargalos", "prompt": "Como evitar gargalos em loops grandes e reduzir acessos desnecessários ao banco?"}, {"title": "Degradação", "prompt": "Como investigaria degradação de performance em batch?"}, {"title": "ABEND S0C7", "prompt": "Como você investigaria um ABEND S0C7?"}, {"title": "S013 / 806", "prompt": "Como você investigaria um S013? E um 806?"}, {"title": "Spool", "prompt": "O que você olha primeiro no spool quando um job falha?"}, {"title": "Erro de ambiente", "prompt": "Como distinguir erro de JCL, erro de programa e erro de ambiente?"}, {"title": "SQLCODE negativo", "prompt": "Como você investigaria um SQLCODE negativo em produção?"}, {"title": "EXPLAIN", "prompt": "Qual a importância do EXPLAIN em DB2, mesmo que você não seja DBA?"}, {"title": "COMMAREA e módulos", "prompt": "Como você estruturaria um programa online que chama outros módulos?"}]}, {"name": "Entrevistas — Situações Reais e Comportamentais", "desc": "Perguntas situacionais e comportamentais sem foco no laboratório.", "items": [{"title": "Legado sem documentação", "prompt": "Você recebeu um programa legado sem documentação. Como começaria a entendê-lo?"}, {"title": "Layout alterado", "prompt": "Um job começou a falhar depois de uma alteração simples de layout. Como investigaria?"}, {"title": "Registros fora do padrão", "prompt": "Um arquivo de entrada veio com registros fora do padrão. O que faria?"}, {"title": "Menos registros do que o esperado", "prompt": "Seu programa está gravando menos registros do que o esperado. Como descobriria a causa?"}, {"title": "Saldo incorreto", "prompt": "Um usuário diz que o saldo ficou errado depois do processamento noturno. Como você agiria?"}, {"title": "Pouca janela de testes", "prompt": "Você precisa alterar uma rotina crítica sem janela grande de testes. Como reduzir risco?"}, {"title": "Urgência x risco", "prompt": "O time pede urgência, mas você percebe risco alto em produção. Como se posiciona?"}, {"title": "Plantão", "prompt": "Você entra de plantão e encontra um job abendado. Quais são seus primeiros passos?"}, {"title": "Análise de causa raiz", "prompt": "Como faria análise de causa raiz de um incidente recorrente?"}, {"title": "Mainframe como carreira", "prompt": "Por que você quer trabalhar com mainframe?"}, {"title": "Sistemas antigos", "prompt": "Como você lida com sistemas antigos e pouca documentação?"}, {"title": "Erro em produção", "prompt": "Como você lida com erro em produção?"}, {"title": "Comunicação", "prompt": "Como você se comunica com analistas, testers e operação?"}, {"title": "Regra de negócio", "prompt": "O que você faz quando não entende uma regra de negócio?"}]}], "codeSpaces": [{"name": "Exemplos COBOL", "desc": "Snippets curtos para treino e consulta rápida.", "snippets": [{"title": "Olá, mundo com entrada", "lang": "COBOL", "description": "Lê um nome e exibe saudação.", "code": "IDENTIFICATION DIVISION.\nPROGRAM-ID. OLAUSER.\n\nDATA DIVISION.\nWORKING-STORAGE SECTION.\n01 WS-NOME         PIC X(30).\n\nPROCEDURE DIVISION.\n    DISPLAY 'Digite seu nome: '\n    ACCEPT WS-NOME\n    DISPLAY 'Olá, ' WS-NOME\n    GOBACK.\n"}, {"title": "Leitura sequencial com EOF", "lang": "COBOL", "description": "Esqueleto com FILE STATUS e flag de fim.", "code": "ENVIRONMENT DIVISION.\nINPUT-OUTPUT SECTION.\nFILE-CONTROL.\n    SELECT ARQ-CLIENTES ASSIGN TO 'CLIENTES'\n        ORGANIZATION IS LINE SEQUENTIAL\n        FILE STATUS IS WS-FS.\n\nDATA DIVISION.\nFILE SECTION.\nFD ARQ-CLIENTES.\n01 REG-CLIENTE.\n   05 CLI-CODIGO    PIC 9(05).\n   05 CLI-NOME      PIC X(30).\n   05 CLI-SALDO     PIC 9(07)V99.\n\nWORKING-STORAGE SECTION.\n01 WS-FS            PIC XX.\n01 WS-EOF           PIC X VALUE 'N'.\n   88 FIM-ARQUIVO   VALUE 'S'.\n\nPROCEDURE DIVISION.\n    OPEN INPUT ARQ-CLIENTES\n    PERFORM UNTIL FIM-ARQUIVO\n        READ ARQ-CLIENTES\n            AT END\n                MOVE 'S' TO WS-EOF\n            NOT AT END\n                DISPLAY CLI-CODIGO ' ' CLI-NOME ' ' CLI-SALDO\n        END-READ\n    END-PERFORM\n    CLOSE ARQ-CLIENTES\n    GOBACK.\n"}, {"title": "Subprograma com CALL", "lang": "COBOL", "description": "Exemplo simples de chamada de módulo.", "code": "*> Programa principal\nCALL 'CALCJURO' USING LK-CAPITAL LK-TAXA LK-TEMPO LK-JUROS.\n\n*> Subprograma CALCJURO\nIDENTIFICATION DIVISION.\nPROGRAM-ID. CALCJURO.\nDATA DIVISION.\nLINKAGE SECTION.\n01 LK-CAPITAL        PIC 9(07)V99.\n01 LK-TAXA           PIC 9(03)V99.\n01 LK-TEMPO          PIC 9(03).\n01 LK-JUROS          PIC 9(09)V99.\nPROCEDURE DIVISION USING LK-CAPITAL LK-TAXA LK-TEMPO LK-JUROS.\n    COMPUTE LK-JUROS = LK-CAPITAL * LK-TAXA * LK-TEMPO / 100\n    GOBACK.\n"}]}, {"name": "Exemplos JCL", "desc": "Utilitários de alocação, cópia e ordenação.", "snippets": [{"title": "Alocar dataset com IEFBR14", "lang": "JCL", "description": "Cria dataset sequencial FB LRECL 80.", "code": "//MFALLOC JOB (ACCT),'ALLOC',CLASS=A,MSGCLASS=X,NOTIFY=&SYSUID\n//STEP01  EXEC PGM=IEFBR14\n//ARQOUT  DD  DSN=SEU.HLQ.TESTE.DADOS,\n//             DISP=(NEW,CATLG,DELETE),\n//             SPACE=(CYL,(1,1)),\n//             DCB=(DSORG=PS,RECFM=FB,LRECL=80,BLKSIZE=0)\n"}, {"title": "Copiar dataset com IEBGENER", "lang": "JCL", "description": "Cópia simples de entrada para saída.", "code": "//MFCOPY  JOB (ACCT),'COPY',CLASS=A,MSGCLASS=X,NOTIFY=&SYSUID\n//STEP01  EXEC PGM=IEBGENER\n//SYSUT1  DD  DSN=SEU.HLQ.INPUT,DISP=SHR\n//SYSUT2  DD  DSN=SEU.HLQ.OUTPUT,DISP=SHR\n//SYSPRINT DD SYSOUT=*\n//SYSIN   DD DUMMY\n"}, {"title": "SORT por código", "lang": "JCL", "description": "Ordena pelo código em ordem crescente.", "code": "//MFSORT  JOB (ACCT),'SORT',CLASS=A,MSGCLASS=X,NOTIFY=&SYSUID\n//STEP01  EXEC PGM=SORT\n//SORTIN  DD DSN=SEU.HLQ.ENTRADA,DISP=SHR\n//SORTOUT DD DSN=SEU.HLQ.SAIDA,DISP=(NEW,CATLG,DELETE),\n//            SPACE=(TRK,(5,2)),DCB=(RECFM=FB,LRECL=80,BLKSIZE=0)\n//SYSOUT  DD SYSOUT=*\n//SYSIN   DD *\n  SORT FIELDS=(1,5,CH,A)\n/*\n"}]}, {"name": "Exemplos DB2 / SQL", "desc": "DDL e consultas para treino de COBOL/DB2.", "snippets": [{"title": "CREATE TABLE CLIENTES", "lang": "SQL", "description": "Tabela base usada em vários exercícios.", "code": "CREATE TABLE CLIENTES (\n    ID_CLIENTE      INTEGER      NOT NULL,\n    NOME            VARCHAR(80)  NOT NULL,\n    CPF             CHAR(11)     NOT NULL,\n    DATA_NASCIMENTO DATE,\n    SALDO           DECIMAL(15,2) DEFAULT 0,\n    CONSTRAINT PK_CLIENTES PRIMARY KEY (ID_CLIENTE)\n);\n"}, {"title": "JOIN com agregação", "lang": "SQL", "description": "Quantidade e total vendido por cliente.", "code": "SELECT\n    C.NOME,\n    COUNT(V.ID_VENDA)      AS QTDE_VENDAS,\n    SUM(V.VALOR)           AS TOTAL_VENDIDO,\n    AVG(V.VALOR)           AS MEDIA_VENDA\nFROM CLIENTES C\nJOIN VENDAS V\n  ON V.ID_CLIENTE = C.ID_CLIENTE\nGROUP BY C.NOME\nORDER BY TOTAL_VENDIDO DESC;\n"}, {"title": "VIEW de clientes ativos", "lang": "SQL", "description": "View simples para saldos positivos.", "code": "CREATE VIEW VW_CLIENTES_ATIVOS AS\nSELECT\n    ID_CLIENTE,\n    NOME,\n    CPF,\n    SALDO\nFROM CLIENTES\nWHERE SALDO > 0;\n"}]}, {"name": "Exemplos REXX e Automação", "desc": "Automação leve para ambiente mainframe.", "snippets": [{"title": "Listar membros de uma PDS", "lang": "REXX", "description": "Usa LISTDS MEMBERS.", "code": "/* REXX */\nARG pds .\nIF pds = '' THEN DO\n  SAY 'Uso: LISTPDS nome-da-pds'\n  EXIT 8\nEND\nx = OUTTRAP('output.', '*')\n\"LISTDS '\"pds\"' MEMBERS\"\nx = OUTTRAP('OFF')\nfound = 0\nDO i = 1 TO output.0\n  IF WORD(output.i,1) = '--MEMBERS--' THEN found = 1\n  ELSE IF found = 1 THEN SAY STRIP(output.i)\nEND\nEXIT 0\n"}, {"title": "Submeter membro JCL", "lang": "REXX", "description": "Exemplo simples de submit de member.", "code": "/* REXX */\nARG pds member .\nIF pds = '' | member = '' THEN DO\n  SAY 'Uso: SUBJCL nome-pds membro'\n  EXIT 8\nEND\naddress tso \"SUBMIT '\"pds\"(\"(\"member\")\")'\"\nIF RC <> 0 THEN DO\n  SAY 'Falha no SUBMIT. RC=' RC\n  EXIT 8\nEND\nSAY member 'submetido com sucesso.'\nEXIT 0\n"}]}]};

let currentUser = null;
let appData = null;
let currentSection = 'dashboard';
let currentDetail = { courseId:null, docId:null, codeSpaceId:null, codeSubspaceId:null, exerciseSpaceId:null, exerciseSubspaceId:null, interviewSpaceId:null, interviewSubspaceId:null, goalDay:null, exerciseFilter:'all', exerciseIndexOpen:true, searchResults:[] };

function readLS(k, fallback=null) { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function writeLS(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function removeLS(k) { localStorage.removeItem(k); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function nl2br(v) { return esc(v).replace(/\n/g,'<br>'); }
function fmtDate(v) { return v ? new Date(v).toLocaleString('pt-BR') : ''; }
function showToast(msg) { const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove('show'),2200); }
function userDataKey(user) { return `mfhub.data.${user}.v4`; }
function getThemeKey(user) { return `mfhub.theme.${user||'guest'}.v4`; }
function getTodayGoalKey() {
  const keys = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  return keys[new Date().getDay()];
}
function baseData() {
  return {
    courses: [],
    docs: [],
    codeSpaces: [],
    exerciseSpaces: [],
    interviewSpaces: [],
    linkedinPosts: [],
    certificates: [],
    generalNotes: [],
    noteCategories: [],
    noteRecords: [],
    tools: [],
    dailyGoals: {},
    lab: { url:'', planUrl:'emunah-bank-lab.html', title:'EMUNAH BANK LAB' },
    meta: { seedVersion:0, lastSection:'dashboard', goalSeedVersion:0, selectedGoalDay:getTodayGoalKey() }
  };
}
function ensureDefaults() {
  appData.courses ||= [];
  appData.docs ||= [];
  appData.codeSpaces ||= [];
  appData.exerciseSpaces ||= [];
  appData.interviewSpaces ||= [];
  appData.linkedinPosts ||= [];
  appData.certificates ||= [];
  appData.generalNotes ||= [];
  appData.noteCategories ||= [];
  appData.noteRecords ||= [];
  appData.tools ||= [];
  appData.dailyGoals ||= {};
  appData.lab ||= { url:'', planUrl:'emunah-bank-lab.html', title:'EMUNAH BANK LAB' };
  appData.meta ||= { seedVersion:0, lastSection:'dashboard', goalSeedVersion:0, selectedGoalDay:getTodayGoalKey() };
  appData.meta.selectedGoalDay ||= getTodayGoalKey();
  appData.courses.forEach(course => {
    course.modules ||= [];
    course.modules.forEach(module => {
      module.notes ||= [];
      module.links ||= [];
      module.attachments ||= [];
      module.submodules ||= [];
      module.videos ||= [];
      module.submodules.forEach(sub => {
        sub.notes ||= [];
        sub.links ||= [];
        sub.attachments ||= [];
        if (typeof sub.completed !== 'boolean') sub.completed = false;
      });
      module.videos.forEach(video => { if (typeof video.watched !== 'boolean') video.watched = false; });
      if (typeof module.completed !== 'boolean') module.completed = false;
    });
  });
  appData.certificates.forEach(cert => { cert.imageData ||= ''; cert.imageName ||= ''; });
}
function loadUserData() {
  appData = Object.assign(baseData(), readLS(userDataKey(currentUser), null) || {});
  ensureDefaults();
}
function saveUserData() { writeLS(userDataKey(currentUser), appData); }
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (currentUser) writeLS(getThemeKey(currentUser), theme);
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  setTheme(current === 'light' ? 'dark' : 'light');
  renderAll();
}
function applySavedTheme() {
  const theme = currentUser ? readLS(getThemeKey(currentUser), 'dark') : 'dark';
  setTheme(theme || 'dark');
}

function saveRememberedLogin(identifier) {
  // Salva apenas o e-mail — a sessão real é gerenciada pelo Supabase SDK.
  // Senha jamais deve ser armazenada em localStorage.
  writeLS(REMEMBER_KEY, { identifier, savedAt: Date.now() });
}
function clearRememberedLogin() { removeLS(REMEMBER_KEY); }
function loadRememberedLogin() {
  const remembered = readLS(REMEMBER_KEY, null);
  if (!remembered) return;
  // Limpa registro legado que possa conter senha
  if (remembered.password) {
    writeLS(REMEMBER_KEY, { identifier: remembered.identifier, savedAt: remembered.savedAt });
  }
  const userEl = document.getElementById('login-user');
  const rememberEl = document.getElementById('login-remember');
  if (userEl) userEl.value = remembered.identifier || '';
  if (rememberEl) rememberEl.checked = !!remembered.identifier;
}

function deriveUsernameFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .slice(0, 24) || 'user';
}
function getAuthRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  return url.toString();
}
function isRecoveryFlow() {
  return window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).get('recovery') === '1';
}
function cleanupAuthUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('recovery');
  history.replaceState({}, document.title, url.toString());
}
function getAuthIdentity(user) {
  const username = String(user?.user_metadata?.username || '').trim() || deriveUsernameFromEmail(user?.email || '');
  return {
    storageUser: username,
    displayName: username,
    email: String(user?.email || '').toLowerCase(),
    id: user?.id || ''
  };
}
function setFieldText(id, text, asHtml=false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (asHtml) el.innerHTML = text;
  else el.textContent = text;
}
function clearAuthMessages() {
  ['login-error','register-error','forgot-error','recovery-error'].forEach(id => setFieldText(id, ''));
}
function toggleAuth(mode='login') {
  document.getElementById('login-form').classList.toggle('hidden', mode !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', mode !== 'register');
  document.getElementById('forgot-form').classList.toggle('hidden', mode !== 'forgot');
  document.getElementById('recovery-form')?.classList.toggle('hidden', mode !== 'recovery');
  document.getElementById('auth-mode-label').textContent = ({ login:'LOGIN', register:'REGISTRO', forgot:'RESET', recovery:'NOVA SENHA' })[mode] || 'LOGIN';
  clearAuthMessages();
}
function requireSupabase(messageElId) {
  if (SUPABASE_ENABLED) return true;
  setFieldText(messageElId, 'Supabase não configurado. Crie o arquivo supabase-config.js com a URL e a Publishable key do projeto.');
  return false;
}
function showLoginScreen(mode='login') {
  document.documentElement.removeAttribute('data-auth');
  const ls = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (ls)  { ls.style.display  = 'flex'; }
  if (app) { app.style.display = 'none'; }
  toggleAuth(mode);
}
function setAuthLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? label : btn.dataset.originalLabel || btn.textContent;
  if (!loading && btn.dataset.originalLabel) btn.textContent = btn.dataset.originalLabel;
  if (loading && !btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
}
async function doLogin() {
  const email = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const remember = !!document.getElementById('login-remember')?.checked;
  setFieldText('login-error', '');
  if (!requireSupabase('login-error')) return;
  if (!email || !pass) return setFieldText('login-error', 'E-mail e senha são obrigatórios.');
  setAuthLoading('btn-login', true, 'Entrando...');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  setAuthLoading('btn-login', false);
  if (error) return setFieldText('login-error', error.message || 'Não foi possível entrar.');
  if (remember) saveRememberedLogin(email); else clearRememberedLogin();
  const identity = getAuthIdentity(data.user);
  writeLS(SESSION_KEY, { user:identity.storageUser, displayName:identity.displayName, email:identity.email, provider:'supabase' });
  cleanupAuthUrl();
  startApp(identity.storageUser, identity.displayName);
}
async function validateInviteCode(code) {
  // Valida no servidor — o código real nunca trafega para o front.
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-invite`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ code }),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.valid === true;
  } catch (e) {
    console.error('validate-invite error:', e);
    return false;
  }
}

async function doRegister() {
  const invite = document.getElementById('register-invite').value.trim();
  const email = document.getElementById('register-email').value.trim().toLowerCase();
  const user = (document.getElementById('register-user').value.trim() || deriveUsernameFromEmail(email)).trim();
  const pass = document.getElementById('register-pass').value;
  const pass2 = document.getElementById('register-pass2').value;
  setFieldText('register-error', '');
  if (!requireSupabase('register-error')) return;
  if (!invite) return setFieldText('register-error', 'Código de convite obrigatório.');
  if (!email) return setFieldText('register-error', 'E-mail obrigatório.');
  if (!user) return setFieldText('register-error', 'Usuário obrigatório.');
  const SENHAS_FRACAS = [
    '123456','1234567','12345678','123456789','1234567890',
    '12345','1234','111111','000000','password','senha','senha123',
    'qwerty','abc123','admin','admin123','letmein','welcome',
    'monkey','dragon','master','login','pass','test','guest',
    'iloveyou','sunshine','princess','football','shadow',
  ];
  if (pass.length < 8) return setFieldText('register-error', 'A senha precisa ter ao menos 8 caracteres.');
  if (SENHAS_FRACAS.includes(pass.toLowerCase())) return setFieldText('register-error', 'Senha muito comum. Escolha uma senha mais segura.');
  if (!/[A-Za-z]/.test(pass)) return setFieldText('register-error', 'A senha precisa ter ao menos uma letra.');
  if (!/[0-9]/.test(pass)) return setFieldText('register-error', 'A senha precisa ter ao menos um número.');
  if (pass !== pass2) return setFieldText('register-error', 'As senhas não conferem.');

  // Validar convite no servidor antes de criar a conta
  setAuthLoading('btn-register', true, 'Verificando convite...');
  setFieldText('register-help', 'Verificando código de convite...', false);
  const inviteOk = await validateInviteCode(invite);
  if (!inviteOk) {
    setAuthLoading('btn-register', false);
    setFieldText('register-help', '', false);
    return setFieldText('register-error', 'Código de convite inválido.');
  }
  setAuthLoading('btn-register', true, 'Criando conta...');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password: pass,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: { username: user }
    }
  });
  setAuthLoading('btn-register', false);
  if (error) return setFieldText('register-error', (error.message || 'Não foi possível criar a conta.') + ' Verifique também se o provedor de e-mail do Supabase está configurado.');
  document.getElementById('login-user').value = email;
  setFieldText('register-help', `Conta criada para <strong>${esc(email)}</strong>. Verifique sua caixa de entrada e spam.`, true);
  if (data?.session?.user) {
    const identity = getAuthIdentity(data.session.user);
    writeLS(SESSION_KEY, { user:identity.storageUser, displayName:identity.displayName, email:identity.email, provider:'supabase' });
    startApp(identity.storageUser, identity.displayName);
    return;
  }
  toggleAuth('login');
  showToast('Conta criada. Verifique seu e-mail.');
}
async function sendResetCode() {
  const email = document.getElementById('forgot-user').value.trim().toLowerCase();
  setFieldText('forgot-error', '');
  if (!requireSupabase('forgot-error')) return;
  if (!email) return setFieldText('forgot-error', 'Informe o e-mail da conta.');
  setAuthLoading('btn-forgot', true, 'Enviando...');
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl()
  });
  setAuthLoading('btn-forgot', false);
  if (error) return setFieldText('forgot-error', (error.message || 'Não foi possível enviar o link.') + ' Verifique também a configuração de SMTP no Supabase.');
  setFieldText('forgot-help', `Tentamos enviar um link de redefinição para <strong>${esc(email)}</strong>. Verifique caixa de entrada e spam. Se não chegar, configure SMTP no Supabase.`, true);
  showToast('Link de redefinição enviado.');
}
async function resetPassword() {
  const pass = document.getElementById('recovery-pass').value;
  const pass2 = document.getElementById('recovery-pass2').value;
  const email = document.getElementById('recovery-email').value.trim();
  setFieldText('recovery-error', '');
  if (!requireSupabase('recovery-error')) return;
  if (pass.length < 4) return setFieldText('recovery-error', 'A senha precisa ter ao menos 4 caracteres.');
  if (pass !== pass2) return setFieldText('recovery-error', 'As senhas não conferem.');
  setAuthLoading('btn-recovery', true, 'Salvando...');
  const { error } = await supabaseClient.auth.updateUser({ password: pass });
  setAuthLoading('btn-recovery', false);
  if (error) return setFieldText('recovery-error', error.message || 'Não foi possível redefinir a senha.');
  cleanupAuthUrl();
  try { await supabaseClient.auth.signOut(); } catch (e) {}
  document.getElementById('login-user').value = email;
  document.getElementById('login-pass').value = '';
  document.getElementById('recovery-pass').value = '';
  document.getElementById('recovery-pass2').value = '';
  toggleAuth('login');
  setFieldText('forgot-help', 'Senha redefinida com sucesso. Faça login com a nova senha.', true);
  showToast('Senha redefinida.');
}
async function logout() {
  removeLS(SESSION_KEY);
  currentUser = null;
  appData = null;
  document.documentElement.removeAttribute('data-auth');
  if (SUPABASE_ENABLED) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
  }
  location.reload();
}
async function tryRestoreSession() {
  if (!SUPABASE_ENABLED) return false;
  const recovery = isRecoveryFlow();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
    return false;
  }
  if (recovery) {
    document.getElementById('recovery-email').value = data?.session?.user?.email || '';
    showLoginScreen('recovery');
    return false;
  }
  if (!data?.session?.user) return false;
  const identity = getAuthIdentity(data.session.user);
  writeLS(SESSION_KEY, { user:identity.storageUser, displayName:identity.displayName, email:identity.email, provider:'supabase' });
  startApp(identity.storageUser, identity.displayName);
  return true;
}
function bindSupabaseAuthEvents() {
  if (!SUPABASE_ENABLED) return;
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('recovery-email').value = session?.user?.email || '';
      showLoginScreen('recovery');
      setFieldText('recovery-help', 'Link validado. Agora defina a sua nova senha.', true);
    }
  });
}
function startApp(user, displayName = user) {
  // Esconde a tela de login IMEDIATAMENTE antes de qualquer outra operação
  document.documentElement.dataset.auth = '1';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  currentUser = user;
  loadUserData();
  applySavedTheme();
  ensureSeedData();
  ensureDailyGoalsSeeded();
  updateStreak();
  document.getElementById('sidebar-user').textContent = String(displayName || user).toUpperCase() + '@MFHUB';
  document.getElementById('app').style.display = 'block';
  startClock();
  // Restore section from URL hash (browser back/forward support), fallback to saved last section
  const hashSection = location.hash.slice(1);
  const initialSection = (hashSection && document.getElementById('section-' + hashSection))
    ? hashSection
    : (appData.meta.lastSection || 'dashboard');
  goSection(initialSection, !hashSection);  // don't push if hash was already in URL
}
function setMissingSupabaseHelp() {
  if (SUPABASE_ENABLED) return;
  setFieldText('register-help', 'Crie o arquivo <strong>supabase-config.js</strong> com a URL e a Publishable key do projeto para ativar cadastro por e-mail e redefinição real de senha.', true);
  setFieldText('forgot-help', 'Sem o arquivo <strong>supabase-config.js</strong>, o envio real do link de redefinição por e-mail não funciona.', true);
}
function seedSpace(target, seed, mode) {
  const existing = new Set(target.map(x => x.name.toLowerCase()));
  if (existing.has(seed.name.toLowerCase())) return;
  if (mode === 'code') {
    target.push({
      id: uid(), name: seed.name, desc: seed.desc, attachments: [], subspaces: [
        {
          id: uid(), name:'Base', desc:'Subespaço inicial', attachments: [],
          snippets: (seed.snippets||[]).map(s => ({ id:uid(), title:s.title, lang:s.lang||'', description:s.description||'', code:s.code||'', createdAt:Date.now() })),
          createdAt:Date.now()
        }
      ], createdAt:Date.now()
    });
  } else {
    target.push({
      id: uid(), name: seed.name, desc: seed.desc, attachments: [], subspaces: [
        {
          id: uid(), name:'Base', desc:'Subespaço inicial', attachments: [],
          items: (seed.items||[]).map(it => ({ id:uid(), title:it.title, prompt:it.prompt, userAnswer:'', modelAnswer: it.answer || 'Sem resposta modelo cadastrada ainda.', createdAt:Date.now(), showModel:false })),
          createdAt:Date.now()
        }
      ], createdAt:Date.now()
    });
  }
}
function ensureSeedData() {
  if (appData.meta.seedVersion === SEED_VERSION) return;
  SEEDS.codeSpaces.forEach(s => seedSpace(appData.codeSpaces, s, 'code'));
  SEEDS.exercises.forEach(s => seedSpace(appData.exerciseSpaces, s, 'practice'));
  SEEDS.interviews.forEach(s => seedSpace(appData.interviewSpaces, s, 'practice'));
  appData.meta.seedVersion = SEED_VERSION;
  saveUserData();
}

const GOAL_WEEK = [
  ['segunda','Segunda'],
  ['terca','Terça'],
  ['quarta','Quarta'],
  ['quinta','Quinta'],
  ['sexta','Sexta'],
  ['sabado','Sábado'],
  ['domingo','Domingo']
];
const GOAL_SEED_VERSION = 20260330;
function goalDayLabel(key) { return (GOAL_WEEK.find(([k]) => k === key) || [key,key])[1]; }
function isGoalComplete(goal) { return Number(goal?.progress||0) >= Math.max(1, Number(goal?.target||1)); }
function getPreviousDayKey(dayKey) {
  const idx = GOAL_WEEK.findIndex(([k]) => k === dayKey);
  return GOAL_WEEK[(idx <= 0 ? GOAL_WEEK.length : idx) - 1][0];
}
function getOverdueGoalsForToday() {
  const todayKey = getTodayGoalKey();
  const prevKey = getPreviousDayKey(todayKey);
  return getGoalDay(prevKey).filter(goal => !isGoalComplete(goal)).map(goal => ({ dayKey:prevKey, goal }));
}
function getGoalDay(key) {
  appData.dailyGoals ||= {};
  appData.dailyGoals[key] ||= [];
  return appData.dailyGoals[key];
}
function createGoal(title, source, target=1, note='') {
  return { id:uid(), title, source, target:Math.max(1, Number(target)||1), progress:0, note, createdAt:Date.now() };
}
function firstWithContent(list, itemSelector) {
  return (list || []).find(x => Number(itemSelector(x)) > 0) || null;
}
function getGoalSuggestions(dayKey) {
  const firstCourse = appData.courses[0] || null;
  const firstCourseWithPending = appData.courses.find(c => (c.modules||[]).some(m => !m.completed)) || firstCourse;
  const firstExercise = firstWithContent(appData.exerciseSpaces, s => (s.subspaces||[]).reduce((a,ss)=>a+(ss.items||[]).length,0));
  const firstInterview = firstWithContent(appData.interviewSpaces, s => (s.subspaces||[]).reduce((a,ss)=>a+(ss.items||[]).length,0));
  const firstCode = firstWithContent(appData.codeSpaces, s => (s.subspaces||[]).reduce((a,ss)=>a+(ss.snippets||[]).length,0));
  const firstDoc = appData.docs[0] || null;
  const labTitle = appData.lab?.title || 'Emunah Lab';

  const base = {
    lab: createGoal(`Laboratório: revisar ou evoluir ${labTitle}`, 'Lab', 1, 'Abrir a área do laboratório e registrar pelo menos um ajuste.'),
    course: createGoal(firstCourseWithPending ? `Concluir 1 módulo de ${firstCourseWithPending.name}` : 'Criar ou revisar 1 módulo de curso', 'Cursos', 1),
    ex3: createGoal(firstExercise ? `Resolver 3 exercícios de ${firstExercise.name}` : 'Resolver 3 exercícios do site', 'Exercícios', 3),
    ex2: createGoal(firstExercise ? `Resolver 2 exercícios de ${firstExercise.name}` : 'Resolver 2 exercícios do site', 'Exercícios', 2),
    iv2: createGoal(firstInterview ? `Responder 2 perguntas de ${firstInterview.name}` : 'Responder 2 perguntas de entrevista', 'Entrevistas', 2),
    iv1: createGoal(firstInterview ? `Responder 1 pergunta de ${firstInterview.name}` : 'Responder 1 pergunta de entrevista', 'Entrevistas', 1),
    code2: createGoal(firstCode ? `Revisar 2 exemplos em ${firstCode.name}` : 'Revisar 2 exemplos de código', 'Código', 2),
    doc1: createGoal(firstDoc ? `Atualizar a documentação ${firstDoc.name}` : 'Atualizar 1 documentação', 'Documentação', 1),
  };
  const plans = {
    segunda: [base.lab, base.ex3],
    terca: [base.course, base.code2],
    quarta: [base.ex2, base.iv2],
    quinta: [base.course, base.doc1],
    sexta: [base.lab, base.iv1],
    sabado: [base.ex3, base.code2],
    domingo: [base.iv2, base.doc1]
  };
  return (plans[dayKey] || [base.lab, base.ex2]).map(g => ({...g, id:uid(), progress:0, createdAt:Date.now()}));
}
function ensureDailyGoalsSeeded() {
  if (appData.meta.goalSeedVersion === GOAL_SEED_VERSION) return;
  GOAL_WEEK.forEach(([dayKey]) => {
    const goals = getGoalDay(dayKey);
    if (!goals.length) appData.dailyGoals[dayKey] = getGoalSuggestions(dayKey);
  });
  appData.meta.goalSeedVersion = GOAL_SEED_VERSION;
  saveUserData();
}
function getGoalSummary(goals) {
  const total = goals.length;
  const done = goals.filter(g => Number(g.progress||0) >= Number(g.target||1)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}
function setSelectedGoalDay(dayKey) {
  currentDetail.goalDay = dayKey;
  appData.meta.selectedGoalDay = dayKey;
  saveUserData();
  renderGoals();
}
function upsertGoal(dayKey, goalId, payload) {
  const goals = getGoalDay(dayKey);
  if (goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    Object.assign(goal, payload);
    goal.target = Math.max(1, Number(goal.target)||1);
    goal.progress = Math.max(0, Math.min(Number(goal.target)||1, Number(goal.progress)||0));
  } else {
    goals.push({
      id:uid(),
      title:payload.title,
      source:payload.source || 'Personalizado',
      note:payload.note || '',
      target:Math.max(1, Number(payload.target)||1),
      progress:Math.max(0, Math.min(Number(payload.target)||1, Number(payload.progress)||0)),
      createdAt:Date.now()
    });
  }
  saveUserData();
}
function duplicateGoalSuggestions(dayKey) {
  const goals = getGoalDay(dayKey);
  const existingTitles = new Set(goals.map(g => g.title.toLowerCase()));
  let added = 0;
  getGoalSuggestions(dayKey).forEach(goal => {
    if (!existingTitles.has(goal.title.toLowerCase())) {
      goals.push(goal);
      added++;
    }
  });
  saveUserData();
  renderGoals();
  showToast(added ? `${added} meta(s) sugerida(s) adicionada(s).` : 'As metas sugeridas já estão neste dia.');
}
function toggleGoalDone(dayKey, goalId) {
  const goal = getGoalDay(dayKey).find(g => g.id === goalId); if (!goal) return;
  goal.progress = Number(goal.progress||0) >= Number(goal.target||1) ? 0 : Number(goal.target||1);
  saveUserData();
  renderGoals();
}
function stepGoalProgress(dayKey, goalId, delta) {
  const goal = getGoalDay(dayKey).find(g => g.id === goalId); if (!goal) return;
  const target = Math.max(1, Number(goal.target)||1);
  goal.progress = Math.max(0, Math.min(target, Number(goal.progress||0) + delta));
  saveUserData();
  renderGoals();
}
function deleteGoal(dayKey, goalId) {
  const name = getGoalDay(dayKey).find(g => g.id === goalId)?.title || 'esta meta';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.dailyGoals[dayKey] = getGoalDay(dayKey).filter(g => g.id !== goalId);
  saveUserData();
  renderGoals();
  showToast('Meta removida.');
}
function openGoalModal(dayKey, goalId='') {
  const goal = goalId ? getGoalDay(dayKey).find(g => g.id === goalId) : null;
  openModal(goal ? 'Editar meta diária' : 'Nova meta diária', `
    <div class="row"><label class="lbl">Título</label><input id="goal-title" class="input" value="${esc(goal?.title || '')}" placeholder="Ex: Resolver 3 exercícios de COBOL"></div>
    <div class="row"><label class="lbl">Origem</label>
      <select id="goal-source" class="select">
        ${['Personalizado','Lab','Cursos','Exercícios','Entrevistas','Código','Documentação'].map(opt => `<option value="${opt}" ${(goal?.source||'Personalizado')===opt?'selected':''}>${opt}</option>`).join('')}
      </select>
    </div>
    <div class="row"><label class="lbl">Quantidade alvo</label><input id="goal-target" class="input" type="number" min="1" value="${Number(goal?.target||1)}"></div>
    <div class="row"><label class="lbl">Progresso atual</label><input id="goal-progress" class="input" type="number" min="0" value="${Number(goal?.progress||0)}"></div>
    <div class="row"><label class="lbl">Observação</label><textarea id="goal-note" class="textarea" placeholder="Detalhes da meta">${esc(goal?.note || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveGoalModal('${dayKey}','${goalId}')">Salvar</button>`);
}
function saveGoalModal(dayKey, goalId='') {
  const title = document.getElementById('goal-title').value.trim();
  const source = document.getElementById('goal-source').value;
  const target = Number(document.getElementById('goal-target').value || 1);
  const progress = Number(document.getElementById('goal-progress').value || 0);
  const note = document.getElementById('goal-note').value.trim();
  if (!title) return;
  upsertGoal(dayKey, goalId, { title, source, target, progress, note });
  closeModal();
  renderGoals();
  showToast(goalId ? 'Meta atualizada.' : 'Meta criada.');
}
function renderGoalCard(dayKey, goal, extraMeta='') {
  const done = isGoalComplete(goal);
  const pct = Math.round((Math.min(Number(goal.progress||0), Number(goal.target||1)) / Math.max(1, Number(goal.target||1))) * 100);
  return `
    <div class="goal-card" id="goal-${dayKey}-${goal.id}">
      <div class="goal-title-row">
        <div style="display:flex; gap:10px; align-items:flex-start; flex:1">
          <input class="goal-check" type="checkbox" ${done ? 'checked' : ''} onchange="toggleGoalDone('${dayKey}','${goal.id}')">
          <div>
            <div class="row-title">${esc(goal.title)}</div>
            <div class="goal-source">${esc(goal.source || 'Personalizado')} · ${done ? 'concluída' : 'em andamento'}${extraMeta ? ' · ' + extraMeta : ''}</div>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn xs" onclick="openGoalModal('${dayKey}','${goal.id}')">Editar</button>
          <button class="btn xs danger" onclick="deleteGoal('${dayKey}','${goal.id}')">Excluir</button>
        </div>
      </div>
      <div class="goal-stat">Progresso: ${Number(goal.progress||0)} / ${Math.max(1, Number(goal.target||1))}</div>
      <div class="progress" style="margin-top:10px"><span style="width:${pct}%"></span></div>
      <div class="goal-controls">
        <button class="btn xs" onclick="stepGoalProgress('${dayKey}','${goal.id}',-1)">−</button>
        <span class="goal-pill">${pct}%</span>
        <button class="btn xs" onclick="stepGoalProgress('${dayKey}','${goal.id}',1)">+</button>
      </div>
      ${goal.note ? `<div class="row-text">${nl2br(goal.note)}</div>` : ''}
    </div>
  `;
}
function renderGoalSuggestion(dayKey, s) {
  return `<div class="row-item"><div class="row-top"><div><div class="row-title">${esc(s.title)}</div><div class="row-sub">${esc(s.source)} · alvo ${s.target}</div></div><button class="btn xs" onclick="addSuggestedGoal('${dayKey}', ${JSON.stringify(s.title)}, ${JSON.stringify(s.source)}, ${s.target}, ${JSON.stringify(s.note || '')})">Adicionar</button></div></div>`;
}
function renderGoals() {
  const section = document.getElementById('section-goals');
  const todayKey = getTodayGoalKey();
  const selectedDay = currentDetail.goalDay || appData.meta.selectedGoalDay || todayKey;
  currentDetail.goalDay = selectedDay;
  appData.meta.selectedGoalDay = selectedDay;
  const goals = getGoalDay(selectedDay);
  const summary = getGoalSummary(goals);
  const todaySummary = getGoalSummary(getGoalDay(todayKey));
  const suggestions = getGoalSuggestions(selectedDay).slice(0, 4);
  const overdue = getOverdueGoalsForToday();
  section.innerHTML = `
    <div class="headline">
      <div><div class="title">Metas diárias</div><div class="subtitle">Sistema personalizável com tarefas marcáveis e sugestões baseadas no conteúdo do site</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="duplicateGoalSuggestions('${selectedDay}')">Sugerir metas</button>
        <button class="btn primary" onclick="openGoalModal('${selectedDay}')">Nova meta</button>
      </div>
    </div>
    <div class="goal-tabs">
      ${GOAL_WEEK.map(([key,label]) => `<button class="goal-tab ${key===selectedDay?'active':''} ${key===todayKey?'today':''}" onclick="setSelectedGoalDay('${key}')">${label}${key===todayKey?' · hoje':''}</button>`).join('')}
    </div>
    ${overdue.length ? `<div class="overdue-wrap"><div class="overdue-tag">Pendentes de ${goalDayLabel(overdue[0].dayKey)}: ${overdue.length}</div></div>` : ''}
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-label">${goalDayLabel(selectedDay)}</div><div class="kpi-value">${summary.total}</div><div class="kpi-sub">metas no dia</div></div>
      <div class="kpi"><div class="kpi-label">Concluídas</div><div class="kpi-value">${summary.done}</div><div class="kpi-sub">marcadas ou completas</div></div>
      <div class="kpi"><div class="kpi-label">Progresso do dia</div><div class="kpi-value">${summary.pct}%</div><div class="kpi-sub">das metas do dia</div></div>
      <div class="kpi"><div class="kpi-label">Hoje</div><div class="kpi-value">${todaySummary.pct}%</div><div class="kpi-sub">andamento do dia atual</div></div>
    </div>
    <div class="goal-grid">
      <div class="stack">
        ${goals.length ? goals.map(goal => renderGoalCard(selectedDay, goal)).join('') : '<div class="empty">Nenhuma meta cadastrada neste dia.</div>'}
      </div>
      <div class="stack">
        ${overdue.length ? `<div class="panel"><div class="panel-title">Metas atrasadas de ${goalDayLabel(overdue[0].dayKey)}</div>${overdue.map(({dayKey, goal}) => renderGoalCard(dayKey, goal, 'atrasada')).join('')}</div>` : ''}
        <div class="panel">
          <div class="panel-title">Sugestões rápidas</div>
          ${suggestions.map(s => renderGoalSuggestion(selectedDay, s)).join('')}
        </div>
        <div class="panel">
          <div class="panel-title">Como funciona</div>
          <div class="row-text">As metas já nascem sugeridas com base nas áreas que existem no site, como laboratório, cursos, exercícios, entrevistas, código e documentação. Você pode editar o título, a quantidade alvo e o progresso a qualquer momento.</div>
          <div class="row-text">Exemplo: <strong>Segunda</strong> → Laboratório + 3 exercícios de COBOL.</div>
        </div>
      </div>
    </div>
  `;
}
function addSuggestedGoal(dayKey, title, source, target, note='') {
  upsertGoal(dayKey, '', { title, source, target, progress:0, note });
  renderGoals();
  showToast('Meta sugerida adicionada.');
}

function startClock() {
  if (window.__clockStarted) return;
  window.__clockStarted = true;
  const tick = () => document.getElementById('clock').textContent = new Date().toLocaleString('pt-BR');
  tick(); setInterval(tick, 1000);
}

function toggleMobileMenu() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('mobile-overlay').classList.toggle('open');
}
function closeMobileMenu() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('mobile-overlay').classList.remove('open');
}

function goSection(section, pushHistory = true) {
  currentSection = section;
  appData.meta.lastSection = section;
  saveUserData();
  closeMobileMenu();
  document.querySelectorAll('.section').forEach(el => { el.classList.remove('active'); el.classList.remove('fade-in'); });
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.section === section));
  const activeSection = document.getElementById('section-' + section);
  activeSection.classList.add('active');
  requestAnimationFrame(() => requestAnimationFrame(() => activeSection.classList.add('fade-in')));
  document.getElementById('topbar-path').textContent = section.toUpperCase();
  document.getElementById('status-section').textContent = section.toUpperCase();
  if (pushHistory) history.pushState({ section }, '', '#' + section);
  renderAll();
}

// Handle browser back / forward buttons
window.addEventListener('popstate', e => {
  const section = e.state?.section || (location.hash.slice(1)) || 'dashboard';
  if (document.documentElement.dataset.auth && document.getElementById('section-' + section)) {
    goSection(section, false);
  }
});

function courseProgress(course) {
  const mods = course.modules || [];
  if (!mods.length) return 0;
  const done = mods.filter(m => m.completed).length;
  return Math.round((done / mods.length) * 100);
}
function updateStatus() {
  const totals = {
    courses: appData.courses.length,
    docs: appData.docs.length,
    code: appData.codeSpaces.reduce((a,s)=>a+((s.subspaces||[]).reduce((b,ss)=>b+(ss.snippets?.length||0),0)),0),
    ex: appData.exerciseSpaces.reduce((a,s)=>a+((s.subspaces||[]).reduce((b,ss)=>b+(ss.items?.length||0),0)),0),
    iv: appData.interviewSpaces.reduce((a,s)=>a+((s.subspaces||[]).reduce((b,ss)=>b+(ss.items?.length||0),0)),0),
    linkedin: appData.linkedinPosts.length,
    certs: appData.certificates.length,
    notes: appData.generalNotes.length,
    noteCategories: appData.noteCategories.length,
    noteRecords: appData.noteRecords.length,
    tools: appData.tools.length,
    goals: Object.values(appData.dailyGoals || {}).reduce((a,list)=>a+(Array.isArray(list)?list.length:0),0),
  };
  document.getElementById('status-stats').textContent = `${totals.courses} cursos · ${totals.docs} docs · ${totals.code} códigos · ${totals.ex + totals.iv} questões · ${totals.linkedin} posts · ${totals.certs} badges · ${totals.tools} ferramentas · ${totals.notes} notas · ${totals.noteCategories} categorias · ${totals.noteRecords} registros · ${totals.goals} metas`;
}

function renderDashboard() {
  const courseAvg = appData.courses.length ? Math.round(appData.courses.reduce((a,c)=>a+courseProgress(c),0)/appData.courses.length) : 0;
  const todayKey = getTodayGoalKey();
  const todayGoals = getGoalDay(todayKey);
  const todaySummary = getGoalSummary(todayGoals);
  document.getElementById('section-dashboard').innerHTML = `
    <div class="headline">
      <div><div class="title">Dashboard</div><div class="subtitle">Visão geral, busca, terminal de login, cursos com vídeos e área de ferramentas</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="toggleTheme()">🌓 Tema</button>
        <button class="btn" onclick="goSection('goals')">🎯 Metas</button>
        <button class="btn primary" onclick="openImportCenter()">Importar conteúdo</button>
        <button class="btn" onclick="exportAllData()">⬇ Exportar backup</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Cursos</div><div class="kpi-value">${appData.courses.length}</div><div class="kpi-sub">com módulos, submódulos e vídeos</div></div>
      <div class="kpi"><div class="kpi-label">Docs</div><div class="kpi-value">${appData.docs.length}</div><div class="kpi-sub">editor + anexos</div></div>
      <div class="kpi"><div class="kpi-label">Exemplos</div><div class="kpi-value">${appData.codeSpaces.reduce((a,s)=>a+(s.subspaces?.length||0),0)}</div><div class="kpi-sub">subespaços de código</div></div>
      <div class="kpi"><div class="kpi-label">Ferramentas</div><div class="kpi-value">${appData.tools.length}</div><div class="kpi-sub">links + instruções</div></div>
      <div class="kpi"><div class="kpi-label">Certificados</div><div class="kpi-value">${appData.certificates.length}</div><div class="kpi-sub">com imagem opcional</div></div>
      <div class="kpi"><div class="kpi-label">Progresso médio</div><div class="kpi-value">${courseAvg}%</div><div class="kpi-sub">dos cursos</div></div>
      <div class="kpi" style="border-color:var(--warn)"><div class="kpi-label">Sequência</div><div class="kpi-value" style="color:var(--warn)">${getStreakData().count}🔥</div><div class="kpi-sub">dias seguidos · recorde ${getStreakData().longest}</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px;border-left:4px solid var(--accent);background:linear-gradient(135deg,var(--surface),var(--surface-2))">
      <div style="display:flex;align-items:flex-start;gap:14px">
        <span style="font-size:28px;line-height:1;flex-shrink:0">✝</span>
        <div style="flex:1;min-width:0">
          <div class="verse-text" style="font-size:15px;line-height:1.7;color:var(--text);font-style:italic">"${getDailyVerse().text}"</div>
          <div style="margin-top:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span class="verse-ref" style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:.08em">${getDailyVerse().ref}</span>
            <button class="btn xs ghost" onclick="nextVerse()" style="color:var(--text-soft);font-size:12px">próximo →</button>
          </div>
        </div>
      </div>
    </div>
    <div class="goal-grid" style="margin-bottom:16px">
      <div class="panel">
        <div class="panel-title">Metas de ${goalDayLabel(todayKey)}</div>
        <div class="row-text">${todaySummary.done} de ${todaySummary.total || 0} meta(s) concluída(s) hoje.</div>
        <div class="progress" style="margin-top:10px"><span style="width:${todaySummary.pct}%"></span></div>
        <div style="margin-top:12px" class="stack">
          ${todayGoals.slice(0,3).map(goal => `<div class="row-item"><div class="row-top"><div><div class="row-title">${esc(goal.title)}</div><div class="row-sub">${Number(goal.progress||0)} / ${Math.max(1, Number(goal.target||1))}</div></div><span class="badge ${Number(goal.progress||0) >= Math.max(1, Number(goal.target||1)) ? 'done' : ''}">${Number(goal.progress||0) >= Math.max(1, Number(goal.target||1)) ? 'Concluída' : 'Em andamento'}</span></div></div>`).join('') || '<div class="empty">Nenhuma meta cadastrada para hoje.</div>'}
        </div>
        <div style="margin-top:12px"><button class="btn small" onclick="goSection('goals')">Abrir metas diárias</button></div>
      </div>
      <div class="panel">
        <div class="panel-title">Resumo rápido</div>
        <div class="row-text">Agora os cursos aceitam módulos, submódulos, vídeos do YouTube e progresso recalculado por tudo que foi concluído.</div>
        <div class="row-text">A nova área de ferramentas centraliza utilitários, links de download e instruções de uso.</div>
      </div>
    </div>
    <div class="grid">
      ${[
        ['🎯','Metas diárias','goals','Monte e marque tarefas por dia, com sugestões automáticas baseadas no conteúdo do site.'],
        ['📝','Anotações gerais','notes','Notas rápidas e organizadas para qualquer assunto.'],
        ['📂','Cursos','courses','Cursos com módulos, submódulos, vídeos, anexos e progresso recalculável.'],
        ['📋','Documentação','docs','Espaços com editor livre e até 5 anexos.'],
        ['💻','Exemplos de código','code','Espaços > subespaços > snippets, edição e anexos.'],
        ['⚙','Exercícios','exercises','Espaços > subespaços > questões com sua resposta e resposta modelo.'],
        ['💬','Entrevistas','interviews','Mesmo fluxo dos exercícios para preparação.'],
        ['🔗','Postagem LinkedIn','linkedin','Rascunhos prontos para revisar e postar depois.'],
        ['🏅','Certificados e badges','certs','Conquistados e a conquistar, com imagem opcional.'],
        ['🧰','Ferramentas','tools','Catálogo de ferramentas com download, site oficial e instruções.'],
        ['⬡','Emunah Lab','lab','Área isolada do restante do conteúdo.']
      ].map(x=>`<div class="card clickable" onclick="goSection('${x[2]}')"><div class="card-icon">${x[0]}</div><div class="card-title">${x[1]}</div><div class="card-meta">${x[3]}</div></div>`).join('')}
    </div>
  `;
}

function courseProgress(course) {
  const modules = course.modules || [];
  let total = 0;
  let done = 0;
  modules.forEach(module => {
    total += 1;
    if (module.completed) done += 1;
    (module.submodules || []).forEach(sub => { total += 1; if (sub.completed) done += 1; });
    (module.videos || []).forEach(video => { total += 1; if (video.watched) done += 1; });
  });
  return total ? Math.round((done / total) * 100) : 0;
}

function renderCourses() {
  const wrap = document.getElementById('section-courses');
  const course = appData.courses.find(c => c.id === currentDetail.courseId);
  if (!course) {
    wrap.innerHTML = `
      <div class="headline">
        <div><div class="title">Cursos</div><div class="subtitle">Cada curso pode ter módulos, submódulos, vídeos, links, notas, arquivos e progresso</div></div>
        <button class="btn primary" onclick="openCourseModal()">Novo curso</button>
      </div>
      <div class="grid">
        ${appData.courses.map(c=>`<div class="card clickable" id="course-card-${c.id}" onclick="openCourse('${c.id}')">
          <div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openCourseEditModal('${c.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteCourse('${c.id}')">Excluir</button></div>
          <div class="card-icon">📂</div><div class="card-title">${esc(c.name)}</div>
          <div class="card-meta">${esc(c.desc||'Sem descrição')}<br>Módulos: ${(c.modules||[]).length} · Progresso: ${courseProgress(c)}%</div>
          <div style="margin-top:12px" class="progress"><span style="width:${courseProgress(c)}%"></span></div>
        </div>`).join('')}
        <div class="card new clickable" onclick="openCourseModal()"><div><div style="font-size:30px;text-align:center">+</div><div>Novo curso</div></div></div>
      </div>
    `;
    return;
  }
  const progress = courseProgress(course);
  wrap.innerHTML = `
    <div class="back" onclick="backToCourseList()">← Voltar</div>
    <div class="headline">
      <div id="course-view-${course.id}">
        <div class="title">${esc(course.name)}</div>
        <div class="subtitle">${esc(course.desc||'Curso')}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <span class="badge">Progresso recalculável: ${progress}%</span>
        <button class="btn" onclick="openCourseEditModal('${course.id}')">Editar curso</button>
        <button class="btn" onclick="recalculateCourseProgress('${course.id}')">Recalcular progresso</button>
        <button class="btn primary" onclick="openModuleModal('${course.id}')">Novo módulo</button>
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-title">Progresso do curso</div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="muted" style="margin-top:10px">O progresso considera módulos, submódulos e vídeos marcados como concluídos/assistidos.</div>
    </div>
    <div class="stack">
      ${(course.modules||[]).length ? course.modules.map(m=>renderCourseModule(course,m)).join('') : '<div class="empty">Nenhum módulo criado ainda.</div>'}
    </div>
  `;
}
function renderCourseModule(course, module) {
  return `
  <div class="panel" id="course-module-${module.id}">
    <div class="row-top">
      <div>
        <div class="row-title">${esc(module.name)} ${module.completed ? '<span class="badge done">Concluído</span>' : ''}</div>
        <div class="row-sub">${esc(module.desc||'Sem descrição')} · ${(module.notes||[]).length} notas · ${(module.links||[]).length} links · ${(module.attachments||[]).length} arquivos · ${(module.submodules||[]).length} submódulos · ${(module.videos||[]).length} vídeos</div>
      </div>
      <div class="row-actions">
        <button class="btn xs" onclick="toggleModuleDone('${course.id}','${module.id}')">${module.completed ? 'Desmarcar' : 'Marcar concluído'}</button>
        <button class="btn xs" onclick="openCourseNoteModal('${course.id}','${module.id}')">Anotação</button>
        <button class="btn xs" onclick="openCourseLinkModal('${course.id}','${module.id}')">Link</button>
        <button class="btn xs" onclick="uploadAttachmentsModal('course-module','${course.id}','${module.id}')">Arquivos</button>
        <button class="btn xs" onclick="openSubmoduleModal('${course.id}','${module.id}')">Submódulo</button>
        <button class="btn xs" onclick="openCourseVideoModal('${course.id}','${module.id}')">Vídeo</button>
        <button class="btn xs danger" onclick="deleteModule('${course.id}','${module.id}')">Excluir</button>
      </div>
    </div>
    <div class="cols-2" style="margin-top:14px">
      <div class="stack">
        <div class="row-item">
          <div class="panel-title">Anotações</div>
          ${(module.notes||[]).length ? module.notes.map(n=>`<div class="row-item" id="course-note-${n.id}" style="margin-top:10px"><div class="row-top"><div><div class="row-title">${esc(n.title)}</div><div class="row-sub">${fmtDate(n.createdAt)}</div></div><button class="btn xs danger" onclick="deleteCourseNote('${course.id}','${module.id}','${n.id}')">Excluir</button></div><div class="row-text">${nl2br(n.content)}</div></div>`).join('') : '<div class="empty">Sem anotações.</div>'}
        </div>
        <div class="row-item">
          <div class="panel-title">Links</div>
          ${(module.links||[]).length ? module.links.map(l=>`<div class="file-row"><div class="file-name"><strong>${esc(l.title)}</strong><div class="row-sub"><a href="${esc(l.url)}" target="_blank">${esc(l.url)}</a></div></div><button class="btn xs danger" onclick="deleteCourseLink('${course.id}','${module.id}','${l.id}')">Excluir</button></div>`).join('') : '<div class="empty">Sem links.</div>'}
        </div>
        <div class="row-item">
          <div class="panel-title">Submódulos</div>
          ${(module.submodules||[]).length ? module.submodules.map(sub=>renderCourseSubmodule(course,module,sub)).join('') : '<div class="empty">Nenhum submódulo neste módulo.</div>'}
        </div>
      </div>
      <div class="stack">
        <div class="row-item">
          <div class="panel-title">Arquivos do módulo (até 5)</div>
          ${renderAttachments(module.attachments||[], 'course-module', course.id, module.id)}
        </div>
        <div class="row-item">
          <div class="panel-title">Vídeos do YouTube</div>
          ${(module.videos||[]).length ? module.videos.map(video => renderCourseVideo(course,module,video)).join('') : '<div class="empty">Nenhum vídeo cadastrado.</div>'}
        </div>
      </div>
    </div>
  </div>`;
}
function renderCourseSubmodule(course, module, sub) {
  return `
    <div class="submodule-card" id="course-submodule-${sub.id}">
      <div class="row-top">
        <div>
          <div class="row-title">${esc(sub.name)} ${sub.completed ? '<span class="badge done">Concluído</span>' : ''}</div>
          <div class="row-sub">${esc(sub.desc||'Sem descrição')} · ${(sub.notes||[]).length} notas · ${(sub.links||[]).length} links · ${(sub.attachments||[]).length} arquivos</div>
        </div>
        <div class="row-actions">
          <button class="btn xs" onclick="toggleSubmoduleDone('${course.id}','${module.id}','${sub.id}')">${sub.completed ? 'Desmarcar' : 'Concluir'}</button>
          <button class="btn xs" onclick="openCourseNoteModal('${course.id}','${module.id}','${sub.id}')">Anotação</button>
          <button class="btn xs" onclick="openCourseLinkModal('${course.id}','${module.id}','${sub.id}')">Link</button>
          <button class="btn xs" onclick="uploadAttachmentsModal('course-submodule','${course.id}','${sub.id}','${module.id}')">Arquivos</button>
          <button class="btn xs danger" onclick="deleteSubmodule('${course.id}','${module.id}','${sub.id}')">Excluir</button>
        </div>
      </div>
      ${(sub.notes||[]).length ? `<div class="row-text" style="margin-top:12px">${nl2br(sub.notes.map(n => `${n.title}: ${n.content}`).join('\n\n'))}</div>` : ''}
      ${(sub.links||[]).length ? `<div class="row-text" style="margin-top:12px">${sub.links.map(l => `<a href="${esc(l.url)}" target="_blank">${esc(l.title)}</a>`).join(' · ')}</div>` : ''}
      <div style="margin-top:12px">${renderAttachments(sub.attachments||[], 'course-submodule', course.id, sub.id, module.id)}</div>
    </div>`;
}
function renderCourseVideo(course, module, video) {
  const ytId = extractYouTubeId(video.url || '');
  return `
    <div class="submodule-card" id="course-video-${video.id}">
      <div class="row-top">
        <div>
          <div class="row-title">${esc(video.title)} ${video.watched ? '<span class="badge done">Assistido</span>' : ''}</div>
          <div class="row-sub">${esc(video.url)}</div>
        </div>
        <div class="row-actions">
          <button class="btn xs" onclick="toggleCourseVideoWatched('${course.id}','${module.id}','${video.id}')">${video.watched ? 'Desmarcar' : 'Marcar assistido'}</button>
          <button class="btn xs danger" onclick="deleteCourseVideo('${course.id}','${module.id}','${video.id}')">Excluir</button>
        </div>
      </div>
      ${ytId ? `<div class="video-embed-wrap"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen loading="lazy"></iframe></div>` : ''}
    </div>`;
}
function openCourseModal() {
  openModal('Novo curso', `
    <div class="row"><label class="lbl">Nome</label><input id="course-name" class="input"></div>
    <div class="row"><label class="lbl">Descrição</label><input id="course-desc" class="input"></div>
  `, `<button class="btn primary" onclick="saveCourse()">Salvar</button>`);
}
function saveCourse() {
  const name = document.getElementById('course-name').value.trim();
  const desc = document.getElementById('course-desc').value.trim();
  if (!name) return;
  appData.courses.push({ id:uid(), name, desc, modules:[], createdAt:Date.now() });
  saveUserData(); closeModal(); renderAll(); showToast('Curso criado.');
}
function openCourseEditModal(courseId) {
  const course = appData.courses.find(c=>c.id===courseId); if(!course) return;
  openModal('Editar curso', `<div class="row"><label class="lbl">Nome</label><input id="course-edit-name" class="input" value="${esc(course.name)}"></div><div class="row"><label class="lbl">Descrição</label><input id="course-edit-desc" class="input" value="${esc(course.desc||'')}"></div>`, `<button class="btn primary" onclick="saveCourseEdit('${courseId}')">Salvar</button>`);
}
function saveCourseEdit(courseId) {
  const course = appData.courses.find(c=>c.id===courseId); if(!course) return;
  const name = document.getElementById('course-edit-name').value.trim();
  const desc = document.getElementById('course-edit-desc').value.trim();
  if (!name) return;
  course.name = name;
  course.desc = desc;
  saveUserData(); closeModal(); renderCourses(); renderDashboard(); updateStatus(); showToast('Curso atualizado.');
}
function openCourse(id) { currentDetail.courseId=id; renderCourses(); }
function deleteCourse(id) {
  const name = appData.courses.find(c=>c.id===id)?.name || 'este curso';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.courses = appData.courses.filter(c=>c.id!==id);
  currentDetail.courseId = null; saveUserData(); renderAll(); showToast('Curso excluído.');
}
function openModuleModal(courseId) {
  openModal('Novo módulo', `
    <div class="row"><label class="lbl">Nome do módulo</label><input id="module-name" class="input"></div>
    <div class="row"><label class="lbl">Descrição</label><input id="module-desc" class="input"></div>
  `, `<button class="btn primary" onclick="saveModule('${courseId}')">Salvar</button>`);
}
function saveModule(courseId) {
  const course = appData.courses.find(c=>c.id===courseId); if (!course) return;
  const name = document.getElementById('module-name').value.trim(); const desc=document.getElementById('module-desc').value.trim();
  if (!name) return;
  course.modules ||= [];
  course.modules.push({ id:uid(), name, desc, completed:false, notes:[], links:[], attachments:[], submodules:[], videos:[], createdAt:Date.now() });
  saveUserData(); closeModal(); renderCourses(); updateStatus(); showToast('Módulo criado.');
}
function openSubmoduleModal(courseId,moduleId) {
  openModal('Novo submódulo', `
    <div class="row"><label class="lbl">Nome do submódulo</label><input id="submodule-name" class="input"></div>
    <div class="row"><label class="lbl">Descrição</label><input id="submodule-desc" class="input"></div>
  `, `<button class="btn primary" onclick="saveSubmodule('${courseId}','${moduleId}')">Salvar</button>`);
}
function saveSubmodule(courseId,moduleId) {
  const module = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!module) return;
  const name = document.getElementById('submodule-name').value.trim();
  const desc = document.getElementById('submodule-desc').value.trim();
  if (!name) return;
  module.submodules ||= [];
  module.submodules.push({ id:uid(), name, desc, completed:false, notes:[], links:[], attachments:[], createdAt:Date.now() });
  saveUserData(); closeModal(); renderCourses(); showToast('Submódulo criado.');
}
function openCourseVideoModal(courseId,moduleId) {
  openModal('Novo vídeo do YouTube', `
    <div class="row"><label class="lbl">Título</label><input id="video-title" class="input"></div>
    <div class="row"><label class="lbl">URL do YouTube</label><input id="video-url" class="input" placeholder="https://www.youtube.com/watch?v=..."></div>
    <div class="auth-note">O progresso do curso considera vídeos marcados como assistidos. Em HTML local, esse controle é manual para ficar estável.</div>
  `, `<button class="btn primary" onclick="saveCourseVideo('${courseId}','${moduleId}')">Salvar</button>`);
}
function saveCourseVideo(courseId,moduleId) {
  const module = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!module) return;
  const title = document.getElementById('video-title').value.trim();
  const url = document.getElementById('video-url').value.trim();
  if (!title || !url) return;
  module.videos ||= [];
  module.videos.push({ id:uid(), title, url, watched:false, createdAt:Date.now() });
  saveUserData(); closeModal(); renderCourses(); showToast('Vídeo adicionado ao curso.');
}
function extractYouTubeId(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const m = value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}
function toggleCourseVideoWatched(courseId,moduleId,videoId) {
  const video = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId)?.videos?.find(v=>v.id===videoId); if (!video) return;
  video.watched = !video.watched;
  saveUserData(); renderCourses(); renderDashboard(); updateStatus(); showToast('Progresso do vídeo atualizado.');
}
function deleteCourseVideo(courseId,moduleId,videoId) {
  const module = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!module) return;
  const name = module.videos?.find(v=>v.id===videoId)?.title || 'este vídeo';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  module.videos = (module.videos || []).filter(v=>v.id!==videoId);
  saveUserData(); renderCourses(); showToast('Vídeo removido.');
}
function toggleModuleDone(courseId,moduleId) {
  const m = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!m) return;
  m.completed = !m.completed; saveUserData(); renderCourses(); showToast('Progresso atualizado.');
}
function toggleSubmoduleDone(courseId,moduleId,subId) {
  const sub = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId)?.submodules?.find(s=>s.id===subId); if (!sub) return;
  sub.completed = !sub.completed; saveUserData(); renderCourses(); showToast('Submódulo atualizado.');
}
function recalculateCourseProgress(courseId) { renderCourses(); renderDashboard(); showToast('Progresso recalculado.'); }
function deleteModule(courseId,moduleId) {
  const course = appData.courses.find(c=>c.id===courseId); if (!course) return;
  const name = course.modules?.find(m=>m.id===moduleId)?.name || 'este módulo';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  course.modules = (course.modules||[]).filter(m=>m.id!==moduleId); saveUserData(); renderCourses(); showToast('Módulo excluído.');
}
function deleteSubmodule(courseId,moduleId,subId) {
  const module = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!module) return;
  const name = module.submodules?.find(s=>s.id===subId)?.name || 'este submódulo';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  module.submodules = (module.submodules||[]).filter(s=>s.id!==subId); saveUserData(); renderCourses(); showToast('Submódulo excluído.');
}
function getCourseTarget(courseId,moduleId,subId='') {
  const module = appData.courses.find(c=>c.id===courseId)?.modules?.find(m=>m.id===moduleId); if (!module) return null;
  if (!subId) return module;
  return module.submodules?.find(s=>s.id===subId) || null;
}
function openCourseNoteModal(courseId,moduleId,subId='') {
  openModal(subId ? 'Nova anotação do submódulo' : 'Nova anotação', `<div class="row"><label class="lbl">Título</label><input id="note-title" class="input"></div><div class="row"><label class="lbl">Conteúdo</label><textarea id="note-content" class="textarea"></textarea></div>`, `<button class="btn primary" onclick="saveCourseNote('${courseId}','${moduleId}','${subId}')">Salvar</button>`);
}
function saveCourseNote(courseId,moduleId,subId='') {
  const holder = getCourseTarget(courseId,moduleId,subId); if (!holder) return;
  const title=document.getElementById('note-title').value.trim(); const content=document.getElementById('note-content').value.trim(); if(!title)return;
  holder.notes ||= [];
  holder.notes.push({ id:uid(), title, content, createdAt:Date.now() }); saveUserData(); closeModal(); renderCourses(); showToast('Anotação salva.');
}
function deleteCourseNote(courseId,moduleId,noteId) {
  const holder = getCourseTarget(courseId,moduleId,''); if (!holder) return;
  const name = holder.notes?.find(n=>n.id===noteId)?.title || 'esta anotação';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  holder.notes = (holder.notes||[]).filter(n=>n.id!==noteId); saveUserData(); renderCourses(); showToast('Anotação removida.');
}
function openCourseLinkModal(courseId,moduleId,subId='') {
  openModal(subId ? 'Novo link do submódulo' : 'Novo link', `<div class="row"><label class="lbl">Título</label><input id="link-title" class="input"></div><div class="row"><label class="lbl">URL</label><input id="link-url" class="input" placeholder="https://..."></div>`, `<button class="btn primary" onclick="saveCourseLink('${courseId}','${moduleId}','${subId}')">Salvar</button>`);
}
function saveCourseLink(courseId,moduleId,subId='') {
  const holder = getCourseTarget(courseId,moduleId,subId); if (!holder) return;
  const title=document.getElementById('link-title').value.trim(); const url=document.getElementById('link-url').value.trim(); if(!url)return;
  holder.links ||= [];
  holder.links.push({ id:uid(), title:title||url, url, createdAt:Date.now() }); saveUserData(); closeModal(); renderCourses(); showToast('Link salvo.');
}
function deleteCourseLink(courseId,moduleId,linkId) {
  const holder = getCourseTarget(courseId,moduleId,''); if (!holder) return;
  const name = holder.links?.find(l=>l.id===linkId)?.title || 'este link';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  holder.links = (holder.links||[]).filter(l=>l.id!==linkId); saveUserData(); renderCourses(); showToast('Link removido.');
}

function renderDocs() {
  const wrap = document.getElementById('section-docs');
  const doc = appData.docs.find(d=>d.id===currentDetail.docId);
  if (!doc) {
    wrap.innerHTML = `
      <div class="headline"><div><div class="title">Documentação</div><div class="subtitle">Espaços livres com editor e até 5 anexos</div></div><button class="btn primary" onclick="openDocModal()">Novo espaço</button></div>
      <div class="grid">
        ${appData.docs.map(d=>`<div class="card clickable" id="doc-card-${d.id}" onclick="openDoc('${d.id}')"><div class="card-actions"><button class="btn xs danger" onclick="event.stopPropagation();deleteDoc('${d.id}')">Excluir</button></div><div class="card-icon">📋</div><div class="card-title">${esc(d.name)}</div><div class="card-meta">${esc(d.desc||'Sem descrição')}<br>${(d.attachments||[]).length} anexos</div></div>`).join('')}
        <div class="card new clickable" onclick="openDocModal()"><div><div style="font-size:30px;text-align:center">+</div><div>Novo espaço</div></div></div>
      </div>
    `;
    return;
  }
  wrap.innerHTML = `
    <div class="back" onclick="backToDocList()">← Voltar</div>
    <div class="headline">
      <div id="doc-${doc.id}"><div class="title">${esc(doc.name)}</div><div class="subtitle">${esc(doc.desc||'Documentação')}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="uploadAttachmentsModal('doc','${doc.id}')">Arquivos</button>
        <button class="btn primary" onclick="saveDocContent('${doc.id}')">Salvar</button>
      </div>
    </div>
    <div class="cols-2">
      <div class="panel">
        <div class="panel-title">Conteúdo</div>
        <textarea id="doc-editor" class="textarea" style="min-height:440px">${esc(doc.content||'')}</textarea>
      </div>
      <div class="panel">
        <div class="panel-title">Arquivos (até 5)</div>
        ${renderAttachments(doc.attachments||[], 'doc', doc.id)}
      </div>
    </div>
  `;
}
function openDocModal() {
  openModal('Novo espaço de documentação', `<div class="row"><label class="lbl">Nome</label><input id="doc-name" class="input"></div><div class="row"><label class="lbl">Descrição</label><input id="doc-desc" class="input"></div>`, `<button class="btn primary" onclick="saveDoc()">Salvar</button>`);
}
function saveDoc() {
  const name=document.getElementById('doc-name').value.trim(); const desc=document.getElementById('doc-desc').value.trim(); if(!name)return;
  appData.docs.push({ id:uid(), name, desc, content:'', attachments:[], createdAt:Date.now() }); saveUserData(); closeModal(); renderAll(); showToast('Espaço criado.');
}
function openDoc(id) { currentDetail.docId=id; renderDocs(); }
function deleteDoc(id) {
  const name = appData.docs.find(d=>d.id===id)?.name || 'este espaço';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.docs = appData.docs.filter(d=>d.id!==id); currentDetail.docId=null; saveUserData(); renderAll(); showToast('Espaço excluído.');
}
function saveDocContent(id) {
  const doc = appData.docs.find(d=>d.id===id); if(!doc) return;
  doc.content = document.getElementById('doc-editor').value; saveUserData(); showToast('Documento salvo.');
}

function renderCode() {
  const wrap = document.getElementById('section-code');
  const space = appData.codeSpaces.find(s=>s.id===currentDetail.codeSpaceId);
  if (!space) {
    wrap.innerHTML = `
      <div class="headline"><div><div class="title">Exemplos de código</div><div class="subtitle">Espaços com subespaços, snippets e anexos</div></div><div style="display:flex;gap:10px"><button class="btn" onclick="openImportCenter('code')">Importar</button><button class="btn primary" onclick="openGenericSpaceModal('code')">Novo espaço</button></div></div>
      <div class="grid">
        ${appData.codeSpaces.map(s=>`<div class="card clickable" id="code-space-${s.id}" onclick="openCodeSpace('${s.id}')"><div class="card-actions"><button class="btn xs danger" onclick="event.stopPropagation();deleteGenericSpace('code','${s.id}')">Excluir</button></div><div class="card-icon">💻</div><div class="card-title">${esc(s.name)}</div><div class="card-meta">${esc(s.desc||'Sem descrição')}<br>Subespaços: ${(s.subspaces||[]).length}</div></div>`).join('')}
        <div class="card new clickable" onclick="openGenericSpaceModal('code')"><div><div style="font-size:30px;text-align:center">+</div><div>Novo espaço</div></div></div>
      </div>`;
    return;
  }
  const sub = (space.subspaces||[]).find(ss=>ss.id===currentDetail.codeSubspaceId) || null;
  if (!sub) {
    wrap.innerHTML = `
      <div class="back" onclick="backToCodeList()">← Voltar</div>
      <div class="headline"><div id="code-space-view-${space.id}"><div class="title">${esc(space.name)}</div><div class="subtitle">${esc(space.desc||'Espaço de código')}</div></div><button class="btn primary" onclick="openSubspaceModal('code','${space.id}')">Novo subespaço</button></div>
      <div class="grid">
        ${(space.subspaces||[]).map(ss=>`<div class="card clickable" id="code-subspace-${ss.id}" onclick="openCodeSubspace('${space.id}','${ss.id}')"><div class="card-actions"><button class="btn xs danger" onclick="event.stopPropagation();deleteSubspace('code','${space.id}','${ss.id}')">Excluir</button></div><div class="card-icon">🧩</div><div class="card-title">${esc(ss.name)}</div><div class="card-meta">${esc(ss.desc||'Sem descrição')}<br>Snippets: ${(ss.snippets||[]).length} · Arquivos: ${(ss.attachments||[]).length}</div></div>`).join('')}
      </div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="back" onclick="backToCodeSpace()">← Voltar</div>
    <div class="headline"><div id="code-subspace-view-${sub.id}"><div class="title">${esc(sub.name)}</div><div class="subtitle">${esc(sub.desc||'Subespaço')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="uploadAttachmentsModal('code-subspace','${space.id}','${sub.id}')">Arquivos</button><button class="btn primary" onclick="openSnippetModal('${space.id}','${sub.id}')">Novo snippet</button></div></div>
    <div class="cols-2">
      <div class="stack">
        ${(sub.snippets||[]).length ? sub.snippets.map(sn=>`<div class="panel" id="snippet-${sn.id}"><div class="row-top"><div><div class="row-title">${esc(sn.title)}</div><div class="row-sub">${esc(sn.lang||'Código')} · ${esc(sn.description||'')}</div></div><div class="row-actions"><button class="btn xs" onclick="openSnippetModal('${space.id}','${sub.id}','${sn.id}')">Editar</button><button class="btn xs danger" onclick="deleteSnippet('${space.id}','${sub.id}','${sn.id}')">Excluir</button></div></div><pre class="row-text" style="font-family:'Share Tech Mono',monospace;overflow:auto;background:var(--input);padding:12px;border-radius:12px;margin-top:12px">${esc(sn.code)}</pre></div>`).join('') : '<div class="empty">Nenhum snippet neste subespaço.</div>'}
      </div>
      <div class="panel"><div class="panel-title">Arquivos do subespaço (até 5)</div>${renderAttachments(sub.attachments||[], 'code-subspace', space.id, sub.id)}</div>
    </div>`;
}
function openCodeSpace(id) { currentDetail.codeSpaceId=id; currentDetail.codeSubspaceId=null; renderCode(); }
function openCodeSubspace(spaceId, subId) { currentDetail.codeSpaceId=spaceId; currentDetail.codeSubspaceId=subId; renderCode(); }
function openSnippetModal(spaceId, subId, snippetId='') {
  const sub = appData.codeSpaces.find(s=>s.id===spaceId)?.subspaces?.find(ss=>ss.id===subId); if(!sub)return;
  const snippet = snippetId ? (sub.snippets||[]).find(sn=>sn.id===snippetId) : null;
  openModal(snippet ? 'Editar snippet' : 'Novo snippet', `<div class="row"><label class="lbl">Título</label><input id="sn-title" class="input" value="${esc(snippet?.title||'')}"></div><div class="row"><label class="lbl">Linguagem</label><input id="sn-lang" class="input" placeholder="COBOL, JCL, SQL..." value="${esc(snippet?.lang||'')}"></div><div class="row"><label class="lbl">Descrição</label><input id="sn-desc" class="input" value="${esc(snippet?.description||'')}"></div><div class="row"><label class="lbl">Código</label><textarea id="sn-code" class="textarea" style="min-height:260px">${esc(snippet?.code||'')}</textarea></div>`, `<button class="btn primary" onclick="saveSnippet('${spaceId}','${subId}','${snippetId}')">Salvar</button>`);
}
function saveSnippet(spaceId, subId, snippetId='') {
  const sub = appData.codeSpaces.find(s=>s.id===spaceId)?.subspaces?.find(ss=>ss.id===subId); if(!sub)return;
  const title=document.getElementById('sn-title').value.trim(); const lang=document.getElementById('sn-lang').value.trim(); const description=document.getElementById('sn-desc').value.trim(); const code=document.getElementById('sn-code').value;
  if(!title || !code.trim()) return;
  if (snippetId) {
    const snippet = (sub.snippets||[]).find(sn=>sn.id===snippetId); if(!snippet)return;
    Object.assign(snippet, { title, lang, description, code });
  } else {
    sub.snippets.push({ id:uid(), title, lang, description, code, createdAt:Date.now() });
  }
  saveUserData(); closeModal(); renderCode(); updateStatus(); showToast(snippetId ? 'Snippet atualizado.' : 'Snippet salvo.');
}
function deleteSnippet(spaceId, subId, snId) {
  const sub = appData.codeSpaces.find(s=>s.id===spaceId)?.subspaces?.find(ss=>ss.id===subId); if(!sub)return;
  const name = sub.snippets?.find(s=>s.id===snId)?.title || 'este snippet';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  sub.snippets = (sub.snippets||[]).filter(s=>s.id!==snId); saveUserData(); renderCode(); showToast('Snippet removido.');
}

function isPracticeAnswered(item) { return !!String(item?.userAnswer || '').trim(); }
function practiceFilterOptions(kind) {
  return [['all','Todas'],['answered','Respondidas'],['unanswered','Não respondidas']];
}
function getPracticeFilter(kind) {
  return kind === 'exercise' ? (currentDetail.exerciseFilter || 'all') : 'all';
}
function setPracticeFilter(kind, value) {
  if (kind === 'exercise') currentDetail.exerciseFilter = value;
  renderPractice(kind);
}
function getFilteredPracticeItems(kind, items) {
  const filter = getPracticeFilter(kind);
  if (filter === 'answered') return items.filter(isPracticeAnswered);
  if (filter === 'unanswered') return items.filter(item => !isPracticeAnswered(item));
  return items;
}
function scrollPracticeItem(kind, itemId) {
  const el = document.getElementById(`${kind}-item-${itemId}`);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}
function togglePracticeIndex(kind) {
  if (kind === 'exercise') currentDetail.exerciseIndexOpen = !currentDetail.exerciseIndexOpen;
  renderPractice(kind);
}
function togglePracticeMinimized(kind, spaceId, subId, itemId) {
  const item = getPracticeSubspace(kind, spaceId, subId)?.items?.find(i=>i.id===itemId); if(!item)return;
  item.minimized = !item.minimized;
  saveUserData();
  renderPractice(kind);
}


// ── Navigation helpers (needed because currentDetail is not global) ──
function backToPracticeList(kind) {
  if (kind === 'exercise') { currentDetail.exerciseSpaceId = null; currentDetail.exerciseSubspaceId = null; renderExercises(); }
  else { currentDetail.interviewSpaceId = null; currentDetail.interviewSubspaceId = null; renderInterviews(); }
}
function backToPracticeSpace(kind) {
  if (kind === 'exercise') { currentDetail.exerciseSubspaceId = null; renderExercises(); }
  else { currentDetail.interviewSubspaceId = null; renderInterviews(); }
}
function backToCodeList() { currentDetail.codeSpaceId = null; currentDetail.codeSubspaceId = null; renderCode(); }
function backToCodeSpace() { currentDetail.codeSubspaceId = null; renderCode(); }
function backToCourseList() { currentDetail.courseId = null; renderCourses(); }
function backToDocList() { currentDetail.docId = null; renderDocs(); }

function renderPractice(kind) {
  const sectionId = kind === 'exercise' ? 'section-exercises' : 'section-interviews';
  const title = kind === 'exercise' ? 'Exercícios' : 'Entrevistas';
  const spaces = kind === 'exercise' ? appData.exerciseSpaces : appData.interviewSpaces;
  const spaceIdKey = kind === 'exercise' ? 'exerciseSpaceId' : 'interviewSpaceId';
  const subIdKey = kind === 'exercise' ? 'exerciseSubspaceId' : 'interviewSubspaceId';
  const space = spaces.find(s=>s.id===currentDetail[spaceIdKey]);
  const wrap = document.getElementById(sectionId);
  if (!space) {
    wrap.innerHTML = `
      <div class="headline"><div><div class="title">${title}</div><div class="subtitle">Espaços com subespaços, sua resposta e resposta modelo com mostrar/esconder</div></div><div style="display:flex;gap:10px"><button class="btn" onclick="openImportCenter('${kind}')">Importar</button><button class="btn primary" onclick="openGenericSpaceModal('${kind}')">Novo espaço</button></div></div>
      <div class="grid">
        ${spaces.map(s=>`<div class="card clickable" id="${kind}-space-${s.id}" onclick="openPracticeSpace('${kind}','${s.id}')"><div class="card-actions"><button class="btn xs danger" onclick="event.stopPropagation();deleteGenericSpace('${kind}','${s.id}')">Excluir</button></div><div class="card-icon">${kind==='exercise'?'⚙':'💬'}</div><div class="card-title">${esc(s.name)}</div><div class="card-meta">${esc(s.desc||'Sem descrição')}<br>Subespaços: ${(s.subspaces||[]).length}</div></div>`).join('')}
        <div class="card new clickable" onclick="openGenericSpaceModal('${kind}')"><div><div style="font-size:30px;text-align:center">+</div><div>Novo espaço</div></div></div>
      </div>`;
    return;
  }
  const sub = (space.subspaces||[]).find(ss=>ss.id===currentDetail[subIdKey]) || null;
  if (!sub) {
    wrap.innerHTML = `
      <div class="back" onclick="backToPracticeList('${kind}')">← Voltar</div>
      <div class="headline"><div id="${kind}-space-view-${space.id}"><div class="title">${esc(space.name)}</div><div class="subtitle">${esc(space.desc||'Espaço')}</div></div><button class="btn primary" onclick="openSubspaceModal('${kind}','${space.id}')">Novo subespaço</button></div>
      <div class="grid">
        ${(space.subspaces||[]).map(ss=>`<div class="card clickable" id="${kind}-subspace-${ss.id}" onclick="openPracticeSubspace('${kind}','${space.id}','${ss.id}')"><div class="card-actions"><button class="btn xs danger" onclick="event.stopPropagation();deleteSubspace('${kind}','${space.id}','${ss.id}')">Excluir</button></div><div class="card-icon">🧩</div><div class="card-title">${esc(ss.name)}</div><div class="card-meta">${esc(ss.desc||'Sem descrição')}<br>Questões: ${(ss.items||[]).length} · Arquivos: ${(ss.attachments||[]).length}</div></div>`).join('')}
      </div>`;
    return;
  }
  const allItems = sub.items || [];
  const filteredItems = getFilteredPracticeItems(kind, allItems);
  const answeredCount = allItems.filter(isPracticeAnswered).length;
  wrap.innerHTML = `
    <div class="back" onclick="backToPracticeSpace('${kind}')">← Voltar</div>
    <div class="headline"><div id="${kind}-subspace-view-${sub.id}"><div class="title">${esc(sub.name)}</div><div class="subtitle">${esc(sub.desc||'Subespaço')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="uploadAttachmentsModal('${kind}-subspace','${space.id}','${sub.id}')">Arquivos</button><button class="btn primary" onclick="openPracticeItemModal('${kind}','${space.id}','${sub.id}')">Nova questão</button></div></div>
    <div class="practice-toolbar">
      ${kind==='exercise' ? `<button class="btn xs" onclick="togglePracticeIndex('exercise')">${currentDetail.exerciseIndexOpen ? 'Ocultar índice' : 'Mostrar índice'}</button>` : ''}
      ${kind==='exercise' ? `<select class="select" onchange="setPracticeFilter('exercise', this.value)">${practiceFilterOptions(kind).map(([value,label])=>`<option value="${value}" ${getPracticeFilter(kind)===value?'selected':''}>${label}</option>`).join('')}</select>` : ''}
      <span class="goal-pill">Respondidas: ${answeredCount}/${allItems.length}</span>
      ${kind==='exercise' ? `<span class="goal-pill">Exibindo: ${filteredItems.length}</span>` : ''}
    </div>
    ${(kind!=='exercise' || currentDetail.exerciseIndexOpen) ? `<div class="practice-index">${allItems.map((item, idx)=>`<button class="practice-index-item ${isPracticeAnswered(item)?'done':''}" onclick="scrollPracticeItem('${kind}','${item.id}')">${idx+1}. ${esc(item.title)}</button>`).join('')}</div>` : ''}
    <div class="cols-2">
      <div class="stack">
        ${filteredItems.length ? filteredItems.map(item=>renderPracticeItem(kind, space.id, sub.id, item)).join('') : '<div class="empty">Nenhuma questão encontrada para este filtro.</div>'}
      </div>
      <div class="panel"><div class="panel-title">Arquivos do subespaço (até 5)</div>${renderAttachments(sub.attachments||[], `${kind}-subspace`, space.id, sub.id)}</div>
    </div>`;
}
function renderPracticeItem(kind, spaceId, subId, item) {
  const answered = isPracticeAnswered(item);
  return `
  <div class="panel ${item.minimized ? 'minimized' : ''}" id="${kind}-item-${item.id}">
    <div class="row-top">
      <div><div class="row-title">${esc(item.title)}</div><div class="row-sub">${fmtDate(item.createdAt)} · ${answered ? 'respondida' : 'não respondida'}</div></div>
      <div class="row-actions">
        <button class="btn xs" onclick="togglePracticeMinimized('${kind}','${spaceId}','${subId}','${item.id}')">${item.minimized ? 'Expandir' : 'Minimizar'}</button>
        <button class="btn xs" onclick="toggleModelAnswer('${kind}','${spaceId}','${subId}','${item.id}')">${item.showModel ? 'Esconder resposta' : 'Visualizar resposta'}</button>
        <button class="btn xs danger" onclick="deletePracticeItem('${kind}','${spaceId}','${subId}','${item.id}')">Excluir</button>
      </div>
    </div>
    <div class="exercise-main-body">
      <div class="row-text">${nl2br(item.prompt)}</div>
      <div style="margin-top:14px">
        <label class="lbl">Sua resposta</label>
        <textarea class="textarea" oninput="updatePracticeUserAnswer('${kind}','${spaceId}','${subId}','${item.id}', this.value)">${esc(item.userAnswer||'')}</textarea>
      </div>
      <div style="margin-top:14px">
        <label class="lbl">Resposta modelo</label>
        <div class="${item.showModel ? '' : 'answer-hidden'}" id="model-${item.id}">
          <textarea class="textarea" oninput="updatePracticeModelAnswer('${kind}','${spaceId}','${subId}','${item.id}', this.value)">${esc(item.modelAnswer||'')}</textarea>
        </div>
        ${item.showModel ? '' : '<div class="empty">Resposta oculta. Clique em “Visualizar resposta”.</div>'}
      </div>
    </div>
  </div>`;
}
function renderExercises() { renderPractice('exercise'); }
function renderInterviews() { renderPractice('interview'); }
function openPracticeSpace(kind, id) {
  if (kind === 'exercise') { currentDetail.exerciseSpaceId=id; currentDetail.exerciseSubspaceId=null; renderExercises(); }
  else { currentDetail.interviewSpaceId=id; currentDetail.interviewSubspaceId=null; renderInterviews(); }
}
function openPracticeSubspace(kind, spaceId, subId) {
  if (kind === 'exercise') { currentDetail.exerciseSpaceId=spaceId; currentDetail.exerciseSubspaceId=subId; renderExercises(); }
  else { currentDetail.interviewSpaceId=spaceId; currentDetail.interviewSubspaceId=subId; renderInterviews(); }
}
function openPracticeItemModal(kind, spaceId, subId) {
  openModal('Nova questão', `<div class="row"><label class="lbl">Título</label><input id="it-title" class="input"></div><div class="row"><label class="lbl">Enunciado / pergunta</label><textarea id="it-prompt" class="textarea"></textarea></div><div class="row"><label class="lbl">Resposta modelo</label><textarea id="it-model" class="textarea"></textarea></div>`, `<button class="btn primary" onclick="savePracticeItem('${kind}','${spaceId}','${subId}')">Salvar</button>`);
}
function savePracticeItem(kind, spaceId, subId) {
  const sub = getPracticeSubspace(kind, spaceId, subId); if(!sub) return;
  const title=document.getElementById('it-title').value.trim(); const prompt=document.getElementById('it-prompt').value.trim(); const model=document.getElementById('it-model').value.trim();
  if(!title || !prompt) return;
  sub.items.push({ id:uid(), title, prompt, userAnswer:'', modelAnswer:model || 'Sem resposta modelo cadastrada ainda.', createdAt:Date.now(), showModel:false });
  saveUserData(); closeModal(); renderPractice(kind); updateStatus(); showToast('Questão salva.');
}
function getPracticeSubspace(kind, spaceId, subId) {
  const list = kind === 'exercise' ? appData.exerciseSpaces : appData.interviewSpaces;
  return list.find(s=>s.id===spaceId)?.subspaces?.find(ss=>ss.id===subId);
}
function deletePracticeItem(kind, spaceId, subId, itemId) {
  const sub = getPracticeSubspace(kind, spaceId, subId); if(!sub)return;
  const name = sub.items?.find(i=>i.id===itemId)?.title || 'esta questão';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  sub.items = (sub.items||[]).filter(i=>i.id!==itemId); saveUserData(); renderPractice(kind); showToast('Questão removida.');
}
function updatePracticeUserAnswer(kind, spaceId, subId, itemId, value) {
  const item = getPracticeSubspace(kind, spaceId, subId)?.items?.find(i=>i.id===itemId); if(!item)return;
  item.userAnswer = value; saveUserData();
}
function updatePracticeModelAnswer(kind, spaceId, subId, itemId, value) {
  const item = getPracticeSubspace(kind, spaceId, subId)?.items?.find(i=>i.id===itemId); if(!item)return;
  item.modelAnswer = value; saveUserData();
}
function toggleModelAnswer(kind, spaceId, subId, itemId) {
  const item = getPracticeSubspace(kind, spaceId, subId)?.items?.find(i=>i.id===itemId); if(!item)return;
  item.showModel = !item.showModel; saveUserData(); renderPractice(kind);
}

function openGenericSpaceModal(kind) {
  const label = kind === 'code' ? 'Novo espaço de código' : kind === 'exercise' ? 'Novo espaço de exercícios' : 'Novo espaço de entrevistas';
  openModal(label, `<div class="row"><label class="lbl">Nome</label><input id="gs-name" class="input"></div><div class="row"><label class="lbl">Descrição</label><input id="gs-desc" class="input"></div>`, `<button class="btn primary" onclick="saveGenericSpace('${kind}')">Salvar</button>`);
}
function getSpaceList(kind) {
  if (kind === 'code') return appData.codeSpaces;
  if (kind === 'exercise') return appData.exerciseSpaces;
  return appData.interviewSpaces;
}
function saveGenericSpace(kind) {
  const list = getSpaceList(kind); const name=document.getElementById('gs-name').value.trim(); const desc=document.getElementById('gs-desc').value.trim(); if(!name)return;
  list.push({ id:uid(), name, desc, attachments:[], subspaces:[], createdAt:Date.now() });
  saveUserData(); closeModal(); renderAll(); showToast('Espaço criado.');
}
function deleteGenericSpace(kind, id) {
  const list = getSpaceList(kind);
  const name = list.find(x=>x.id===id)?.name || 'este espaço';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  const idx = list.findIndex(x=>x.id===id); if(idx<0)return; list.splice(idx,1);
  if (kind==='code') { currentDetail.codeSpaceId=null; currentDetail.codeSubspaceId=null; }
  if (kind==='exercise') { currentDetail.exerciseSpaceId=null; currentDetail.exerciseSubspaceId=null; }
  if (kind==='interview') { currentDetail.interviewSpaceId=null; currentDetail.interviewSubspaceId=null; }
  saveUserData(); renderAll(); showToast('Espaço excluído.');
}
function openSubspaceModal(kind, spaceId) {
  openModal('Novo subespaço', `<div class="row"><label class="lbl">Nome</label><input id="sub-name" class="input"></div><div class="row"><label class="lbl">Descrição</label><input id="sub-desc" class="input"></div>`, `<button class="btn primary" onclick="saveSubspace('${kind}','${spaceId}')">Salvar</button>`);
}
function saveSubspace(kind, spaceId) {
  const space = getSpaceList(kind).find(s=>s.id===spaceId); if(!space)return;
  const name=document.getElementById('sub-name').value.trim(); const desc=document.getElementById('sub-desc').value.trim(); if(!name)return;
  const payload = kind==='code' ? { id:uid(), name, desc, attachments:[], snippets:[], createdAt:Date.now() } : { id:uid(), name, desc, attachments:[], items:[], createdAt:Date.now() };
  space.subspaces ||= []; space.subspaces.push(payload);
  saveUserData(); closeModal();
  if (kind==='code') renderCode(); else renderPractice(kind);
  updateStatus(); showToast('Subespaço criado.');
}
function deleteSubspace(kind, spaceId, subId) {
  const space = getSpaceList(kind).find(s=>s.id===spaceId); if(!space)return;
  const name = space.subspaces?.find(ss=>ss.id===subId)?.name || 'este subespaço';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  space.subspaces = (space.subspaces||[]).filter(ss=>ss.id!==subId); saveUserData();
  if (kind==='code') { currentDetail.codeSubspaceId=null; renderCode(); }
  else if (kind==='exercise') { currentDetail.exerciseSubspaceId=null; renderExercises(); }
  else { currentDetail.interviewSubspaceId=null; renderInterviews(); }
  showToast('Subespaço excluído.');
}



function renderNotes() {
  const wrap = document.getElementById('section-notes');
  const noteCount = appData.generalNotes.length;
  const categoryCount = appData.noteCategories.length;
  const recordCount = appData.noteRecords.length;
  const uncategorizedCount = appData.noteRecords.filter(record => !record.categoryId).length;
  const categoryMap = new Map((appData.noteCategories || []).map(category => [category.id, category]));
  wrap.innerHTML = `
    <div class="headline">
      <div><div class="title">Anotações</div><div class="subtitle">Notas editáveis, categorias independentes e registros classificados</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="openNoteCategoryModal()">Nova categoria</button>
        <button class="btn" onclick="openNoteRecordModal()">Novo registro</button>
        <button class="btn primary" onclick="createInlineGeneralNote()">Nova anotação</button>
      </div>
    </div>
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-label">Anotações</div><div class="kpi-value">${noteCount}</div><div class="kpi-sub">editáveis após salvar</div></div>
      <div class="kpi"><div class="kpi-label">Categorias</div><div class="kpi-value">${categoryCount}</div><div class="kpi-sub">sem sobrescrever as anteriores</div></div>
      <div class="kpi"><div class="kpi-label">Registros</div><div class="kpi-value">${recordCount}</div><div class="kpi-sub">classificados por categoria</div></div>
      <div class="kpi"><div class="kpi-label">Sem categoria</div><div class="kpi-value">${uncategorizedCount}</div><div class="kpi-sub">registros ainda não classificados</div></div>
    </div>
    <div class="notes-layout">
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Anotações livres</div>
          ${(appData.generalNotes || []).length ? appData.generalNotes.map(note => `
            <div class="note-editor-card" id="general-note-${note.id}">
              <div class="row-top">
                <div>
                  <div class="row-title">${esc(note.title || 'Anotação')}</div>
                  <div class="row-sub">${fmtDate(note.updatedAt || note.createdAt)}</div>
                </div>
                <div class="row-actions">
                  <button class="btn xs" onclick="saveInlineGeneralNote('${note.id}')">Salvar</button>
                  <button class="btn xs danger" onclick="deleteGeneralNote('${note.id}')">Excluir</button>
                </div>
              </div>
              <div class="row" style="margin-top:12px"><label class="lbl">Título</label><input id="gn-inline-title-${note.id}" class="input" value="${esc(note.title || '')}" placeholder="Título da anotação"></div>
              <div class="row" style="margin-bottom:0"><label class="lbl">Conteúdo</label><textarea id="gn-inline-content-${note.id}" class="textarea note-inline-textarea" placeholder="Escreva sua anotação aqui...">${esc(note.content || '')}</textarea></div>
            </div>
          `).join('') : '<div class="empty">Nenhuma anotação geral cadastrada.</div>'}
        </div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="panel-title">Categorias</div>
          <div class="row-text" style="margin-top:0">As categorias são criadas uma vez e depois você escolhe uma delas ao criar um registro.</div>
          <div class="stack" style="margin-top:12px">
            ${(appData.noteCategories || []).length ? appData.noteCategories.map(category => `
              <div class="row-item" id="note-category-${category.id}">
                <div class="row-top">
                  <div>
                    <div class="row-title">${esc(category.name)}</div>
                    <div class="row-sub">${appData.noteRecords.filter(record => record.categoryId === category.id).length} registro(s)</div>
                  </div>
                  <div class="row-actions">
                    <button class="btn xs" onclick="openNoteCategoryModal('${category.id}')">Editar</button>
                    <button class="btn xs danger" onclick="deleteNoteCategory('${category.id}')">Excluir</button>
                  </div>
                </div>
              </div>
            `).join('') : '<div class="empty">Nenhuma categoria criada ainda.</div>'}
          </div>
        </div>
        <div class="panel">
          <div class="row-top" style="margin-bottom:12px">
            <div>
              <div class="panel-title" style="margin-bottom:4px">Registros</div>
              <div class="row-sub">Cada registro é criado separadamente e pode ser classificado em uma categoria existente.</div>
            </div>
            <button class="btn xs" onclick="openNoteRecordModal()">Novo registro</button>
          </div>
          <div class="stack">
            ${(appData.noteRecords || []).length ? appData.noteRecords.map(record => {
              const category = categoryMap.get(record.categoryId);
              return `
                <div class="row-item" id="note-record-${record.id}">
                  <div class="row-top">
                    <div>
                      <div class="row-title">${esc(record.title || 'Registro sem título')}</div>
                      <div class="row-sub">${category ? esc(category.name) : 'Sem categoria'} · ${fmtDate(record.updatedAt || record.createdAt)}</div>
                    </div>
                    <div class="row-actions">
                      <button class="btn xs" onclick="openNoteRecordModal('${record.id}')">Editar</button>
                      <button class="btn xs danger" onclick="deleteNoteRecord('${record.id}')">Excluir</button>
                    </div>
                  </div>
                  ${record.content ? `<div class="row-text">${nl2br(record.content)}</div>` : '<div class="empty" style="margin-top:12px">Sem conteúdo neste registro.</div>'}
                </div>
              `;
            }).join('') : '<div class="empty">Nenhum registro criado ainda.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}
function createInlineGeneralNote() {
  const note = { id:uid(), title:'', content:'', createdAt:Date.now(), updatedAt:Date.now(), isDraft:true };
  appData.generalNotes.unshift(note);
  saveUserData();
  renderNotes();
  requestAnimationFrame(() => {
    document.getElementById(`gn-inline-title-${note.id}`)?.focus();
    focusSectionElement(`general-note-${note.id}`);
  });
}
function openGeneralNoteModal(noteId='') {
  const note = noteId ? appData.generalNotes.find(n => n.id === noteId) : null;
  openModal(note ? 'Editar anotação' : 'Nova anotação geral', `
    <div class="row"><label class="lbl">Título</label><input id="gn-title" class="input" value="${esc(note?.title || '')}"></div>
    <div class="row"><label class="lbl">Conteúdo</label><textarea id="gn-content" class="textarea" style="min-height:260px">${esc(note?.content || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveGeneralNote('${noteId}')">Salvar</button>`);
}
function saveInlineGeneralNote(noteId) {
  const note = appData.generalNotes.find(n => n.id === noteId); if (!note) return;
  const title = document.getElementById(`gn-inline-title-${noteId}`)?.value.trim() || '';
  const content = document.getElementById(`gn-inline-content-${noteId}`)?.value || '';
  if (!title && !content.trim()) return showToast('Preencha o título ou o conteúdo antes de salvar.');
  note.title = title || 'Anotação sem título';
  note.content = content;
  note.updatedAt = Date.now();
  delete note.isDraft;
  saveUserData();
  renderNotes();
  renderDashboard();
  updateStatus();
  showToast('Anotação salva.');
}
function saveGeneralNote(noteId='') {
  const title = document.getElementById('gn-title').value.trim();
  const content = document.getElementById('gn-content').value;
  if (!title && !content.trim()) return;
  if (noteId) {
    const note = appData.generalNotes.find(n => n.id === noteId); if (!note) return;
    note.title = title || 'Anotação sem título'; note.content = content; note.updatedAt = Date.now(); delete note.isDraft;
  } else {
    appData.generalNotes.unshift({ id:uid(), title: title || 'Anotação sem título', content, createdAt:Date.now(), updatedAt:Date.now() });
  }
  saveUserData(); closeModal(); renderNotes(); renderDashboard(); updateStatus(); showToast(noteId ? 'Anotação atualizada.' : 'Anotação criada.');
}
function deleteGeneralNote(noteId) {
  const name = appData.generalNotes.find(n => n.id === noteId)?.title || 'esta anotação';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.generalNotes = appData.generalNotes.filter(n => n.id !== noteId);
  saveUserData(); renderNotes(); renderDashboard(); updateStatus(); showToast('Anotação removida.');
}
function openNoteCategoryModal(categoryId='') {
  const category = categoryId ? appData.noteCategories.find(c => c.id === categoryId) : null;
  openModal(category ? 'Editar categoria' : 'Nova categoria', `
    <div class="row"><label class="lbl">Nome da categoria</label><input id="note-category-name" class="input" value="${esc(category?.name || '')}" placeholder="Ex.: LAB, ZXPLORER, FUTURE"></div>
  `, `<button class="btn primary" onclick="saveNoteCategory('${categoryId}')">Salvar</button>`);
}
function saveNoteCategory(categoryId='') {
  const name = document.getElementById('note-category-name').value.trim();
  if (!name) return;
  const duplicate = appData.noteCategories.find(category => category.name.trim().toLowerCase() === name.toLowerCase() && category.id !== categoryId);
  if (duplicate) return showToast('Já existe uma categoria com esse nome.');
  if (categoryId) {
    const category = appData.noteCategories.find(c => c.id === categoryId); if (!category) return;
    category.name = name;
    category.updatedAt = Date.now();
  } else {
    appData.noteCategories.push({ id:uid(), name, createdAt:Date.now(), updatedAt:Date.now() });
  }
  saveUserData(); closeModal(); renderNotes(); updateStatus(); showToast(categoryId ? 'Categoria atualizada.' : 'Categoria criada.');
}
function deleteNoteCategory(categoryId) {
  const category = appData.noteCategories.find(c => c.id === categoryId);
  if (!category) return;
  const linkedRecords = appData.noteRecords.filter(record => record.categoryId === categoryId).length;
  const msg = linkedRecords
    ? `A categoria "${category.name}" está ligada a ${linkedRecords} registro(s). Excluir mesmo assim? Os registros ficarão sem categoria.`
    : `Deseja mesmo excluir "${category.name}"?`;
  if (!confirm(msg)) return;
  appData.noteCategories = appData.noteCategories.filter(c => c.id !== categoryId);
  appData.noteRecords.forEach(record => { if (record.categoryId === categoryId) record.categoryId = ''; });
  saveUserData(); renderNotes(); updateStatus(); showToast('Categoria removida.');
}
function openNoteRecordModal(recordId='') {
  const record = recordId ? appData.noteRecords.find(r => r.id === recordId) : null;
  const categoryOptions = [`<option value="">Sem categoria</option>`].concat(
    (appData.noteCategories || []).map(category => `<option value="${category.id}" ${record?.categoryId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`)
  ).join('');
  openModal(record ? 'Editar registro' : 'Novo registro', `
    <div class="row"><label class="lbl">Título do registro</label><input id="note-record-title" class="input" value="${esc(record?.title || '')}" placeholder="Ex.: Ajuste no ambiente de LAB"></div>
    <div class="row"><label class="lbl">Categoria</label><select id="note-record-category" class="select">${categoryOptions}</select></div>
    <div class="row"><label class="lbl">Conteúdo</label><textarea id="note-record-content" class="textarea" style="min-height:240px" placeholder="Detalhes do registro">${esc(record?.content || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveNoteRecord('${recordId}')">Salvar</button>`);
}
function saveNoteRecord(recordId='') {
  const title = document.getElementById('note-record-title').value.trim();
  const categoryId = document.getElementById('note-record-category').value;
  const content = document.getElementById('note-record-content').value;
  if (!title && !content.trim()) return;
  const payload = { title: title || 'Registro sem título', categoryId, content, updatedAt:Date.now() };
  if (recordId) {
    const record = appData.noteRecords.find(r => r.id === recordId); if (!record) return;
    Object.assign(record, payload);
  } else {
    appData.noteRecords.unshift({ id:uid(), createdAt:Date.now(), ...payload });
  }
  saveUserData(); closeModal(); renderNotes(); updateStatus(); showToast(recordId ? 'Registro atualizado.' : 'Registro criado.');
}
function deleteNoteRecord(recordId) {
  const name = appData.noteRecords.find(record => record.id === recordId)?.title || 'este registro';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.noteRecords = appData.noteRecords.filter(record => record.id !== recordId);
  saveUserData(); renderNotes(); updateStatus(); showToast('Registro removido.');
}

function renderLinkedin() {
  const wrap = document.getElementById('section-linkedin');
  wrap.innerHTML = `
    <div class="headline">
      <div><div class="title">Postagem LinkedIn</div><div class="subtitle">Rascunhos para escrever agora e postar depois no LinkedIn</div></div>
      <button class="btn primary" onclick="openLinkedinPostModal()">Novo rascunho</button>
    </div>
    <div class="stack">
      ${appData.linkedinPosts.length ? appData.linkedinPosts.map(post => `
        <div class="panel" id="linkedin-post-${post.id}">
          <div class="row-top">
            <div>
              <div class="row-title">${esc(post.title || 'Post sem título')}</div>
              <div class="row-sub">${esc(post.status || 'rascunho')} · ${fmtDate(post.updatedAt || post.createdAt)}</div>
            </div>
            <div class="row-actions">
              <button class="btn xs" onclick="toggleLinkedinStatus('${post.id}')">${post.status === 'pronto para postar' ? 'Voltar para rascunho' : 'Marcar pronto'}</button>
              <button class="btn xs" onclick="openLinkedinPostModal('${post.id}')">Editar</button>
              <button class="btn xs danger" onclick="deleteLinkedinPost('${post.id}')">Excluir</button>
            </div>
          </div>
          <div class="row-text">${nl2br(post.content || '')}</div>
          ${post.hashtags ? `<div class="row-sub" style="margin-top:12px">${esc(post.hashtags)}</div>` : ''}
        </div>
      `).join('') : '<div class="empty">Nenhum rascunho de LinkedIn criado ainda.</div>'}
    </div>
  `;
}
function openLinkedinPostModal(postId='') {
  const post = postId ? appData.linkedinPosts.find(p => p.id === postId) : null;
  openModal(post ? 'Editar postagem LinkedIn' : 'Nova postagem LinkedIn', `
    <div class="row"><label class="lbl">Título</label><input id="li-title" class="input" value="${esc(post?.title || '')}" placeholder="Ex.: O que aprendi resolvendo exercícios de COBOL"></div>
    <div class="row"><label class="lbl">Texto</label><textarea id="li-content" class="textarea" style="min-height:260px">${esc(post?.content || '')}</textarea></div>
    <div class="row"><label class="lbl">Hashtags</label><input id="li-hashtags" class="input" value="${esc(post?.hashtags || '')}" placeholder="#mainframe #cobol #career"></div>
    <div class="row"><label class="lbl">Status</label><select id="li-status" class="select"><option value="rascunho" ${post?.status === 'rascunho' || !post ? 'selected' : ''}>Rascunho</option><option value="pronto para postar" ${post?.status === 'pronto para postar' ? 'selected' : ''}>Pronto para postar</option></select></div>
  `, `<button class="btn primary" onclick="saveLinkedinPost('${postId}')">Salvar</button>`);
}
function saveLinkedinPost(postId='') {
  const title = document.getElementById('li-title').value.trim();
  const content = document.getElementById('li-content').value;
  const hashtags = document.getElementById('li-hashtags').value.trim();
  const status = document.getElementById('li-status').value;
  if (!title && !content.trim()) return;
  if (postId) {
    const post = appData.linkedinPosts.find(p => p.id === postId); if (!post) return;
    Object.assign(post, { title: title || 'Post sem título', content, hashtags, status, updatedAt:Date.now() });
  } else {
    appData.linkedinPosts.unshift({ id:uid(), title: title || 'Post sem título', content, hashtags, status, createdAt:Date.now(), updatedAt:Date.now() });
  }
  saveUserData(); closeModal(); renderLinkedin(); updateStatus(); showToast(postId ? 'Postagem atualizada.' : 'Rascunho criado.');
}
function toggleLinkedinStatus(postId) {
  const post = appData.linkedinPosts.find(p => p.id === postId); if (!post) return;
  post.status = post.status === 'pronto para postar' ? 'rascunho' : 'pronto para postar';
  post.updatedAt = Date.now();
  saveUserData(); renderLinkedin(); showToast('Status da postagem atualizado.');
}
function deleteLinkedinPost(postId) {
  const name = appData.linkedinPosts.find(p => p.id === postId)?.title || 'esta postagem';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.linkedinPosts = appData.linkedinPosts.filter(p => p.id !== postId);
  saveUserData(); renderLinkedin(); updateStatus(); showToast('Postagem removida.');
}

function renderCerts() {
  const wrap = document.getElementById('section-certs');
  const conquered = appData.certificates.filter(c => c.status === 'conquistado');
  const toEarn = appData.certificates.filter(c => c.status !== 'conquistado');
  const renderCertCard = cert => `
    <div class="panel" id="cert-${cert.id}">
      <div class="row-top">
        <div>
          <div class="row-title">${esc(cert.name)}</div>
          <div class="row-sub">${esc(cert.kind || 'Certificado')} · ${esc(cert.issuer || 'Sem emissor')} · ${esc(cert.status)}</div>
        </div>
        <div class="row-actions">
          <button class="btn xs" onclick="openCertModal('${cert.id}')">Editar</button>
          <button class="btn xs danger" onclick="deleteCert('${cert.id}')">Excluir</button>
        </div>
      </div>
      ${cert.imageData ? `<img class="thumb-cert" src="${cert.imageData}" alt="${esc(cert.name)}">` : ''}
      ${cert.notes ? `<div class="row-text">${nl2br(cert.notes)}</div>` : ''}
      <div class="row-sub" style="margin-top:12px">${cert.status === 'conquistado' ? 'Conquistado em' : 'Meta para'}: ${esc(cert.targetDate || cert.earnedDate || 'sem data')}</div>
    </div>
  `;
  wrap.innerHTML = `
    <div class="headline">
      <div><div class="title">Certificados e badges</div><div class="subtitle">Acompanhe o que já conquistou e o que ainda quer conquistar</div></div>
      <button class="btn primary" onclick="openCertModal()">Novo item</button>
    </div>
    <div class="cols-2">
      <div class="stack">
        <div class="panel"><div class="panel-title">Conquistados</div>${conquered.length ? conquered.map(renderCertCard).join('') : '<div class="empty">Nenhum certificado ou badge conquistado ainda.</div>'}</div>
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-title">A conquistar</div>${toEarn.length ? toEarn.map(renderCertCard).join('') : '<div class="empty">Nenhuma meta cadastrada nesta seção.</div>'}</div>
      </div>
    </div>
  `;
}
function openCertModal(certId='') {
  const cert = certId ? appData.certificates.find(c => c.id === certId) : null;
  openModal(cert ? 'Editar certificado / badge' : 'Novo certificado / badge', `
    <div class="row"><label class="lbl">Nome</label><input id="cert-name" class="input" value="${esc(cert?.name || '')}"></div>
    <div class="row"><label class="lbl">Emissor</label><input id="cert-issuer" class="input" value="${esc(cert?.issuer || '')}" placeholder="IBM, Coursera, instituição..."></div>
    <div class="row"><label class="lbl">Tipo</label><select id="cert-kind" class="select"><option value="Certificado" ${cert?.kind === 'Certificado' || !cert ? 'selected' : ''}>Certificado</option><option value="Badge" ${cert?.kind === 'Badge' ? 'selected' : ''}>Badge</option></select></div>
    <div class="row"><label class="lbl">Status</label><select id="cert-status" class="select"><option value="conquistado" ${cert?.status === 'conquistado' ? 'selected' : ''}>Conquistado</option><option value="a conquistar" ${cert?.status === 'a conquistar' || !cert ? 'selected' : ''}>A conquistar</option></select></div>
    <div class="row"><label class="lbl">Data (conquista ou meta)</label><input id="cert-date" class="input" value="${esc(cert?.earnedDate || cert?.targetDate || '')}" placeholder="MM/AAAA ou DD/MM/AAAA"></div>
    <div class="row"><label class="lbl">Imagem do certificado</label><input id="cert-image" class="input" type="file" accept="image/*"></div>
    ${cert?.imageData ? `<div class="row-sub">Imagem atual: ${esc(cert.imageName || 'certificado')}</div><img class="thumb-cert" src="${cert.imageData}" alt="${esc(cert.name)}">` : ''}
    <div class="row"><label class="lbl">Observações</label><textarea id="cert-notes" class="textarea">${esc(cert?.notes || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveCert('${certId}')">Salvar</button>`);
}
function readInputFileAsDataURL(inputId) {
  return new Promise(resolve => {
    const file = document.getElementById(inputId)?.files?.[0];
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = e => resolve({ data:e.target.result, name:file.name, type:file.type });
    reader.readAsDataURL(file);
  });
}
async function saveCert(certId='') {
  const name = document.getElementById('cert-name').value.trim();
  const issuer = document.getElementById('cert-issuer').value.trim();
  const kind = document.getElementById('cert-kind').value;
  const status = document.getElementById('cert-status').value;
  const rawDate = document.getElementById('cert-date').value.trim();
  const notes = document.getElementById('cert-notes').value.trim();
  if (!name) return;
  const image = await readInputFileAsDataURL('cert-image');
  const payload = { name, issuer, kind, status, notes, updatedAt:Date.now(), earnedDate: status === 'conquistado' ? rawDate : '', targetDate: status === 'conquistado' ? '' : rawDate };
  if (certId) {
    const cert = appData.certificates.find(c => c.id === certId); if (!cert) return;
    Object.assign(cert, payload);
    if (image) { cert.imageData = image.data; cert.imageName = image.name; }
  } else {
    appData.certificates.unshift({ id:uid(), createdAt:Date.now(), imageData:image?.data || '', imageName:image?.name || '', ...payload });
  }
  saveUserData(); closeModal(); renderCerts(); updateStatus(); showToast(certId ? 'Item atualizado.' : 'Item cadastrado.');
}
function deleteCert(certId) {
  const name = appData.certificates.find(c => c.id === certId)?.name || 'este certificado';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.certificates = appData.certificates.filter(c => c.id !== certId);
  saveUserData(); renderCerts(); updateStatus(); showToast('Certificado removido.');
}

function renderTools() {
  const wrap = document.getElementById('section-tools');
  wrap.innerHTML = `
    <div class="headline">
      <div><div class="title">Ferramentas</div><div class="subtitle">Área para cadastrar ferramentas com link de download, site oficial e instruções</div></div>
      <button class="btn primary" onclick="openToolModal()">Nova ferramenta</button>
    </div>
    <div class="stack">
      ${appData.tools.length ? appData.tools.map(tool => `
        <div class="panel" id="tool-${tool.id}">
          <div class="row-top">
            <div>
              <div class="row-title">${esc(tool.name)}</div>
              <div class="row-sub">${esc(tool.category || 'Ferramenta')}</div>
            </div>
            <div class="row-actions">
              <button class="btn xs" onclick="openToolModal('${tool.id}')">Editar</button>
              <button class="btn xs danger" onclick="deleteTool('${tool.id}')">Excluir</button>
            </div>
          </div>
          <div class="tool-links">
            ${tool.downloadUrl ? `<a class="btn xs" target="_blank" href="${esc(tool.downloadUrl)}">Download</a>` : ''}
            ${tool.websiteUrl ? `<a class="btn xs" target="_blank" href="${esc(tool.websiteUrl)}">Site</a>` : ''}
          </div>
          ${tool.instructions ? `<div class="row-text">${nl2br(tool.instructions)}</div>` : '<div class="empty" style="margin-top:12px">Sem instruções cadastradas.</div>'}
        </div>
      `).join('') : '<div class="empty">Nenhuma ferramenta cadastrada ainda.</div>'}
    </div>
  `;
}
function openToolModal(toolId='') {
  const tool = toolId ? appData.tools.find(t => t.id === toolId) : null;
  openModal(tool ? 'Editar ferramenta' : 'Nova ferramenta', `
    <div class="row"><label class="lbl">Nome</label><input id="tool-name" class="input" value="${esc(tool?.name || '')}"></div>
    <div class="row"><label class="lbl">Categoria</label><input id="tool-category" class="input" value="${esc(tool?.category || '')}" placeholder="CLI, editor, emulador, utilitário..."></div>
    <div class="row"><label class="lbl">Link de download</label><input id="tool-download" class="input" value="${esc(tool?.downloadUrl || '')}" placeholder="https://..."></div>
    <div class="row"><label class="lbl">Site / documentação</label><input id="tool-website" class="input" value="${esc(tool?.websiteUrl || '')}" placeholder="https://..."></div>
    <div class="row"><label class="lbl">Instruções</label><textarea id="tool-instructions" class="textarea" style="min-height:220px">${esc(tool?.instructions || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveTool('${toolId}')">Salvar</button>`);
}
function saveTool(toolId='') {
  const name = document.getElementById('tool-name').value.trim();
  const category = document.getElementById('tool-category').value.trim();
  const downloadUrl = document.getElementById('tool-download').value.trim();
  const websiteUrl = document.getElementById('tool-website').value.trim();
  const instructions = document.getElementById('tool-instructions').value.trim();
  if (!name) return;
  const payload = { name, category, downloadUrl, websiteUrl, instructions, updatedAt:Date.now() };
  if (toolId) {
    const tool = appData.tools.find(t => t.id === toolId); if (!tool) return;
    Object.assign(tool, payload);
  } else {
    appData.tools.unshift({ id:uid(), createdAt:Date.now(), ...payload });
  }
  saveUserData(); closeModal(); renderTools(); renderDashboard(); updateStatus(); showToast(toolId ? 'Ferramenta atualizada.' : 'Ferramenta criada.');
}
function deleteTool(toolId) {
  const name = appData.tools.find(t => t.id === toolId)?.name || 'esta ferramenta';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.tools = appData.tools.filter(t => t.id !== toolId);
  saveUserData(); renderTools(); renderDashboard(); updateStatus(); showToast('Ferramenta removida.');
}

function renderLab() {
  const v = getDailyVerse();
  const planUrl = appData.lab.planUrl || 'emunah-bank-lab.html';
  const resources = [
    { label:'IBM zXplore', url:'https://zxplore.ibm.com', icon:'🖥' },
    { label:'VS Code + Z Open Editor', url:'https://marketplace.visualstudio.com/items?itemName=broadcomMFD.cobol-language-support', icon:'💻' },
    { label:'Zowe CLI Docs', url:'https://docs.zowe.org/stable/user-guide/cli-usingcli', icon:'⚡' },
    { label:'IBM COBOL Reference', url:'https://www.ibm.com/docs/en/cobol-zos', icon:'📚' },
    { label:'IBM DB2 for z/OS', url:'https://www.ibm.com/docs/en/db2-for-zos', icon:'🗄' },
    { label:'GitHub — mainframe-hub', url:'https://github.com/eliellmiranda/mainframe-hub', icon:'🐙' },
  ];
  const labUrl = appData.lab.url
    ? `<a class="btn primary" target="_blank" href="${esc(appData.lab.url)}">⬡ ABRIR ZXPLORE</a>`
    : '';
  const resRows = resources.map(r =>
    `<a class="row-item" href="${r.url}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;text-decoration:none;color:inherit">
       <span style="font-size:18px">${r.icon}</span>
       <span style="font-size:14px;color:var(--link)">${r.label}</span>
       <span style="margin-left:auto;color:var(--text-soft);font-size:12px">↗</span>
     </a>`
  ).join('');

  document.getElementById('section-lab').innerHTML = `
    <div class="headline">
      <div>
        <div class="title">EMUNAH BANK LAB</div>
        <div class="subtitle"><em>emunah</em>: fidelidade, fé — HLQ: Z77948</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${labUrl}
        <a class="btn" target="_blank" href="${esc(planUrl)}">↗ ABRIR PLANO</a>
        <button class="btn" onclick="openLabModal()">✎ EDITAR URL</button>
      </div>
    </div>

    <div class="panel" style="border-left:4px solid var(--accent);margin-bottom:16px">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:22px;flex-shrink:0">✝</span>
        <div style="flex:1">
          <div class="verse-text" style="font-size:14px;line-height:1.7;color:var(--text-soft);font-style:italic">"${esc(v.text)}"</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="verse-ref" style="font-size:12px;color:var(--accent);font-weight:700;letter-spacing:.08em">${esc(v.ref)}</span>
            <button class="btn xs ghost" onclick="nextVerse()" style="color:var(--text-soft);font-size:12px">próximo →</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel" style="padding:0;overflow:hidden;border-radius:18px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-soft)">
          📋 EMUNAH BANK LAB — PLANO DE IMPLEMENTAÇÃO
        </span>
        <a class="btn xs" target="_blank" href="${esc(planUrl)}" style="flex-shrink:0">↗ NOVA ABA</a>
      </div>
      <iframe src="${esc(planUrl)}"
        style="width:100%;height:78vh;border:none;display:block;background:#080d08;"
        title="Emunah Bank Lab — Plano de Implementação">
      </iframe>
    </div>

    <div class="panel">
      <div class="panel-title">🔗 RECURSOS RÁPIDOS</div>
      <div class="stack" style="gap:8px;margin-top:8px">${resRows}</div>
    </div>
  `;
}


function openLabModal() {
  openModal('Editar URL do lab', `<div class="row"><label class="lbl">URL</label><input id="lab-url" class="input" value="${esc(appData.lab.url||'')}" placeholder="https://..."></div>`, `<button class="btn primary" onclick="saveLab()">Salvar</button>`);
}
function saveLab() {
  appData.lab.url = document.getElementById('lab-url').value.trim(); saveUserData(); closeModal(); renderLab(); showToast('Lab atualizado.');
}

function renderAttachments(files, type, id1, id2='', id3='') {
  if (!files || !files.length) return '<div class=\"empty\">Nenhum arquivo anexado.</div>';
  return files.map(f=>`<div class=\"file-row\" id=\"attachment-${f.id}\"><div class=\"file-name\">📎 ${esc(f.name)}</div><button class=\"btn xs\" onclick=\"openAttachment('${type}','${id1}','${id2}','${f.id}','${id3}')\">Abrir</button><button class=\"btn xs\" onclick=\"downloadAttachment('${type}','${id1}','${id2}','${f.id}','${id3}')\">Baixar</button><button class=\"btn xs danger\" onclick=\"removeAttachment('${type}','${id1}','${id2}','${f.id}','${id3}')\">Excluir</button></div>`).join('');
}
function resolveAttachmentHolder(type, id1, id2='', id3='') {
  if (type==='doc') return appData.docs.find(d=>d.id===id1);
  if (type==='course-module') return appData.courses.find(c=>c.id===id1)?.modules?.find(m=>m.id===id2);
  if (type==='course-submodule') return appData.courses.find(c=>c.id===id1)?.modules?.find(m=>m.id===id3)?.submodules?.find(s=>s.id===id2);
  if (type==='code-subspace') return appData.codeSpaces.find(s=>s.id===id1)?.subspaces?.find(ss=>ss.id===id2);
  if (type==='exercise-subspace') return appData.exerciseSpaces.find(s=>s.id===id1)?.subspaces?.find(ss=>ss.id===id2);
  if (type==='interview-subspace') return appData.interviewSpaces.find(s=>s.id===id1)?.subspaces?.find(ss=>ss.id===id2);
  return null;
}
function getAttachmentRecord(type,id1,id2,fileId,id3='') {
  const holder = resolveAttachmentHolder(type,id1,id2,id3);
  const file = holder?.attachments?.find(a=>a.id===fileId) || null;
  return { holder, file };
}
function openAttachment(type,id1,id2,fileId,id3='') {
  const { file } = getAttachmentRecord(type,id1,id2,fileId,id3);
  if (!file || !file.data) return showToast('Arquivo não encontrado.');
  const a = document.createElement('a');
  a.href = file.data;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function downloadAttachment(type,id1,id2,fileId,id3='') {
  const { file } = getAttachmentRecord(type,id1,id2,fileId,id3);
  if (!file || !file.data) return showToast('Arquivo não encontrado.');
  const a = document.createElement('a');
  a.href = file.data;
  a.download = file.name || 'arquivo';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function removeAttachment(type,id1,id2,fileId,id3='') {
  const { holder, file } = getAttachmentRecord(type,id1,id2,fileId,id3);
  if (!holder || !file) return showToast('Arquivo não encontrado.');
  if (!confirm(`Excluir o arquivo "${file.name}"?`)) return;
  holder.attachments = (holder.attachments||[]).filter(a=>a.id!==fileId);
  saveUserData(); renderAll(); showToast('Arquivo removido.');
}
function uploadAttachmentsModal(type,id1,id2='',id3='') {
  const holder = resolveAttachmentHolder(type,id1,id2,id3);
  const count = holder?.attachments?.length || 0;
  openModal('Anexar arquivos', `<div class="row"><label class="lbl">Arquivos</label><input id="up-files" class="input" type="file" multiple></div><div class="muted">Limite de 5 arquivos por espaço ou subespaço. Já existem ${count} arquivo(s) neste local.</div>`, `<button class="btn primary" onclick="saveUploads('${type}','${id1}','${id2}','${id3}')">Enviar</button>`);
}
function saveUploads(type,id1,id2='',id3='') {
  const holder = resolveAttachmentHolder(type,id1,id2,id3); if(!holder)return;
  const files = Array.from(document.getElementById('up-files').files||[]);
  holder.attachments ||= [];
  if (!files.length) return;
  if (holder.attachments.length + files.length > 5) return alert('O limite é de até 5 arquivos.');
  let done=0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      holder.attachments.push({ id:uid(), name:file.name, type:file.type, data:e.target.result, createdAt:Date.now() });
      done++;
      if (done === files.length) {
        saveUserData(); closeModal(); renderAll(); showToast('Arquivos anexados.');
      }
    };
    reader.readAsDataURL(file);
  });
}

function focusSectionElement(elementId) {
  if (!elementId) return;
  setTimeout(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    el.classList.add('search-focus');
    setTimeout(() => el.classList.remove('search-focus'), 2200);
  }, 120);
}
function openSearchResult(index) {
  const result = (currentDetail.searchResults || [])[index];
  if (!result || !result.target) return;
  const t = result.target;
  if (t.section === 'courses') {
    currentDetail.courseId = t.courseId || null;
    goSection('courses');
    focusSectionElement(t.focusId || (t.courseId ? `course-card-${t.courseId}` : ''));
  } else if (t.section === 'docs') {
    currentDetail.docId = t.docId || null;
    goSection('docs');
    focusSectionElement(t.focusId || (t.docId ? `doc-${t.docId}` : ''));
  } else if (t.section === 'code') {
    currentDetail.codeSpaceId = t.codeSpaceId || null;
    currentDetail.codeSubspaceId = t.codeSubspaceId || null;
    goSection('code');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'exercises') {
    currentDetail.exerciseSpaceId = t.spaceId || null;
    currentDetail.exerciseSubspaceId = t.subId || null;
    goSection('exercises');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'interviews') {
    currentDetail.interviewSpaceId = t.spaceId || null;
    currentDetail.interviewSubspaceId = t.subId || null;
    goSection('interviews');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'goals') {
    setSelectedGoalDay(t.dayKey || getTodayGoalKey());
    goSection('goals');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'linkedin') {
    goSection('linkedin');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'certs') {
    goSection('certs');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'notes') {
    goSection('notes');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'tools') {
    goSection('tools');
    focusSectionElement(t.focusId || '');
  } else if (t.section === 'lab') {
    goSection('lab');
  }
}
function handleSearch(query) {
  const rawQuery = (query||'').trim();
  const q = rawQuery.toLowerCase();
  if (!q) { currentDetail.searchResults = []; renderAll(); return; }
  const results = [];
  appData.courses.forEach(c => {
    if ((c.name+' '+(c.desc||'')).toLowerCase().includes(q)) results.push({ area:'Cursos', title:c.name, text:c.desc||'Curso', target:{ section:'courses', courseId:c.id, focusId:`course-view-${c.id}` } });
    (c.modules||[]).forEach(m => {
      if ((m.name+' '+(m.desc||'')).toLowerCase().includes(q)) results.push({ area:'Curso / módulo', title:`${c.name} > ${m.name}`, text:m.desc||'', target:{ section:'courses', courseId:c.id, focusId:`course-module-${m.id}` } });
      (m.submodules||[]).forEach(sub => {
        if ((sub.name+' '+(sub.desc||'')).toLowerCase().includes(q)) results.push({ area:'Curso / submódulo', title:`${c.name} > ${m.name} > ${sub.name}`, text:sub.desc||'', target:{ section:'courses', courseId:c.id, focusId:`course-submodule-${sub.id}` } });
      });
      (m.videos||[]).forEach(video => {
        if ((video.title+' '+(video.url||'')).toLowerCase().includes(q)) results.push({ area:'Curso / vídeo', title:`${c.name} > ${m.name} > ${video.title}`, text:video.url || '', target:{ section:'courses', courseId:c.id, focusId:`course-video-${video.id}` } });
      });
      (m.notes||[]).forEach(n => { if ((n.title+' '+n.content).toLowerCase().includes(q)) results.push({ area:'Anotação', title:`${c.name} > ${m.name} > ${n.title}`, text:n.content.slice(0,180), target:{ section:'courses', courseId:c.id, focusId:`course-note-${n.id}` } }); });
      (m.links||[]).forEach(l => { if ((l.title+' '+l.url).toLowerCase().includes(q)) results.push({ area:'Link', title:`${c.name} > ${m.name} > ${l.title}`, text:l.url, target:{ section:'courses', courseId:c.id, focusId:`course-module-${m.id}` } }); });
    });
  });
  appData.docs.forEach(d => { if ((d.name+' '+(d.desc||'')+' '+(d.content||'')).toLowerCase().includes(q)) results.push({ area:'Documentação', title:d.name, text:(d.content||d.desc||'').slice(0,220), target:{ section:'docs', docId:d.id, focusId:`doc-${d.id}` } }); });
  appData.codeSpaces.forEach(s => {
    if ((s.name+' '+(s.desc||'')).toLowerCase().includes(q)) results.push({ area:'Código', title:s.name, text:s.desc||'', target:{ section:'code', codeSpaceId:s.id, focusId:`code-space-view-${s.id}` } });
    (s.subspaces||[]).forEach(ss => {
      if ((s.name+' '+ss.name+' '+(ss.desc||'')).toLowerCase().includes(q)) results.push({ area:'Código / subespaço', title:`${s.name} > ${ss.name}`, text:ss.desc||'', target:{ section:'code', codeSpaceId:s.id, codeSubspaceId:ss.id, focusId:`code-subspace-view-${ss.id}` } });
      (ss.snippets||[]).forEach(sn => { if ((sn.title+' '+sn.description+' '+sn.code).toLowerCase().includes(q)) results.push({ area:'Snippet', title:`${s.name} > ${ss.name} > ${sn.title}`, text:(sn.description || sn.code).slice(0,220), target:{ section:'code', codeSpaceId:s.id, codeSubspaceId:ss.id, focusId:`snippet-${sn.id}` } }); });
    });
  });
  [ ['Exercícios',appData.exerciseSpaces,'exercises'], ['Entrevistas',appData.interviewSpaces,'interviews'] ].forEach(([area,list,section]) => list.forEach(s => {
    if ((s.name+' '+(s.desc||'')).toLowerCase().includes(q)) results.push({ area, title:s.name, text:s.desc||'', target:{ section, spaceId:s.id, focusId:`${section === 'exercises' ? 'exercise' : 'interview'}-space-view-${s.id}` } });
    (s.subspaces||[]).forEach(ss => {
      if ((s.name+' '+ss.name+' '+(ss.desc||'')).toLowerCase().includes(q)) results.push({ area, title:`${s.name} > ${ss.name}`, text:ss.desc||'', target:{ section, spaceId:s.id, subId:ss.id, focusId:`${section === 'exercises' ? 'exercise' : 'interview'}-subspace-view-${ss.id}` } });
      (ss.items||[]).forEach(it => { if ((it.title+' '+it.prompt+' '+(it.userAnswer||'')+' '+(it.modelAnswer||'')).toLowerCase().includes(q)) results.push({ area: area.slice(0,-1), title:`${s.name} > ${ss.name} > ${it.title}`, text:(it.prompt || it.modelAnswer || '').slice(0,220), target:{ section, spaceId:s.id, subId:ss.id, focusId:`${section === 'exercises' ? 'exercise' : 'interview'}-item-${it.id}` } }); });
    });
  }));
  Object.entries(appData.dailyGoals || {}).forEach(([dayKey, goals]) => (goals || []).forEach(goal => {
    if ((goal.title + ' ' + (goal.note || '') + ' ' + (goal.source || '')).toLowerCase().includes(q)) {
      results.push({ area:'Metas diárias', title:`${goalDayLabel(dayKey)} > ${goal.title}`, text:(goal.note || `${goal.progress || 0}/${goal.target || 1}`).slice(0,220), target:{ section:'goals', dayKey, focusId:`goal-${dayKey}-${goal.id}` } });
    }
  }));
  appData.linkedinPosts.forEach(post => {
    if ((post.title+' '+post.content+' '+(post.status||'')).toLowerCase().includes(q)) results.push({ area:'Postagem LinkedIn', title:post.title||'Post sem título', text:post.content.slice(0,220), target:{ section:'linkedin', focusId:`linkedin-post-${post.id}` } });
  });
  appData.certificates.forEach(cert => {
    if ((cert.name+' '+(cert.issuer||'')+' '+(cert.notes||'')+' '+(cert.status||'')).toLowerCase().includes(q)) results.push({ area:'Certificados e badges', title:cert.name, text:[cert.issuer, cert.status, cert.notes].filter(Boolean).join(' · ').slice(0,220), target:{ section:'certs', focusId:`cert-${cert.id}` } });
  });
  appData.generalNotes.forEach(note => {
    if ((note.title+' '+note.content).toLowerCase().includes(q)) results.push({ area:'Anotações gerais', title:note.title, text:note.content.slice(0,220), target:{ section:'notes', focusId:`general-note-${note.id}` } });
  });
  appData.noteCategories.forEach(category => {
    if ((category.name || '').toLowerCase().includes(q)) results.push({ area:'Categorias de anotações', title:category.name, text:`${appData.noteRecords.filter(record => record.categoryId === category.id).length} registro(s)`, target:{ section:'notes', focusId:`note-category-${category.id}` } });
  });
  appData.noteRecords.forEach(record => {
    const category = appData.noteCategories.find(item => item.id === record.categoryId);
    if ((record.title+' '+(record.content || '')+' '+(category?.name || '')).toLowerCase().includes(q)) results.push({ area:'Registros', title:record.title || 'Registro sem título', text:[category?.name || 'Sem categoria', (record.content || '')].join(' · ').slice(0,220), target:{ section:'notes', focusId:`note-record-${record.id}` } });
  });
  appData.tools.forEach(tool => {
    if ((tool.name+' '+(tool.category||'')+' '+(tool.instructions||'')+' '+(tool.downloadUrl||'')+' '+(tool.websiteUrl||'')).toLowerCase().includes(q)) {
      results.push({ area:'Ferramentas', title:tool.name, text:[tool.category, tool.downloadUrl, tool.websiteUrl].filter(Boolean).join(' · ').slice(0,220), target:{ section:'tools', focusId:`tool-${tool.id}` } });
    }
  });
  currentDetail.searchResults = results;
  const html = `
    <div class="headline"><div><div class="title">Busca</div><div class="subtitle">Resultados para "${esc(rawQuery)}"</div></div></div>
    <div class="search-results">
      ${results.length ? results.map((r,idx)=>`<div class="panel click-search-result" onclick="openSearchResult(${idx})"><div class="panel-title">${esc(r.area)}</div><div class="row-title">${esc(r.title)}</div><div class="row-text">${nl2br(r.text)}</div><div class="row-sub" style="margin-top:10px;color:var(--warn)">Abrir resultado</div></div>`).join('') : '<div class="empty">Nenhum resultado encontrado.</div>'}
    </div>`;
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  const dash = document.getElementById('section-dashboard');
  dash.classList.add('active');
  dash.innerHTML = html;
  document.getElementById('topbar-path').textContent = 'BUSCA';
  document.getElementById('status-section').textContent = 'BUSCA';
}

function openImportCenter(preset='') {
  openModal('Importar conteúdo', `
    <div class="row"><label class="lbl">Tipo</label>
      <select id="imp-type" class="select">
        <option value="code" ${preset==='code'?'selected':''}>Exemplos de código</option>
        <option value="exercise" ${preset==='exercise'?'selected':''}>Exercícios</option>
        <option value="interview" ${preset==='interview'?'selected':''}>Perguntas de entrevista</option>
      </select>
    </div>
    <div class="row"><label class="lbl">Arquivo (.json, .csv, .txt)</label><input id="imp-file" class="input" type="file" accept=".json,.csv,.txt"></div>
    <div class="panel" style="margin-top:8px">
      <div class="panel-title">Layout CSV sugerido</div>
      <div class="row-text">Para código: space,subspace,title,lang,description,code\nPara exercícios/entrevistas: space,subspace,title,prompt,answer</div>
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="panel-title">Layout JSON sugerido</div>
      <div class="row-text">[{"space":"Nome do espaço","subspace":"Nome do subespaço","title":"Título","lang":"COBOL","description":"...","code":"..."}]</div>
      <div class="row-text">[{"space":"Nome do espaço","subspace":"Nome do subespaço","title":"Questão","prompt":"Enunciado","answer":"Resposta modelo"}]</div>
    </div>
  `, `<button class="btn primary" onclick="importContent()">Importar</button>`);
}
function simpleCsvParse(text) {
  const rows = []; let row=[]; let cell=''; let q=false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i], next=text[i+1];
    if (ch === '"') {
      if (q && next === '"') { cell += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) { row.push(cell); cell=''; }
    else if ((ch === '\n' || ch === '\r') && !q) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row=[]; cell='';
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim().length));
}
function ensureImportedSpace(kind, spaceName, subspaceName='Base') {
  const list = getSpaceList(kind);
  let space = list.find(s => s.name.toLowerCase() === String(spaceName||'Importado').toLowerCase());
  if (!space) {
    space = { id:uid(), name:spaceName||'Importado', desc:'Importado', attachments:[], subspaces:[], createdAt:Date.now() };
    list.push(space);
  }
  let sub = (space.subspaces||[]).find(ss => ss.name.toLowerCase() === String(subspaceName||'Base').toLowerCase());
  if (!sub) {
    sub = kind==='code'
      ? { id:uid(), name:subspaceName||'Base', desc:'Importado', attachments:[], snippets:[], createdAt:Date.now() }
      : { id:uid(), name:subspaceName||'Base', desc:'Importado', attachments:[], items:[], createdAt:Date.now() };
    space.subspaces.push(sub);
  }
  return sub;
}
function importContent() {
  const file = document.getElementById('imp-file').files[0];
  const type = document.getElementById('imp-type').value;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = String(e.target.result || '');
    try {
      // ── Detecta backup completo (exportAllData) ──────────────────
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (parsed && parsed.version === 'mfhub.v4' && parsed.data) {
          const src = parsed.data;
          let merged = 0;
          // Merge inteligente: adiciona apenas itens que não existem (por título)
          const mergeList = (srcList, destList, itemsKey) => {
            (srcList || []).forEach(srcSpace => {
              let destSpace = destList.find(s => s.name === srcSpace.name);
              if (!destSpace) {
                destSpace = { ...srcSpace, id: uid(), subspaces: [] };
                destList.push(destSpace);
              }
              (srcSpace.subspaces || []).forEach(srcSub => {
                let destSub = destSpace.subspaces.find(ss => ss.name === srcSub.name);
                if (!destSub) {
                  destSub = { ...srcSub, id: uid(), [itemsKey]: [] };
                  destSpace.subspaces.push(destSub);
                }
                const existingTitles = new Set((destSub[itemsKey] || []).map(i => i.title));
                (srcSub[itemsKey] || []).forEach(item => {
                  if (!existingTitles.has(item.title)) {
                    destSub[itemsKey].push({ ...item, id: uid() });
                    merged++;
                  }
                });
              });
            });
          };
          mergeList(src.exerciseSpaces, appData.exerciseSpaces, 'items');
          mergeList(src.interviewSpaces, appData.interviewSpaces, 'items');
          mergeList(src.codeSpaces, appData.codeSpaces, 'snippets');
          // Merge de outros arrays simples (cursos, docs, notas, etc.)
          const mergeSimple = (key) => {
            const existing = new Set((appData[key]||[]).map(x=>x.name||x.title||x.id));
            (src[key]||[]).forEach(x => {
              if (!existing.has(x.name||x.title||x.id)) {
                appData[key].push({ ...x, id: uid() });
                merged++;
              }
            });
          };
          ['courses','docs','generalNotes','linkedinPosts','certificates','tools'].forEach(mergeSimple);
          saveUserData(); closeModal(); renderAll();
          showToast(`Backup mesclado: ${merged} item(ns) novo(s) adicionado(s).`);
          return;
        }
        // ── JSON de conteúdo (array) ──────────────────────────────
        if (!Array.isArray(parsed)) throw new Error('JSON inválido');
        let count = 0;
        parsed.forEach(obj => {
          if (type === 'code') {
            const sub = ensureImportedSpace('code', obj.space||'Importado', obj.subspace||'Base');
            const titles = new Set((sub.snippets||[]).map(s=>s.title));
            if (!titles.has(obj.title||'Snippet')) {
              sub.snippets.push({ id:uid(), title:obj.title||'Snippet', lang:obj.lang||'', description:obj.description||'', code:obj.code||'', createdAt:Date.now() });
              count++;
            }
          } else {
            const sub = ensureImportedSpace(type, obj.space||'Importado', obj.subspace||'Base');
            const titles = new Set((sub.items||[]).map(i=>i.title));
            if (!titles.has(obj.title||'Questão')) {
              sub.items.push({ id:uid(), title:obj.title||'Questão', prompt:obj.prompt||'', userAnswer:'', modelAnswer:obj.answer||'Sem resposta modelo cadastrada ainda.', createdAt:Date.now(), showModel:false });
              count++;
            }
          }
        });
        saveUserData(); closeModal(); renderAll();
        showToast(count > 0 ? `Importação concluída: ${count} item(ns) novo(s).` : 'Nenhum item novo — todos já existiam.');
        return;
      }
      // ── CSV ───────────────────────────────────────────────────────
      let rows = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const prs = simpleCsvParse(text);
        const head = prs.shift().map(h=>String(h).trim());
        rows = prs.map(r => Object.fromEntries(head.map((h,i)=>[h, r[i] ?? ''])));
      } else {
        // ── TXT: blocos separados por linha em branco ─────────────
        rows = text.split(/\n\s*\n/).map(block => {
          const lines = block.trim().split(/\n/);
          return { space:lines[0]||'Importado', subspace:lines[1]||'Base', title:lines[2]||'Item importado', prompt:lines.slice(3).join('\n'), answer:'' };
        });
      }
      let count = 0;
      rows.forEach(obj => {
        if (type === 'code') {
          const sub = ensureImportedSpace('code', obj.space||'Importado', obj.subspace||'Base');
          const titles = new Set((sub.snippets||[]).map(s=>s.title));
          if (!titles.has(obj.title||'Snippet')) {
            sub.snippets.push({ id:uid(), title:obj.title||'Snippet', lang:obj.lang||'', description:obj.description||'', code:obj.code||'', createdAt:Date.now() });
            count++;
          }
        } else {
          const sub = ensureImportedSpace(type, obj.space||'Importado', obj.subspace||'Base');
          const titles = new Set((sub.items||[]).map(i=>i.title));
          if (!titles.has(obj.title||'Questão')) {
            sub.items.push({ id:uid(), title:obj.title||'Questão', prompt:obj.prompt||'', userAnswer:'', modelAnswer:obj.answer||'Sem resposta modelo cadastrada ainda.', createdAt:Date.now(), showModel:false });
            count++;
          }
        }
      });
      saveUserData(); closeModal(); renderAll();
      showToast(count > 0 ? `Importação concluída: ${count} item(ns) novo(s).` : 'Nenhum item novo — todos já existiam.');
    } catch (err) {
      console.error(err);
      alert('Não foi possível importar este arquivo. Verifique o layout.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function openModal(title, body, foot='') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-foot').innerHTML = foot + '<button class="btn" onclick="closeModal()">Cancelar</button>';
  document.getElementById('modal-wrap').classList.add('open');
}
function closeModal() { document.getElementById('modal-wrap').classList.remove('open'); }
document.getElementById('modal-wrap').addEventListener('click', e => { if (e.target.id === 'modal-wrap') closeModal(); });

function renderAll() {
  renderDashboard(); renderGoals(); renderNotes(); renderCourses(); renderDocs(); renderCode(); renderExercises(); renderInterviews(); renderLinkedin(); renderCerts(); renderTools(); renderLab(); updateStatus();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    if (!document.getElementById('register-form').classList.contains('hidden')) doRegister();
    else if (!document.getElementById('recovery-form')?.classList.contains('hidden')) resetPassword();
    else if (!document.getElementById('forgot-form').classList.contains('hidden')) sendResetCode();
    else doLogin();
  }
});

bindSupabaseAuthEvents();
setMissingSupabaseHelp();
loadRememberedLogin();

if (isRecoveryFlow()) {
  showLoginScreen('recovery');
} else {
  // Enquanto resolve a sessão, mantém tela de login invisível para evitar o piscar
  tryRestoreSession().then(restored => {
    if (!restored) showLoginScreen('login');
  });
}


function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser,
    version: 'mfhub.v4',
    data: appData,
    streak: getStreakData(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mfhub-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exportado com sucesso.');
}


// ── Auto-exported onclick handlers ─────────────────────────────────────
window.addSuggestedGoal               = addSuggestedGoal;
window.deleteCert                     = deleteCert;
window.deleteCourseLink               = deleteCourseLink;
window.deleteCourseNote               = deleteCourseNote;
window.deleteCourseVideo              = deleteCourseVideo;
window.deleteGeneralNote              = deleteGeneralNote;
window.deleteGoal                     = deleteGoal;
window.deleteLinkedinPost             = deleteLinkedinPost;
window.deleteModule                   = deleteModule;
window.deletePracticeItem             = deletePracticeItem;
window.deleteSnippet                  = deleteSnippet;
window.deleteSubmodule                = deleteSubmodule;
window.deleteTool                     = deleteTool;
window.deleteCourse                   = deleteCourse;
window.backToPracticeList             = backToPracticeList;
window.backToPracticeSpace            = backToPracticeSpace;
window.backToCodeList                 = backToCodeList;
window.backToCodeSpace                = backToCodeSpace;
window.backToCourseList               = backToCourseList;
window.backToDocList                  = backToDocList;
window.deleteDoc                      = deleteDoc;
window.deleteGenericSpace             = deleteGenericSpace;
window.deleteSubspace                 = deleteSubspace;
window.downloadAttachment             = downloadAttachment;
window.duplicateGoalSuggestions       = duplicateGoalSuggestions;
window.importContent                  = importContent;
window.openAttachment                 = openAttachment;
window.openCertModal                  = openCertModal;
window.openCodeSpace                  = openCodeSpace;
window.openCodeSubspace               = openCodeSubspace;
window.openCourse                     = openCourse;
window.openCourseEditModal            = openCourseEditModal;
window.openCourseLinkModal            = openCourseLinkModal;
window.openCourseModal                = openCourseModal;
window.openCourseNoteModal            = openCourseNoteModal;
window.openCourseVideoModal           = openCourseVideoModal;
window.openDoc                        = openDoc;
window.openDocModal                   = openDocModal;
window.openGeneralNoteModal           = openGeneralNoteModal;
window.openGenericSpaceModal          = openGenericSpaceModal;
window.openGoalModal                  = openGoalModal;
window.openLabModal                   = openLabModal;
window.openLinkedinPostModal          = openLinkedinPostModal;
window.openModuleModal                = openModuleModal;
window.openPracticeItemModal          = openPracticeItemModal;
window.openPracticeSpace              = openPracticeSpace;
window.openPracticeSubspace           = openPracticeSubspace;
window.openSearchResult               = openSearchResult;
window.openSnippetModal               = openSnippetModal;
window.openSubmoduleModal             = openSubmoduleModal;
window.openSubspaceModal              = openSubspaceModal;
window.openToolModal                  = openToolModal;
window.recalculateCourseProgress      = recalculateCourseProgress;
window.removeAttachment               = removeAttachment;
window.saveCert                       = saveCert;
window.saveCourse                     = saveCourse;
window.saveCourseEdit                 = saveCourseEdit;
window.saveCourseLink                 = saveCourseLink;
window.saveCourseNote                 = saveCourseNote;
window.saveCourseVideo                = saveCourseVideo;
window.saveDoc                        = saveDoc;
window.saveDocContent                 = saveDocContent;
window.saveGeneralNote                = saveGeneralNote;
window.saveGenericSpace               = saveGenericSpace;
window.saveGoalModal                  = saveGoalModal;
window.saveLab                        = saveLab;
window.saveLinkedinPost               = saveLinkedinPost;
window.saveModule                     = saveModule;
window.savePracticeItem               = savePracticeItem;
window.saveSnippet                    = saveSnippet;
window.saveSubmodule                  = saveSubmodule;
window.saveSubspace                   = saveSubspace;
window.saveTool                       = saveTool;
window.saveUploads                    = saveUploads;
window.scrollPracticeItem             = scrollPracticeItem;
window.setSelectedGoalDay             = setSelectedGoalDay;
window.stepGoalProgress               = stepGoalProgress;
window.toggleCourseVideoWatched       = toggleCourseVideoWatched;
window.toggleLinkedinStatus           = toggleLinkedinStatus;
window.toggleModelAnswer              = toggleModelAnswer;
window.toggleModuleDone               = toggleModuleDone;
window.togglePracticeIndex            = togglePracticeIndex;
window.togglePracticeMinimized        = togglePracticeMinimized;
window.toggleSubmoduleDone            = toggleSubmoduleDone;
window.uploadAttachmentsModal         = uploadAttachmentsModal;

// Expose functions called via onclick in HTML to global scope
window.doLogin         = doLogin;
window.doRegister      = doRegister;
window.sendResetCode   = sendResetCode;
window.resetPassword   = resetPassword;
window.toggleAuth      = toggleAuth;
window.logout          = logout;
window.toggleTheme     = toggleTheme;
window.goSection       = goSection;
window.openImportCenter= openImportCenter;
window.handleSearch    = handleSearch;
window.closeModal      = closeModal;
window.exportAllData   = exportAllData;
window.nextVerse       = nextVerse;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleLabPlan   = toggleLabPlan;
window.createInlineGeneralNote        = createInlineGeneralNote;
window.saveInlineGeneralNote          = saveInlineGeneralNote;
window.openNoteCategoryModal          = openNoteCategoryModal;
window.saveNoteCategory               = saveNoteCategory;
window.deleteNoteCategory             = deleteNoteCategory;
window.openNoteRecordModal            = openNoteRecordModal;
window.saveNoteRecord                 = saveNoteRecord;
window.deleteNoteRecord               = deleteNoteRecord;
});