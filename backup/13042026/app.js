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
const CLOUD_RPC_GET = 'mfhub_get_state';
const CLOUD_RPC_PUT = 'mfhub_put_state';
const CLOUD_RPC_ADMIN_METRICS = 'mfhub_admin_metrics';
const CLOUD_SYNC_DEBOUNCE_MS = 700;
const FONT_STYLE_KEY = 'mfhub.fontstyle.v1';
const FONT_OPTIONS = [
  { value:'share-tech', label:'Share Tech Mono' },
  { value:'ibm', label:'IBM Plex Mono' },
  { value:'vt323', label:'VT323 CRT' },
  { value:'silkscreen', label:'Silkscreen' }
];
let currentAuthIdentity = null;
let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncQueued = false;
let lastCloudError = '';
function getStreakStorageKey() { return currentUser ? `${STREAK_KEY}.${currentUser}` : STREAK_KEY; }
function normalizeStreakData(v) {
  const s = Object.assign({ lastDate:'', count:0, longest:0 }, v || {});
  s.lastDate = String(s.lastDate || '');
  s.count = Math.max(0, Number(s.count) || 0);
  s.longest = Math.max(s.count, Number(s.longest) || 0);
  return s;
}
function getStreakData() { return normalizeStreakData(readLS(getStreakStorageKey(), { lastDate:'', count:0, longest:0 })); }
function mergeStreakData(localValue, remoteValue) {
  const local = normalizeStreakData(localValue);
  const remote = normalizeStreakData(remoteValue);
  if (!remote.lastDate) return { ...local, longest: Math.max(local.longest, remote.longest) };
  if (!local.lastDate) return { ...remote, longest: Math.max(local.longest, remote.longest) };
  if (local.lastDate === remote.lastDate) {
    const count = Math.max(local.count, remote.count);
    return { lastDate: local.lastDate, count, longest: Math.max(local.longest, remote.longest, count) };
  }
  if (local.lastDate > remote.lastDate) {
    return { ...local, longest: Math.max(local.longest, remote.longest) };
  }
  return { ...remote, longest: Math.max(local.longest, remote.longest) };
}
function updateStreak() {
  const today = new Date().toISOString().slice(0,10);
  const s = getStreakData();
  if (s.lastDate === today) return s; // already updated today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const newCount = s.lastDate === yesterday ? s.count + 1 : 1;
  const newLongest = Math.max(newCount, s.longest || 0);
  const updated = { lastDate:today, count:newCount, longest:newLongest };
  writeLS(getStreakStorageKey(), updated);
  scheduleCloudSync('streak');
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
let currentDetail = { courseId:null, docId:null, manualId:null, codeSpaceId:null, codeSubspaceId:null, exerciseSpaceId:null, exerciseSubspaceId:null, interviewSpaceId:null, interviewSubspaceId:null, goalDay:null, reminderFilter:'pending', exerciseFilter:'all', exerciseIndexOpen:true, searchResults:[] };

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
function getFontKey(user) { return `mfhub.font.${user||'guest'}.v4`; }
function normalizeFontStyle(fontStyle) { return FONT_OPTIONS.some(opt => opt.value === fontStyle) ? fontStyle : 'share-tech'; }
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
    tools: [],
    manuals: [],
    reminders: [],
    profile: { photoData:'', photoName:'', photoPosition:'center center' },
    dailyGoals: {},
    lab: { url:'', planUrl:'emunah-bank-lab.html', title:'EMUNAH BANK LAB' },
    meta: { seedVersion:0, lastSection:'dashboard', goalSeedVersion:0, selectedGoalDay:getTodayGoalKey() }
  };
}

const SPACE_ICON_DEFAULTS = { code:'💻', exercise:'⚙️', interview:'💬' };
const SUBSPACE_ICON_DEFAULTS = { code:'🧩', exercise:'📝', interview:'🎙️' };

function normalizeIcon(value, fallback='📁') {
  const icon = String(value ?? '').trim();
  return icon || fallback;
}
function getKindLabel(kind) {
  return kind === 'code' ? 'código' : kind === 'exercise' ? 'exercícios' : 'entrevistas';
}
function getItemLabel(kind, plural=true) {
  if (kind === 'code') return plural ? 'snippets' : 'snippet';
  if (kind === 'exercise') return plural ? 'exercícios' : 'exercício';
  return plural ? 'perguntas' : 'pergunta';
}
function splitLegacyHierarchyName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const separators = [' > ', ' — ', ' - '];
  const sep = separators.find(item => raw.includes(item));
  if (!sep) return null;
  const parts = raw.split(sep).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let parent = parts.shift();
  let child = parts.join(' / ');
  if (/^exerc[ií]cios$/i.test(parent)) parent = 'Exercícios';
  if (/^entrevistas$/i.test(parent)) parent = 'Entrevistas';
  if (/^exemplos\s+/i.test(parent)) parent = parent.replace(/^exemplos\s+/i, '').trim();
  return parent && child ? { parent, child } : null;
}
function ensureSpaceShape(kind, space) {
  if (!space || typeof space !== 'object') return;
  space.name = String(space.name || 'Espaço');
  space.desc = String(space.desc || '');
  space.icon = normalizeIcon(space.icon, SPACE_ICON_DEFAULTS[kind] || '📁');
  space.attachments ||= [];
  space.subspaces ||= [];
  space.createdAt ||= Date.now();
  const itemsKey = kind === 'code' ? 'snippets' : 'items';
  space.subspaces.forEach(sub => {
    sub.name = String(sub.name || 'Base');
    sub.desc = String(sub.desc || '');
    sub.icon = normalizeIcon(sub.icon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩');
    sub.attachments ||= [];
    sub[itemsKey] ||= [];
    sub.createdAt ||= Date.now();
    if (kind !== 'code') {
      sub.items = (sub.items || []).map(item => ({
        ...item,
        prompt: String(item?.prompt || item?.question || ''),
        userAnswer: String(item?.userAnswer || ''),
        modelAnswer: String(item?.modelAnswer || item?.answer || ''),
        showModel: !!item?.showModel,
        minimized: !!item?.minimized,
        createdAt: item?.createdAt || Date.now()
      }));
    } else {
      sub.snippets = (sub.snippets || []).map(snippet => ({
        ...snippet,
        title: String(snippet?.title || 'Snippet'),
        lang: String(snippet?.lang || ''),
        description: String(snippet?.description || ''),
        code: String(snippet?.code || ''),
        createdAt: snippet?.createdAt || Date.now()
      }));
    }
  });
}
function migrateLegacyHierarchy(kind) {
  const list = getSpaceList(kind);
  if (!Array.isArray(list) || !list.length) return;
  const itemsKey = kind === 'code' ? 'snippets' : 'items';
  const originals = [...list];
  const migrated = [];
  const getOrCreateSpace = (name, desc='') => {
    let space = migrated.find(item => item.name === name);
    if (!space) {
      space = {
        id: uid(),
        name,
        desc,
        icon: SPACE_ICON_DEFAULTS[kind] || '📁',
        attachments: [],
        subspaces: [],
        createdAt: Date.now()
      };
      migrated.push(space);
    } else if (!space.desc && desc) {
      space.desc = desc;
    }
    return space;
  };
  originals.forEach(space => {
    ensureSpaceShape(kind, space);
    const split = splitLegacyHierarchyName(space.name);
    const baseOnly = (space.subspaces || []).length === 1 && /^base$/i.test(String(space.subspaces[0]?.name || '').trim());
    if (!split || !baseOnly) {
      migrated.push(space);
      return;
    }
    const baseSub = space.subspaces[0];
    const targetSpace = getOrCreateSpace(split.parent, '');
    let targetSub = (targetSpace.subspaces || []).find(sub => String(sub.name || '').toLowerCase() === split.child.toLowerCase());
    if (!targetSub) {
      targetSub = {
        id: uid(),
        name: split.child,
        desc: String(baseSub.desc || space.desc || ''),
        icon: normalizeIcon(baseSub.icon || space.icon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩'),
        attachments: [...(space.attachments || []), ...(baseSub.attachments || [])],
        [itemsKey]: [],
        createdAt: baseSub.createdAt || space.createdAt || Date.now()
      };
      targetSpace.subspaces.push(targetSub);
    }
    const existingTitles = new Set((targetSub[itemsKey] || []).map(item => String(item?.title || '').trim().toLowerCase()));
    (baseSub[itemsKey] || []).forEach(item => {
      const key = String(item?.title || '').trim().toLowerCase();
      if (!key || existingTitles.has(key)) return;
      existingTitles.add(key);
      targetSub[itemsKey].push(item);
    });
  });
  list.length = 0;
  migrated.forEach(space => list.push(space));
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
  appData.tools ||= [];
  appData.manuals ||= [];
  appData.reminders ||= [];
  appData.profile ||= { photoData:'', photoName:'', photoPosition:'center center' };
  appData.profile.photoData ||= '';
  appData.profile.photoName ||= '';
  appData.profile.photoPosition ||= 'center center';
  appData.dailyGoals ||= {};
  appData.lab ||= { url:'', planUrl:'emunah-bank-lab.html', title:'EMUNAH BANK LAB' };
  appData.meta ||= { seedVersion:0, lastSection:'dashboard', goalSeedVersion:0, selectedGoalDay:getTodayGoalKey() };
  appData.meta.selectedGoalDay ||= getTodayGoalKey();

  appData.codeSpaces.forEach(space => ensureSpaceShape('code', space));
  appData.exerciseSpaces.forEach(space => ensureSpaceShape('exercise', space));
  appData.interviewSpaces.forEach(space => ensureSpaceShape('interview', space));
  migrateLegacyHierarchy('exercise');
  migrateLegacyHierarchy('interview');
  appData.codeSpaces.forEach(space => ensureSpaceShape('code', space));
  appData.exerciseSpaces.forEach(space => ensureSpaceShape('exercise', space));
  appData.interviewSpaces.forEach(space => ensureSpaceShape('interview', space));

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
  appData.reminders = (appData.reminders || []).map(ensureReminderShape);
}
function loadUserData() {
  appData = Object.assign(baseData(), readLS(userDataKey(currentUser), null) || {});
  ensureDefaults();
}
function saveUserData(options={}) {
  writeLS(userDataKey(currentUser), appData);
  if (!options.skipSync) scheduleCloudSync('data');
}
function setTheme(theme, options={}) {
  document.documentElement.dataset.theme = theme;
  if (currentUser) writeLS(getThemeKey(currentUser), theme);
  if (!options.skipSync) scheduleCloudSync('theme');
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  setTheme(current === 'light' ? 'dark' : 'light');
  renderAll();
}
function applySavedTheme() {
  const theme = currentUser ? readLS(getThemeKey(currentUser), 'dark') : 'dark';
  setTheme(theme || 'dark', { skipSync:true });
}
function getCurrentFontStyle() {
  return normalizeFontStyle(document.documentElement.dataset.font || (currentUser ? readLS(getFontKey(currentUser), 'share-tech') : 'share-tech'));
}
function updateFontSelectorValue() {
  const el = document.getElementById('font-style-select');
  if (el) el.value = getCurrentFontStyle();
}
function setFontStyle(fontStyle, options={}) {
  const normalized = normalizeFontStyle(fontStyle);
  document.documentElement.dataset.font = normalized;
  if (currentUser) writeLS(getFontKey(currentUser), normalized);
  updateFontSelectorValue();
  if (!options.skipSync) scheduleCloudSync('font');
}
function applySavedFontStyle() {
  const fontStyle = currentUser ? readLS(getFontKey(currentUser), 'share-tech') : 'share-tech';
  setFontStyle(fontStyle, { skipSync:true });
}
function hydrateFontSelectorElement(el) {
  if (!el) return null;
  if (el.dataset.ready === '1') {
    updateFontSelectorValue();
    return el;
  }
  el.innerHTML = '';
  FONT_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = 'Fonte: ' + opt.label;
    el.appendChild(option);
  });
  el.addEventListener('change', () => setFontStyle(el.value));
  el.dataset.ready = '1';
  updateFontSelectorValue();
  return el;
}
function ensureFontSelectorElement() {
  let el = document.getElementById('font-style-select');
  if (el) return hydrateFontSelectorElement(el);
  const topbar = document.getElementById('topbar-meta-group') || document.querySelector('.topbar');
  if (!topbar) return null;
  el = document.createElement('select');
  el.id = 'font-style-select';
  el.className = 'select topbar-font-select';
  el.setAttribute('aria-label', 'Estilo de fonte');
  const anchor = ensureCloudStatusElement() || document.getElementById('clock');
  topbar.insertBefore(el, anchor);
  return hydrateFontSelectorElement(el);
}
function renderSidebarIdentity() {
  const avatarBtn = document.getElementById('profile-avatar-btn');
  const avatarImg = document.getElementById('profile-avatar-image');
  const avatarFallback = document.getElementById('profile-avatar-fallback');
  const photo = String(appData?.profile?.photoData || '');
  const photoPosition = String(appData?.profile?.photoPosition || 'center center');
  if (avatarBtn) {
    avatarBtn.style.backgroundImage = 'none';
    avatarBtn.setAttribute('aria-label', 'Abrir perfil');
    avatarBtn.style.setProperty('--profile-photo-position', photoPosition);
  }
  if (avatarImg) {
    avatarImg.style.objectPosition = photoPosition;
    avatarImg.onerror = () => {
      avatarImg.removeAttribute('src');
      avatarImg.hidden = true;
      if (avatarFallback) avatarFallback.style.display = 'block';
    };
    if (photo) {
      avatarImg.src = photo;
      avatarImg.hidden = false;
    } else {
      avatarImg.removeAttribute('src');
      avatarImg.hidden = true;
    }
  }
  if (avatarFallback) avatarFallback.style.display = photo ? 'none' : 'block';
}
function openProfilePhotoModal() {
  openModal('Foto de perfil', `
    <div class="row"><label class="lbl">Imagem</label><input id="profile-photo-file" class="input" type="file" accept="image/*"></div>
    <div class="auth-note">Escolha uma imagem JPG, PNG ou WEBP. Ela será salva junto com o seu estado do site e aparecerá na barra lateral.</div>
    ${appData?.profile?.photoData ? `<div class="row"><img src="${esc(appData.profile.photoData)}" alt="Prévia" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:1px solid var(--border)"></div>` : ''}
  `, `<button class="btn" onclick="clearProfilePhoto()">Remover foto</button><button class="btn primary" onclick="saveProfilePhoto()">Salvar foto</button>`);
}
async function saveProfilePhoto() {
  const file = document.getElementById('profile-photo-file')?.files?.[0];
  if (!file) return showToast('Escolha uma imagem primeiro.');
  try {
    const processed = await processProfilePhotoFile(file);
    appData.profile ||= { photoData:'', photoName:'', photoPosition:'center center' };
    appData.profile.photoData = processed.dataUrl;
    appData.profile.photoName = processed.fileName || 'perfil.jpg';
    appData.profile.photoPosition ||= 'center center';
    saveUserData({ reason:'Atualizou foto de perfil' });
    renderSidebarIdentity();
    closeModal();
    showToast('Foto de perfil atualizada.');
  } catch (err) {
    showToast(err.message || 'Não foi possível salvar a foto.');
  }
}
function clearProfilePhoto() {
  appData.profile ||= { photoData:'', photoName:'', photoPosition:'center center' };
  appData.profile.photoData = '';
  appData.profile.photoName = '';
  appData.profile.photoPosition ||= 'center center';
  saveUserData({ reason:'Removeu foto de perfil' });
  renderSidebarIdentity();
  closeModal();
  showToast('Foto de perfil removida.');
}

function ensureCloudStatusElement() {
  let el = document.getElementById('cloud-sync-status');
  if (el) return el;
  const topbar = document.getElementById('topbar-meta-group') || document.querySelector('.topbar');
  if (!topbar) return null;
  el = document.createElement('span');
  el.id = 'cloud-sync-status';
  el.className = 'badge';
  el.textContent = 'Nuvem local';
  topbar.insertBefore(el, document.getElementById('clock'));
  return el;
}
function setCloudStatus(state='local', text='Nuvem local') {
  const el = ensureCloudStatusElement();
  if (!el) return;
  const icons = { local:'☁', syncing:'⟳', synced:'☁', error:'⚠' };
  el.dataset.state = state;
  el.textContent = `${icons[state] || '☁'} ${text}`;
  el.title = lastCloudError || text;
  el.style.borderColor = 'var(--border)';
  el.style.color = 'var(--text-soft)';
  if (state === 'syncing') {
    el.style.borderColor = 'var(--warn)';
    el.style.color = 'var(--warn)';
  } else if (state === 'synced') {
    el.style.borderColor = 'color-mix(in oklab, var(--accent) 35%, var(--border))';
    el.style.color = 'var(--accent)';
  } else if (state === 'error') {
    el.style.borderColor = 'var(--danger)';
    el.style.color = 'var(--danger)';
  }
}
function canUseCloudSync() {
  return !!(SUPABASE_ENABLED && supabaseClient && currentAuthIdentity?.id);
}
function payloadHasUserContent(payload) {
  const p = Object.assign(baseData(), payload || {});
  return Boolean(
    (p.courses || []).length ||
    (p.docs || []).length ||
    (p.codeSpaces || []).length ||
    (p.exerciseSpaces || []).length ||
    (p.interviewSpaces || []).length ||
    (p.linkedinPosts || []).length ||
    (p.certificates || []).length ||
    (p.generalNotes || []).length ||
    (p.tools || []).length ||
    (p.reminders || []).length ||
    Object.values(p.dailyGoals || {}).some(list => Array.isArray(list) && list.length) ||
    (p.profile?.photoData) ||
    (p.lab?.url)
  );
}
function buildCloudArgs() {
  return {
    p_payload: appData,
    p_theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    p_font_style: getCurrentFontStyle(),
    p_streak: getStreakData()
  };
}
function isMissingRpcSignature(error) {
  const msg = String(error?.message || '');
  return msg.includes('Could not find the function public.' + CLOUD_RPC_PUT) || msg.includes('schema cache');
}
async function callPutStateRpc(args) {
  const { error } = await supabaseClient.rpc(CLOUD_RPC_PUT, args);
  if (error) throw error;
  return true;
}
async function fetchCloudRow() {
  if (!canUseCloudSync()) return null;
  const { data, error } = await supabaseClient.rpc(CLOUD_RPC_GET);
  if (error) throw error;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}
async function pushCloudState(reason='manual') {
  if (!canUseCloudSync()) {
    setCloudStatus('local', 'Nuvem indisponível');
    return false;
  }
  setCloudStatus('syncing', reason === 'bootstrap' ? 'Nuvem iniciando…' : 'Nuvem salvando…');
  const fullArgs = buildCloudArgs();
  try {
    await callPutStateRpc(fullArgs);
  } catch (error) {
    if (!isMissingRpcSignature(error)) throw error;
    const fallbacks = [
      { p_payload: fullArgs.p_payload, p_theme: fullArgs.p_theme, p_streak: fullArgs.p_streak },
      { p_payload: fullArgs.p_payload, p_theme: fullArgs.p_theme }
    ];
    let handled = false;
    for (const fallbackArgs of fallbacks) {
      try {
        await callPutStateRpc(fallbackArgs);
        handled = true;
        break;
      } catch (fallbackError) {
        if (!isMissingRpcSignature(fallbackError)) throw fallbackError;
      }
    }
    if (!handled) throw error;
  }
  lastCloudError = '';
  setCloudStatus('synced', 'Nuvem ✓');
  return true;
}
function scheduleCloudSync(reason='change') {
  if (!currentUser) return;
  if (!canUseCloudSync()) {
    setCloudStatus('local', 'Nuvem local');
    return;
  }
  clearTimeout(cloudSyncTimer);
  setCloudStatus('syncing', 'Nuvem salvando…');
  cloudSyncTimer = setTimeout(() => { flushCloudSync(reason); }, CLOUD_SYNC_DEBOUNCE_MS);
}
async function flushCloudSync(reason='manual') {
  if (!canUseCloudSync()) return false;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = null;
  if (cloudSyncInFlight) {
    cloudSyncQueued = true;
    return false;
  }
  cloudSyncInFlight = true;
  try {
    await pushCloudState(reason);
    return true;
  } catch (error) {
    console.error('MFHUB cloud sync failed:', error);
    lastCloudError = error?.message || 'Falha ao sincronizar com a nuvem.';
    setCloudStatus('error', 'Nuvem falha');
    showToast('Falha na nuvem: ' + lastCloudError);
    return false;
  } finally {
    cloudSyncInFlight = false;
    if (cloudSyncQueued) {
      cloudSyncQueued = false;
      scheduleCloudSync('queued');
    }
  }
}
async function bootstrapCloudState() {
  if (!currentUser) return;
  ensureCloudStatusElement();
  if (!canUseCloudSync()) {
    setCloudStatus('local', SUPABASE_ENABLED ? 'Nuvem sem sessão' : 'Nuvem indisponível');
    return;
  }
  try {
    setCloudStatus('syncing', 'Nuvem carregando…');
    const remote = await fetchCloudRow();
    const localHadContent = payloadHasUserContent(appData);
    if (!remote) {
      await pushCloudState('bootstrap');
      return;
    }
    if (!payloadHasUserContent(remote.payload) && localHadContent) {
      await pushCloudState('bootstrap');
      return;
    }
    appData = Object.assign(baseData(), remote.payload || {});
    ensureDefaults();
    writeLS(userDataKey(currentUser), appData);
    if (remote.theme) setTheme(remote.theme, { skipSync:true });
    if (remote.font_style) setFontStyle(remote.font_style, { skipSync:true });
    const mergedStreak = mergeStreakData(getStreakData(), remote.streak);
    writeLS(getStreakStorageKey(), mergedStreak);
    ensureSeedData();
    ensureDailyGoalsSeeded();
    renderAll();
    setCloudStatus('synced', 'Nuvem ✓');
    if (JSON.stringify(mergedStreak) !== JSON.stringify(normalizeStreakData(remote.streak))) scheduleCloudSync('streak-merge');
  } catch (error) {
    console.error('MFHUB cloud bootstrap failed:', error);
    lastCloudError = error?.message || 'Falha ao carregar os dados da nuvem.';
    setCloudStatus('error', 'Nuvem falha');
    showToast('Falha na nuvem: ' + lastCloudError);
  }
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
  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();
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
function withTimeout(promise, ms, message='Tempo de resposta excedido.') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
async function doLogin() {
  const email = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const remember = !!document.getElementById('login-remember')?.checked;
  setFieldText('login-error', '');
  if (!requireSupabase('login-error')) return;
  if (!email || !pass) return setFieldText('login-error', 'E-mail e senha são obrigatórios.');
  setAuthLoading('btn-login', true, 'Entrando...');
  let data, error;
  try {
    ({ data, error } = await withTimeout(
      supabaseClient.auth.signInWithPassword({ email, password: pass }),
      12000,
      'O Supabase demorou demais para responder ao login.'
    ));
  } catch (err) {
    setAuthLoading('btn-login', false);
    return setFieldText('login-error', (err && err.message) || 'O login demorou demais para responder.');
  }
  setAuthLoading('btn-login', false);
  if (error) return setFieldText('login-error', error.message || 'Não foi possível entrar.');
  if (remember) saveRememberedLogin(email); else clearRememberedLogin();
  const identity = getAuthIdentity(data.user);
  currentAuthIdentity = identity;
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
    currentAuthIdentity = identity;
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
  try { await flushCloudSync('logout'); } catch (e) {}
  removeLS(SESSION_KEY);
  currentUser = null;
  currentAuthIdentity = null;
  appData = null;
  document.documentElement.removeAttribute('data-auth');
  if (SUPABASE_ENABLED) {
    try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('Logout remoto falhou:', e.message); }
  }
  location.reload();
}
async function tryRestoreSession() {
  if (!SUPABASE_ENABLED) return false;
  const recovery = isRecoveryFlow();
  let data, error;
  try {
    ({ data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      5000,
      'A restauração de sessão demorou demais.'
    ));
  } catch (err) {
    console.warn('session-restore-timeout', err?.message || err);
    return false;
  }
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
  currentAuthIdentity = identity;
  writeLS(SESSION_KEY, { user:identity.storageUser, displayName:identity.displayName, email:identity.email, provider:'supabase' });
  startApp(identity.storageUser, identity.displayName);
  return true;
}
function bindSupabaseAuthEvents() {
  if (!SUPABASE_ENABLED) return;
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session?.user) currentAuthIdentity = getAuthIdentity(session.user);
    if (event === 'SIGNED_OUT') currentAuthIdentity = null;
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('recovery-email').value = session?.user?.email || '';
      showLoginScreen('recovery');
      setFieldText('recovery-help', 'Link validado. Agora defina a sua nova senha.', true);
    }
  });
}
async function startApp(user, displayName = user) {
  // Esconde a tela de login IMEDIATAMENTE antes de qualquer outra operação
  document.documentElement.dataset.auth = '1';
  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  currentUser = user;
  loadUserData();
  applySavedTheme();
  applySavedFontStyle();
  ensureSeedData();
  ensureDailyGoalsSeeded();
  updateStreak();
  document.getElementById('sidebar-user').textContent = String(displayName || user).toUpperCase();
  renderSidebarIdentity();
  document.getElementById('app').style.display = 'block';
  startClock();
  ensureFontSelectorElement();
  ensureCloudStatusElement();
  setCloudStatus(canUseCloudSync() ? 'syncing' : 'local', canUseCloudSync() ? 'Nuvem carregando…' : 'Nuvem local');
  // Restore section from URL hash (browser back/forward support), fallback to saved last section
  const hashSection = location.hash.slice(1);
  const initialSection = (hashSection && document.getElementById('section-' + hashSection))
    ? hashSection
    : (appData.meta.lastSection || 'dashboard');
  goSection(initialSection, !hashSection);  // don't push if hash was already in URL
  await bootstrapCloudState();
}
function setMissingSupabaseHelp() {
  if (SUPABASE_ENABLED) return;
  setFieldText('register-help', 'Crie o arquivo <strong>supabase-config.js</strong> com a URL e a Publishable key do projeto para ativar cadastro por e-mail e redefinição real de senha.', true);
  setFieldText('forgot-help', 'Sem o arquivo <strong>supabase-config.js</strong>, o envio real do link de redefinição por e-mail não funciona.', true);
}
function seedSpace(target, seed, mode) {
  if (target.some(x=>x.name===seed.name)) return;
  if (mode === 'code') {
    target.push({
      id: uid(), name: seed.name, desc: seed.desc, icon: SPACE_ICON_DEFAULTS.code, attachments: [], subspaces: [
        {
          id: uid(), name:'Base', desc:'Subespaço inicial', icon: SUBSPACE_ICON_DEFAULTS.code, attachments: [],
          snippets: (seed.snippets||[]).map(s => ({ id:uid(), title:s.title, lang:s.lang||'', description:s.description||'', code:s.code||'', createdAt:Date.now() })),
          createdAt:Date.now()
        }
      ], createdAt:Date.now()
    });
  } else {
    const kind = mode === 'practice-interview' ? 'interview' : 'exercise';
    target.push({
      id: uid(), name: seed.name, desc: seed.desc, icon: SPACE_ICON_DEFAULTS[kind], attachments: [], subspaces: [
        {
          id: uid(), name:'Base', desc:'Subespaço inicial', icon: SUBSPACE_ICON_DEFAULTS[kind], attachments: [],
          items: (seed.items||[]).map(it => ({ id:uid(), title:it.title, prompt:it.prompt, userAnswer:'', modelAnswer: String(it.answer || ''), createdAt:Date.now(), showModel:false })),
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
  SEEDS.interviews.forEach(s => seedSpace(appData.interviewSpaces, s, 'practice-interview'));
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
  const streak = getStreakData();
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
      <div class="kpi" style="border-color:var(--warn)"><div class="kpi-label">Sequência</div><div class="kpi-value" style="color:var(--warn)">🔥 ${streak.count}</div><div class="kpi-sub">dias seguidos · recorde ${streak.longest}</div></div>
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

function ensureReminderShape(reminder={}) {
  return {
    id: reminder.id || uid(),
    title: String(reminder.title || 'Nova tarefa'),
    details: String(reminder.details || ''),
    dueAt: reminder.dueAt || '',
    notifyOffsetMinutes: Math.max(0, Number(reminder.notifyOffsetMinutes ?? 15) || 0),
    type: String(reminder.type || 'task'),
    completed: !!reminder.completed,
    completedAt: reminder.completedAt || '',
    createdAt: reminder.createdAt || Date.now(),
    lastAlertAt: reminder.lastAlertAt || '',
  };
}
function getReminderSummary() {
  const now = Date.now();
  const reminders = (appData?.reminders || []).map(ensureReminderShape);
  const completed = reminders.filter(item => item.completed).length;
  const pending = reminders.length - completed;
  const overdue = reminders.filter(item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() < now).length;
  const upcoming = reminders.filter(item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() >= now).length;
  return { total:reminders.length, pending, completed, overdue, upcoming };
}
function getReminderDueLabel(reminder) {
  if (!reminder?.dueAt) return 'Sem data agendada';
  const due = new Date(reminder.dueAt);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  const absMinutes = Math.round(Math.abs(diff) / 60000);
  const human = due.toLocaleString('pt-BR');
  if (reminder.completed) return `Concluída em ${reminder.completedAt ? new Date(reminder.completedAt).toLocaleString('pt-BR') : human}`;
  if (diff < 0) return `Atrasada desde ${human}`;
  if (absMinutes < 60) return `Hoje às ${due.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  return human;
}
function reminderSortValue(reminder) {
  return reminder.dueAt ? new Date(reminder.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
}
function getVisibleReminders(filter='pending', limit=0) {
  const now = Date.now();
  let list = (appData?.reminders || []).map(ensureReminderShape);
  list.sort((a,b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return reminderSortValue(a) - reminderSortValue(b) || Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
  if (filter === 'pending') list = list.filter(item => !item.completed);
  if (filter === 'completed') list = list.filter(item => item.completed);
  if (filter === 'upcoming') list = list.filter(item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() >= now);
  if (filter === 'overdue') list = list.filter(item => !item.completed && item.dueAt && new Date(item.dueAt).getTime() < now);
  if (limit > 0) return list.slice(0, limit);
  return list;
}
function setReminderFilter(filter) {
  currentDetail.reminderFilter = filter;
  renderReminders();
}
function renderReminderCard(reminder) {
  const dueTs = reminder.dueAt ? new Date(reminder.dueAt).getTime() : 0;
  const nowTs = Date.now();
  const overdue = !reminder.completed && dueTs && dueTs < nowTs;
  const notifyLabel = reminder.dueAt ? `Aviso ${reminder.notifyOffsetMinutes} min antes` : 'Sem aviso ativo';
  return `
    <div class="reminder-card ${overdue ? 'overdue' : ''} ${reminder.completed ? 'done' : ''}" id="reminder-${reminder.id}">
      <div class="reminder-title-row">
        <div class="reminder-title-main">
          <input class="reminder-check" type="checkbox" ${reminder.completed ? 'checked' : ''} onchange="toggleReminderDone('${reminder.id}')">
          <div style="min-width:0">
            <div class="row-title">${esc(reminder.title)}</div>
            <div class="reminder-type">${reminder.type === 'reminder' ? 'Lembrete' : 'Tarefa'}</div>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn xs" onclick="openReminderModal('${reminder.id}')">Editar</button>
          <button class="btn xs danger" onclick="deleteReminder('${reminder.id}')">Excluir</button>
        </div>
      </div>
      <div class="reminder-due">${esc(getReminderDueLabel(reminder))}</div>
      <div class="reminder-meta-row">
        <span class="badge ${overdue ? '' : 'done'}">${overdue ? 'Atrasada' : reminder.completed ? 'Concluída' : 'Pendente'}</span>
        <span class="badge">${esc(notifyLabel)}</span>
      </div>
      ${reminder.details ? `<div class="reminder-note">${nl2br(reminder.details)}</div>` : ''}
    </div>`;
}
function renderReminderSuggestionCard() {
  const upcoming = getVisibleReminders('upcoming', 4);
  const overdue = getVisibleReminders('overdue', 4);
  return `
    <div class="panel">
      <div class="panel-title">Agenda rápida</div>
      <div class="row-text">Crie lembretes com data e hora, receba aviso no próprio site e, se permitir, também no navegador.</div>
      <div class="reminder-quick-list">
        ${upcoming.length ? upcoming.map(item => `<div class="reminder-quick-item"><strong>${esc(item.title)}</strong><div class="row-sub">${esc(getReminderDueLabel(item))}</div></div>`).join('') : '<div class="empty">Nenhum lembrete futuro agendado.</div>'}
      </div>
      ${overdue.length ? `<div class="panel-title" style="margin-top:14px">Atrasadas</div><div class="reminder-quick-list">${overdue.map(item => `<div class="reminder-quick-item"><strong>${esc(item.title)}</strong><div class="row-sub">${esc(getReminderDueLabel(item))}</div></div>`).join('')}</div>` : ''}
    </div>`;
}
function renderReminders() {
  const section = document.getElementById('section-reminders');
  if (!section) return;
  const filter = currentDetail.reminderFilter || 'pending';
  const summary = getReminderSummary();
  const reminders = getVisibleReminders(filter);
  const notificationState = 'Notification' in window ? Notification.permission : 'unsupported';
  section.innerHTML = `
    <div class="headline">
      <div><div class="title">Lembretes e tarefas</div><div class="subtitle">Agende por data e hora, receba aviso e marque cada item como concluído.</div></div>
      <div class="reminder-toolbar">
        <button class="btn" onclick="requestReminderPermission()">🔔 ${notificationState === 'granted' ? 'Avisos do navegador ativos' : 'Ativar avisos do navegador'}</button>
        <button class="btn primary" onclick="openReminderModal()">Nova tarefa</button>
      </div>
    </div>
    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="reminder-kpi-head"><div class="kpi-label">Pendentes</div><span>🗂</span></div><div class="kpi-value">${summary.pending}</div><div class="kpi-sub">a concluir</div></div>
      <div class="kpi"><div class="reminder-kpi-head"><div class="kpi-label">Próximas</div><span>⏳</span></div><div class="kpi-value">${summary.upcoming}</div><div class="kpi-sub">com horário futuro</div></div>
      <div class="kpi"><div class="reminder-kpi-head"><div class="kpi-label">Atrasadas</div><span>⚠</span></div><div class="kpi-value">${summary.overdue}</div><div class="kpi-sub">precisam atenção</div></div>
      <div class="kpi"><div class="reminder-kpi-head"><div class="kpi-label">Concluídas</div><span>✅</span></div><div class="kpi-value">${summary.completed}</div><div class="kpi-sub">já finalizadas</div></div>
    </div>
    <div class="reminder-tabs">
      ${[['pending','Pendentes'],['upcoming','Próximas'],['overdue','Atrasadas'],['completed','Concluídas'],['all','Todas']].map(([value,label]) => `<button class="reminder-tab ${filter===value ? 'active' : ''}" onclick="setReminderFilter('${value}')">${label}</button>`).join('')}
    </div>
    <div class="reminder-grid">
      <div class="stack">
        ${reminders.length ? reminders.map(renderReminderCard).join('') : '<div class="empty">Nenhum item nesta visualização.</div>'}
      </div>
      <div class="stack">
        ${renderReminderSuggestionCard()}
        <div class="panel">
          <div class="panel-title">Backup e restauração</div>
          <div class="row-text">Esses lembretes entram no mesmo backup JSON do site e também voltam ao importar um backup completo.</div>
        </div>
      </div>
    </div>
  `;
}
function openReminderModal(reminderId='') {
  const reminder = ensureReminderShape((appData.reminders || []).find(item => item.id === reminderId) || { type:'task', notifyOffsetMinutes:15 });
  openModal(reminderId ? 'Editar lembrete / tarefa' : 'Novo lembrete / tarefa', `
    <div class="row"><label class="lbl">Tipo</label><select id="reminder-type" class="select"><option value="task" ${reminder.type === 'task' ? 'selected' : ''}>Tarefa</option><option value="reminder" ${reminder.type === 'reminder' ? 'selected' : ''}>Lembrete</option></select></div>
    <div class="row"><label class="lbl">Título</label><input id="reminder-title" class="input" value="${esc(reminder.title)}" placeholder="Ex.: Revisar módulo COBOL"></div>
    <div class="row"><label class="lbl">Detalhes</label><textarea id="reminder-details" class="textarea" placeholder="Notas, contexto ou checklist">${esc(reminder.details)}</textarea></div>
    <div class="row"><label class="lbl">Data e hora</label><input id="reminder-due-at" class="input" type="datetime-local" value="${reminder.dueAt ? String(reminder.dueAt).slice(0,16) : ''}"></div>
    <div class="row"><label class="lbl">Aviso antecipado</label><select id="reminder-notify-offset" class="select">${[0,5,10,15,30,60,120].map(v => `<option value="${v}" ${Number(reminder.notifyOffsetMinutes) === v ? 'selected' : ''}>${v === 0 ? 'No horário' : `${v} minuto(s) antes`}</option>`).join('')}</select></div>
  `, `<button class="btn primary" onclick="saveReminderModal('${reminderId}')">Salvar</button>`);
}
function saveReminderModal(reminderId='') {
  const title = document.getElementById('reminder-title')?.value.trim() || '';
  if (!title) return showToast('Informe um título para a tarefa.');
  const payload = ensureReminderShape({
    id: reminderId || uid(),
    title,
    details: document.getElementById('reminder-details')?.value.trim() || '',
    dueAt: document.getElementById('reminder-due-at')?.value || '',
    notifyOffsetMinutes: Number(document.getElementById('reminder-notify-offset')?.value || 0),
    type: document.getElementById('reminder-type')?.value || 'task',
    completed: reminderId ? !!(appData.reminders || []).find(item => item.id === reminderId)?.completed : false,
    completedAt: reminderId ? ((appData.reminders || []).find(item => item.id === reminderId)?.completedAt || '') : '',
    createdAt: reminderId ? ((appData.reminders || []).find(item => item.id === reminderId)?.createdAt || Date.now()) : Date.now(),
    lastAlertAt: '',
  });
  const list = appData.reminders || (appData.reminders = []);
  const idx = list.findIndex(item => item.id === reminderId);
  if (idx >= 0) list[idx] = payload;
  else list.unshift(payload);
  saveUserData({ reason: reminderId ? 'Atualizou lembrete' : 'Criou lembrete' });
  closeModal();
  renderReminders();
  renderDashboard();
  updateStatus();
  showToast(reminderId ? 'Lembrete atualizado.' : 'Lembrete criado.');
  checkReminderAlerts(new Date());
}
function toggleReminderDone(reminderId) {
  const reminder = (appData.reminders || []).find(item => item.id === reminderId);
  if (!reminder) return;
  reminder.completed = !reminder.completed;
  reminder.completedAt = reminder.completed ? new Date().toISOString() : '';
  saveUserData({ reason:'Atualizou tarefa' });
  renderReminders();
  renderDashboard();
  updateStatus();
}
function deleteReminder(reminderId) {
  const reminder = (appData.reminders || []).find(item => item.id === reminderId);
  if (!reminder) return;
  if (!confirm(`Deseja mesmo excluir "${reminder.title}"?`)) return;
  appData.reminders = (appData.reminders || []).filter(item => item.id !== reminderId);
  saveUserData({ reason:'Removeu lembrete' });
  renderReminders();
  renderDashboard();
  updateStatus();
  showToast('Lembrete removido.');
}
function requestReminderPermission() {
  if (!('Notification' in window)) return showToast('Este navegador não suporta notificações.');
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') showToast('Notificações ativadas.');
    else showToast('Avisos do navegador não foram liberados.');
    renderReminders();
  });
}
function scheduleReminderRefresh() {
  setTimeout(() => checkReminderAlerts(new Date()), 50);
}
function checkReminderAlerts(now = new Date()) {
  if (!currentUser || !appData?.reminders?.length) return;
  let changed = false;
  (appData.reminders || []).forEach((raw, index) => {
    const reminder = ensureReminderShape(raw);
    appData.reminders[index] = reminder;
    if (reminder.completed || !reminder.dueAt || reminder.lastAlertAt) return;
    const triggerAt = new Date(reminder.dueAt).getTime() - (Number(reminder.notifyOffsetMinutes || 0) * 60000);
    if (Number.isNaN(triggerAt)) return;
    if (now.getTime() >= triggerAt) {
      const message = `${reminder.type === 'reminder' ? 'Lembrete' : 'Tarefa'}: ${reminder.title}`;
      showToast(message);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('MFHUB', { body: `${message} · ${getReminderDueLabel(reminder)}` });
        } catch (err) {
          console.warn('notification-error', err);
        }
      }
      reminder.lastAlertAt = now.toISOString();
      changed = true;
    }
  });
  if (changed) saveUserData({ skipRevision:true, skipSync:true });
}

function startClock() {
  if (window.__clockStarted) return;
  window.__clockStarted = true;
  const tick = () => {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleString('pt-BR');
    const minuteKey = now.toISOString().slice(0,16);
    if (window.__lastReminderMinute !== minuteKey) {
      window.__lastReminderMinute = minuteKey;
      checkReminderAlerts(now);
    }
  };
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
    tools: appData.tools.length,
    manuals: appData.manuals.length,
    reminders: appData.reminders.length,
    goals: Object.values(appData.dailyGoals || {}).reduce((a,list)=>a+(Array.isArray(list)?list.length:0),0),
  };
  document.getElementById('status-stats').textContent = `${totals.courses} cursos · ${totals.docs} docs · ${totals.code} códigos · ${totals.ex + totals.iv} exercícios · ${totals.linkedin} posts · ${totals.certs} badges · ${totals.tools} ferramentas · ${totals.manuals} manuais · ${totals.notes} notas · ${totals.reminders} lembretes · ${totals.goals} metas`;
}

function renderDashboard() {
  const courseAvg = appData.courses.length ? Math.round(appData.courses.reduce((a,c)=>a+courseProgress(c),0)/appData.courses.length) : 0;
  const todayKey = getTodayGoalKey();
  const todayGoals = getGoalDay(todayKey);
  const todaySummary = getGoalSummary(todayGoals);
  const reminderSummary = getReminderSummary();
  const nextReminder = getVisibleReminders('upcoming', 1)[0] || getVisibleReminders('overdue', 1)[0] || null;
  const kpiCards = [
    { icon:'📂', label:'Cursos', value:appData.courses.length, sub:'com módulos, submódulos e vídeos' },
    { icon:'📋', label:'Docs', value:appData.docs.length, sub:'editor + anexos' },
    { icon:'💻', label:'Exemplos', value:appData.codeSpaces.reduce((a,s)=>a+(s.subspaces?.length||0),0), sub:'subespaços de código' },
    { icon:'🧰', label:'Ferramentas', value:appData.tools.length, sub:'links + instruções' },
    { icon:'📚', label:'Manuais', value:appData.manuals.length, sub:'categorias com texto e anexos' },
    { icon:'⏰', label:'Lembretes', value:reminderSummary.pending, sub:`${reminderSummary.overdue} atrasado(s) · ${reminderSummary.upcoming} próximo(s)` },
    { icon:'🏅', label:'Certificados', value:appData.certificates.length, sub:'com imagem opcional' },
    { icon:'📈', label:'Progresso médio', value:`${courseAvg}%`, sub:'dos cursos' },
    { icon:'🔥', label:'Sequência', value:getStreakData().count, sub:`dias seguidos · recorde ${getStreakData().longest}`, warn:true }
  ];
  document.getElementById('section-dashboard').innerHTML = `
    <div class="headline">
      <div><div class="title">Dashboard</div><div class="subtitle">Visão geral, busca, terminal de login, cursos com vídeos e área de ferramentas</div></div>
      <div class="dashboard-toolbar">
        <button class="btn" onclick="toggleTheme()">🌓 Tema</button>
        <button class="btn" onclick="goSection('goals')">🎯 Metas</button>
      </div>
    </div>
    <div class="kpis">
      ${kpiCards.map(item => `<div class="kpi" ${item.warn ? 'style="border-color:var(--warn)"' : ''}><div class="kpi-head"><div class="kpi-label">${esc(item.label)}</div><div class="kpi-icon">${item.icon}</div></div><div class="kpi-value" ${item.warn ? 'style="color:var(--warn)"' : ''}>${esc(String(item.value))}</div><div class="kpi-sub">${esc(item.sub)}</div></div>`).join('')}
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
        <div class="panel-title">Lembretes e tarefas</div>
        ${nextReminder ? `<div class="row-text"><strong>Próximo:</strong> ${esc(nextReminder.title)}</div><div class="row-text">${esc(getReminderDueLabel(nextReminder))}</div>` : '<div class="row-text">Nenhum lembrete agendado ainda.</div>'}
        <div class="row-text">${reminderSummary.pending} pendente(s) · ${reminderSummary.completed} concluído(s) · ${reminderSummary.overdue} atrasado(s).</div>
        <div style="margin-top:12px"><button class="btn small" onclick="goSection('reminders')">Abrir lembretes e tarefas</button></div>
      </div>
    </div>
    <div class="grid">
      ${[
        ['🎯','Metas diárias','goals','Monte e marque tarefas por dia, com sugestões automáticas baseadas no conteúdo do site.'],
        ['⏰','Lembretes e tarefas','reminders','Agende tarefas com data e hora, receba aviso e marque como concluídas.'],
        ['📝','Anotações gerais','notes','Notas rápidas e organizadas para qualquer assunto.'],
        ['📂','Cursos','courses','Cursos com módulos, submódulos, vídeos, anexos e progresso recalculável.'],
        ['📋','Documentação','docs','Espaços com editor livre e até 5 anexos.'],
        ['💻','Exemplos de código','code','Espaços > subespaços > snippets, edição e anexos.'],
        ['⚙','Exercícios','exercises','Espaços > subespaços > exercícios com sua resposta e resposta modelo.'],
        ['💬','Entrevistas','interviews','Espaços > subespaços > perguntas de entrevista com resposta modelo.'],
        ['🔗','Postagem LinkedIn','linkedin','Rascunhos prontos para revisar e postar depois.'],
        ['🏅','Certificados e badges','certs','Conquistados e a conquistar, com imagem opcional.'],
        ['🧰','Ferramentas','tools','Catálogo de ferramentas com download, site oficial e instruções.'],
        ['📚','Manuais','manuals','Categorias com texto livre e até 5 anexos por manual.'],
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


function getSpaceIcon(kind, space) {
  return normalizeIcon(space?.icon, SPACE_ICON_DEFAULTS[kind] || '📁');
}
function getSubspaceIcon(kind, subspace) {
  return normalizeIcon(subspace?.icon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩');
}
function renderCode() {
  const wrap = document.getElementById('section-code');
  const space = appData.codeSpaces.find(s=>s.id===currentDetail.codeSpaceId);
  if (!space) {
    wrap.innerHTML = `
      <div class="headline"><div><div class="title">Exemplos de código</div><div class="subtitle">Espaços com dois níveis: espaço > subespaço > snippets</div></div><div style="display:flex;gap:10px"><button class="btn" onclick="openImportCenter('code')">Importar</button><button class="btn primary" onclick="openGenericSpaceModal('code')">Novo espaço</button></div></div>
      <div class="grid">
        ${appData.codeSpaces.map(s=>`<div class="card clickable" id="code-space-${s.id}" onclick="openCodeSpace('${s.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openGenericSpaceModal('code','${s.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteGenericSpace('code','${s.id}')">Excluir</button></div><div class="card-icon">${esc(getSpaceIcon('code', s))}</div><div class="card-title">${esc(s.name)}</div><div class="card-meta">${esc(s.desc||'Sem descrição')}<br>Subespaços: ${(s.subspaces||[]).length}</div></div>`).join('')}
        <div class="card new clickable" onclick="openGenericSpaceModal('code')"><div><div style="font-size:30px;text-align:center">+</div><div>Novo espaço</div></div></div>
      </div>`;
    return;
  }
  const sub = (space.subspaces||[]).find(ss=>ss.id===currentDetail.codeSubspaceId) || null;
  if (!sub) {
    wrap.innerHTML = `
      <div class="back" onclick="backToCodeList()">← Voltar</div>
      <div class="headline"><div id="code-space-view-${space.id}"><div class="title">${esc(space.name)}</div><div class="subtitle">${esc(space.desc||'Espaço de código')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="openGenericSpaceModal('code','${space.id}')">Editar espaço</button><button class="btn primary" onclick="openSubspaceModal('code','${space.id}')">Novo subespaço</button></div></div>
      <div class="grid">
        ${(space.subspaces||[]).map(ss=>`<div class="card clickable" id="code-subspace-${ss.id}" onclick="openCodeSubspace('${space.id}','${ss.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openSubspaceModal('code','${space.id}','${ss.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteSubspace('code','${space.id}','${ss.id}')">Excluir</button></div><div class="card-icon">${esc(getSubspaceIcon('code', ss))}</div><div class="card-title">${esc(ss.name)}</div><div class="card-meta">${esc(ss.desc||'Sem descrição')}<br>Snippets: ${(ss.snippets||[]).length} · Arquivos: ${(ss.attachments||[]).length}</div></div>`).join('')}
      </div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="back" onclick="backToCodeSpace()">← Voltar</div>
    <div class="headline"><div id="code-subspace-view-${sub.id}"><div class="title">${esc(sub.name)}</div><div class="subtitle">${esc(sub.desc||'Subespaço')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="openSubspaceModal('code','${space.id}','${sub.id}')">Editar subespaço</button><button class="btn" onclick="uploadAttachmentsModal('code-subspace','${space.id}','${sub.id}')">Arquivos</button><button class="btn primary" onclick="openSnippetModal('${space.id}','${sub.id}')">Novo snippet</button></div></div>
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
  const itemPlural = kind === 'exercise' ? 'Exercícios' : 'Perguntas';
  const itemSingular = kind === 'exercise' ? 'Exercício' : 'Pergunta';
  const spaces = kind === 'exercise' ? appData.exerciseSpaces : appData.interviewSpaces;
  const spaceIdKey = kind === 'exercise' ? 'exerciseSpaceId' : 'interviewSpaceId';
  const subIdKey = kind === 'exercise' ? 'exerciseSubspaceId' : 'interviewSubspaceId';
  const space = spaces.find(s=>s.id===currentDetail[spaceIdKey]);
  const wrap = document.getElementById(sectionId);
  if (!space) {
    wrap.innerHTML = `
      <div class="headline"><div><div class="title">${title}</div><div class="subtitle">Espaços com dois níveis: espaço > subespaço > ${itemPlural.toLowerCase()}</div></div><div style="display:flex;gap:10px"><button class="btn" onclick="openImportCenter('${kind}')">Importar</button><button class="btn primary" onclick="openGenericSpaceModal('${kind}')">Novo espaço</button></div></div>
      <div class="grid">
        ${spaces.map(s=>`<div class="card clickable" id="${kind}-space-${s.id}" onclick="openPracticeSpace('${kind}','${s.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openGenericSpaceModal('${kind}','${s.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteGenericSpace('${kind}','${s.id}')">Excluir</button></div><div class="card-icon">${esc(getSpaceIcon(kind, s))}</div><div class="card-title">${esc(s.name)}</div><div class="card-meta">${esc(s.desc||'Sem descrição')}<br>Subespaços: ${(s.subspaces||[]).length}</div></div>`).join('')}
        <div class="card new clickable" onclick="openGenericSpaceModal('${kind}')"><div><div style="font-size:30px;text-align:center">+</div><div>Novo espaço</div></div></div>
      </div>`;
    return;
  }
  const sub = (space.subspaces||[]).find(ss=>ss.id===currentDetail[subIdKey]) || null;
  if (!sub) {
    wrap.innerHTML = `
      <div class="back" onclick="backToPracticeList('${kind}')">← Voltar</div>
      <div class="headline"><div id="${kind}-space-view-${space.id}"><div class="title">${esc(space.name)}</div><div class="subtitle">${esc(space.desc||'Espaço')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="openGenericSpaceModal('${kind}','${space.id}')">Editar espaço</button><button class="btn primary" onclick="openSubspaceModal('${kind}','${space.id}')">Novo subespaço</button></div></div>
      <div class="grid">
        ${(space.subspaces||[]).map(ss=>`<div class="card clickable" id="${kind}-subspace-${ss.id}" onclick="openPracticeSubspace('${kind}','${space.id}','${ss.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openSubspaceModal('${kind}','${space.id}','${ss.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteSubspace('${kind}','${space.id}','${ss.id}')">Excluir</button></div><div class="card-icon">${esc(getSubspaceIcon(kind, ss))}</div><div class="card-title">${esc(ss.name)}</div><div class="card-meta">${esc(ss.desc||'Sem descrição')}<br>${itemPlural}: ${(ss.items||[]).length} · Arquivos: ${(ss.attachments||[]).length}</div></div>`).join('')}
      </div>`;
    return;
  }
  const allItems = sub.items || [];
  const filteredItems = getFilteredPracticeItems(kind, allItems);
  const answeredCount = allItems.filter(isPracticeAnswered).length;
  wrap.innerHTML = `
    <div class="back" onclick="backToPracticeSpace('${kind}')">← Voltar</div>
    <div class="headline"><div id="${kind}-subspace-view-${sub.id}"><div class="title">${esc(sub.name)}</div><div class="subtitle">${esc(sub.desc||'Subespaço')}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="openSubspaceModal('${kind}','${space.id}','${sub.id}')">Editar subespaço</button><button class="btn" onclick="uploadAttachmentsModal('${kind}-subspace','${space.id}','${sub.id}')">Arquivos</button><button class="btn primary" onclick="openPracticeItemModal('${kind}','${space.id}','${sub.id}')">Novo ${itemSingular.toLowerCase()}</button></div></div>
    <div class="practice-toolbar">
      ${kind==='exercise' ? `<button class="btn xs" onclick="togglePracticeIndex('exercise')">${currentDetail.exerciseIndexOpen ? 'Ocultar índice' : 'Mostrar índice'}</button>` : ''}
      ${kind==='exercise' ? `<select class="select" onchange="setPracticeFilter('exercise', this.value)">${practiceFilterOptions(kind).map(([value,label])=>`<option value="${value}" ${getPracticeFilter(kind)===value?'selected':''}>${label}</option>`).join('')}</select>` : ''}
      <span class="goal-pill">Respondidos: ${answeredCount}/${allItems.length}</span>
      ${kind==='exercise' ? `<span class="goal-pill">Exibindo: ${filteredItems.length}</span>` : ''}
    </div>
    ${(kind!=='exercise' || currentDetail.exerciseIndexOpen) ? `<div class="practice-index">${allItems.map((item, idx)=>`<button class="practice-index-item ${isPracticeAnswered(item)?'done':''}" onclick="scrollPracticeItem('${kind}','${item.id}')">${idx+1}. ${esc(item.title)}</button>`).join('')}</div>` : ''}
    <div class="cols-2">
      <div class="stack">
        ${filteredItems.length ? filteredItems.map(item=>renderPracticeItem(kind, space.id, sub.id, item)).join('') : `<div class="empty">Nenhum ${itemSingular.toLowerCase()} encontrado para este filtro.</div>`}
      </div>
      <div class="panel"><div class="panel-title">Arquivos do subespaço (até 5)</div>${renderAttachments(sub.attachments||[], `${kind}-subspace`, space.id, sub.id)}</div>
    </div>`;
}
function renderPracticeItem(kind, spaceId, subId, item) {
  const answered = isPracticeAnswered(item);
  const itemWord = kind === 'exercise' ? 'Exercício' : 'Pergunta';
  return `
  <div class="panel ${item.minimized ? 'minimized' : ''}" id="${kind}-item-${item.id}">
    <div class="row-top">
      <div><div class="row-title">${esc(item.title)}</div><div class="row-sub">${itemWord} · ${fmtDate(item.createdAt)} · ${answered ? 'respondido' : 'não respondido'}</div></div>
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
          <textarea class="textarea" placeholder="Sem resposta modelo cadastrada." oninput="updatePracticeModelAnswer('${kind}','${spaceId}','${subId}','${item.id}', this.value)">${esc(item.modelAnswer||'')}</textarea>
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
  const itemWord = kind === 'exercise' ? 'Novo exercício' : 'Nova pergunta';
  openModal(itemWord, `<div class="row"><label class="lbl">Título</label><input id="it-title" class="input"></div><div class="row"><label class="lbl">Enunciado / pergunta</label><textarea id="it-prompt" class="textarea"></textarea></div><div class="row"><label class="lbl">Resposta modelo</label><textarea id="it-model" class="textarea" placeholder="Opcional"></textarea></div>`, `<button class="btn primary" onclick="savePracticeItem('${kind}','${spaceId}','${subId}')">Salvar</button>`);
}
function savePracticeItem(kind, spaceId, subId) {
  const sub = getPracticeSubspace(kind, spaceId, subId); if(!sub) return;
  const title=document.getElementById('it-title').value.trim(); const prompt=document.getElementById('it-prompt').value.trim(); const model=document.getElementById('it-model').value.trim();
  if(!title || !prompt) return;
  sub.items.push({ id:uid(), title, prompt, userAnswer:'', modelAnswer:model, createdAt:Date.now(), showModel:false });
  saveUserData(); closeModal(); renderPractice(kind); updateStatus(); showToast(kind === 'exercise' ? 'Exercício salvo.' : 'Pergunta salva.');
}
function getPracticeSubspace(kind, spaceId, subId) {
  const list = kind === 'exercise' ? appData.exerciseSpaces : appData.interviewSpaces;
  return list.find(s=>s.id===spaceId)?.subspaces?.find(ss=>ss.id===subId);
}
function deletePracticeItem(kind, spaceId, subId, itemId) {
  const sub = getPracticeSubspace(kind, spaceId, subId); if(!sub)return;
  const name = sub.items?.find(i=>i.id===itemId)?.title || 'este item';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  sub.items = (sub.items||[]).filter(i=>i.id!==itemId); saveUserData(); renderPractice(kind); showToast(kind === 'exercise' ? 'Exercício removido.' : 'Pergunta removida.');
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

function openGenericSpaceModal(kind, spaceId='') {
  const list = getSpaceList(kind);
  const space = spaceId ? list.find(item => item.id === spaceId) : null;
  const label = space ? `Editar espaço de ${getKindLabel(kind)}` : kind === 'code' ? 'Novo espaço de código' : kind === 'exercise' ? 'Novo espaço de exercícios' : 'Novo espaço de entrevistas';
  openModal(label, `
    <div class="row"><label class="lbl">Nome</label><input id="gs-name" class="input" value="${esc(space?.name || '')}"></div>
    <div class="row"><label class="lbl">Descrição</label><input id="gs-desc" class="input" value="${esc(space?.desc || '')}"></div>
    <div class="row"><label class="lbl">Ícone</label><input id="gs-icon" class="input" value="${esc(space?.icon || SPACE_ICON_DEFAULTS[kind] || '📁')}" placeholder="Ex.: ⚙️"></div>
  `, `<button class="btn primary" onclick="saveGenericSpace('${kind}','${spaceId}')">Salvar</button>`);
}
function getSpaceList(kind) {
  if (kind === 'code') return appData.codeSpaces;
  if (kind === 'exercise') return appData.exerciseSpaces;
  return appData.interviewSpaces;
}
function saveGenericSpace(kind, spaceId='') {
  const list = getSpaceList(kind);
  const name=document.getElementById('gs-name').value.trim();
  const desc=document.getElementById('gs-desc').value.trim();
  const icon=normalizeIcon(document.getElementById('gs-icon').value, SPACE_ICON_DEFAULTS[kind] || '📁');
  if(!name)return;
  if (spaceId) {
    const space = list.find(item => item.id === spaceId); if (!space) return;
    Object.assign(space, { name, desc, icon });
    ensureSpaceShape(kind, space);
  } else {
    list.push({ id:uid(), name, desc, icon, attachments:[], subspaces:[], createdAt:Date.now() });
  }
  saveUserData(); closeModal(); renderAll(); showToast(spaceId ? 'Espaço atualizado.' : 'Espaço criado.');
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
function openSubspaceModal(kind, spaceId, subId='') {
  const spaces = getSpaceList(kind);
  const sourceSpace = spaces.find(s=>s.id===spaceId); if(!sourceSpace)return;
  const sub = subId ? (sourceSpace.subspaces||[]).find(item => item.id === subId) : null;
  const title = sub ? 'Editar subespaço' : 'Novo subespaço';
  openModal(title, `
    <div class="row"><label class="lbl">Nome</label><input id="sub-name" class="input" value="${esc(sub?.name || '')}"></div>
    <div class="row"><label class="lbl">Descrição</label><input id="sub-desc" class="input" value="${esc(sub?.desc || '')}"></div>
    <div class="row"><label class="lbl">Ícone</label><input id="sub-icon" class="input" value="${esc(sub?.icon || SUBSPACE_ICON_DEFAULTS[kind] || '🧩')}" placeholder="Ex.: 🧩"></div>
    <div class="row"><label class="lbl">Mover para o espaço</label><select id="sub-target-space" class="select">${spaces.map(item => `<option value="${item.id}" ${(item.id===spaceId)?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div>
  `, `<button class="btn primary" onclick="saveSubspace('${kind}','${spaceId}','${subId}')">Salvar</button>`);
}
function saveSubspace(kind, spaceId, subId='') {
  const spaces = getSpaceList(kind);
  const sourceSpace = spaces.find(s=>s.id===spaceId); if(!sourceSpace)return;
  const targetSpaceId = document.getElementById('sub-target-space').value || spaceId;
  const targetSpace = spaces.find(s=>s.id===targetSpaceId) || sourceSpace;
  const name=document.getElementById('sub-name').value.trim();
  const desc=document.getElementById('sub-desc').value.trim();
  const icon=normalizeIcon(document.getElementById('sub-icon').value, SUBSPACE_ICON_DEFAULTS[kind] || '🧩');
  if(!name)return;
  if (subId) {
    const idx = (sourceSpace.subspaces||[]).findIndex(ss=>ss.id===subId); if(idx<0)return;
    const existing = sourceSpace.subspaces[idx];
    existing.name = name;
    existing.desc = desc;
    existing.icon = icon;
    if (targetSpace.id !== sourceSpace.id) {
      sourceSpace.subspaces.splice(idx, 1);
      targetSpace.subspaces ||= [];
      targetSpace.subspaces.push(existing);
    }
    if (kind==='code') {
      currentDetail.codeSpaceId = targetSpace.id;
      currentDetail.codeSubspaceId = existing.id;
    } else if (kind==='exercise') {
      currentDetail.exerciseSpaceId = targetSpace.id;
      currentDetail.exerciseSubspaceId = existing.id;
    } else {
      currentDetail.interviewSpaceId = targetSpace.id;
      currentDetail.interviewSubspaceId = existing.id;
    }
    saveUserData(); closeModal();
    if (kind==='code') renderCode(); else renderPractice(kind);
    updateStatus(); showToast(targetSpace.id !== sourceSpace.id ? 'Subespaço movido.' : 'Subespaço atualizado.');
    return;
  }
  const payload = kind==='code'
    ? { id:uid(), name, desc, icon, attachments:[], snippets:[], createdAt:Date.now() }
    : { id:uid(), name, desc, icon, attachments:[], items:[], createdAt:Date.now() };
  targetSpace.subspaces ||= []; targetSpace.subspaces.push(payload);
  saveUserData(); closeModal();
  if (kind==='code') {
    currentDetail.codeSpaceId = targetSpace.id;
    currentDetail.codeSubspaceId = payload.id;
    renderCode();
  } else {
    if (kind==='exercise') {
      currentDetail.exerciseSpaceId = targetSpace.id;
      currentDetail.exerciseSubspaceId = payload.id;
    } else {
      currentDetail.interviewSpaceId = targetSpace.id;
      currentDetail.interviewSubspaceId = payload.id;
    }
    renderPractice(kind);
  }
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
  wrap.innerHTML = `
    <div class="headline">
      <div><div class="title">Anotações gerais</div><div class="subtitle">Notas livres para estudos, ideias, lembretes e planos</div></div>
      <button class="btn primary" onclick="openGeneralNoteModal()">Nova anotação</button>
    </div>
    <div class="stack">
      ${appData.generalNotes.length ? appData.generalNotes.map(note => `
        <div class="panel" id="general-note-${note.id}">
          <div class="row-top">
            <div><div class="row-title">${esc(note.title)}</div><div class="row-sub">${fmtDate(note.updatedAt || note.createdAt)}</div></div>
            <div class="row-actions">
              <button class="btn xs" onclick="openGeneralNoteModal('${note.id}')">Editar</button>
              <button class="btn xs danger" onclick="deleteGeneralNote('${note.id}')">Excluir</button>
            </div>
          </div>
          <div class="row-text">${nl2br(note.content || '')}</div>
        </div>
      `).join('') : '<div class="empty">Nenhuma anotação geral cadastrada.</div>'}
    </div>
  `;
}
function openGeneralNoteModal(noteId='') {
  const note = noteId ? appData.generalNotes.find(n => n.id === noteId) : null;
  openModal(note ? 'Editar anotação' : 'Nova anotação geral', `
    <div class="row"><label class="lbl">Título</label><input id="gn-title" class="input" value="${esc(note?.title || '')}"></div>
    <div class="row"><label class="lbl">Conteúdo</label><textarea id="gn-content" class="textarea" style="min-height:260px">${esc(note?.content || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveGeneralNote('${noteId}')">Salvar</button>`);
}
function saveGeneralNote(noteId='') {
  const title = document.getElementById('gn-title').value.trim();
  const content = document.getElementById('gn-content').value;
  if (!title) return;
  if (noteId) {
    const note = appData.generalNotes.find(n => n.id === noteId); if (!note) return;
    note.title = title; note.content = content; note.updatedAt = Date.now();
  } else {
    appData.generalNotes.unshift({ id:uid(), title, content, createdAt:Date.now(), updatedAt:Date.now() });
  }
  saveUserData(); closeModal(); renderNotes(); updateStatus(); showToast(noteId ? 'Anotação atualizada.' : 'Anotação criada.');
}
function deleteGeneralNote(noteId) {
  const name = appData.generalNotes.find(n => n.id === noteId)?.title || 'esta anotação';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.generalNotes = appData.generalNotes.filter(n => n.id !== noteId);
  saveUserData(); renderNotes(); updateStatus(); showToast('Anotação removida.');
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


function renderManuals() {
  const wrap = document.getElementById('section-manuals');
  const manual = appData.manuals.find(m => m.id === currentDetail.manualId);
  if (!manual) {
    wrap.innerHTML = `
      <div class="headline">
        <div><div class="title">Manuais</div><div class="subtitle">Crie categorias de manuais com texto livre e até 5 anexos</div></div>
        <button class="btn primary" onclick="openManualModal()">Nova categoria</button>
      </div>
      <div class="manual-grid">
        ${appData.manuals.map(m => `<div class="card clickable" id="manual-card-${m.id}" onclick="openManual('${m.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openManualModal('${m.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteManual('${m.id}')">Excluir</button></div><div class="card-icon">📚</div><div class="card-title">${esc(m.name)}</div><div class="manual-card-meta">${esc(m.desc||'Sem descrição')}<br>${(m.attachments||[]).length} anexos</div></div>`).join('')}
        <div class="card new clickable" onclick="openManualModal()"><div><div style="font-size:30px;text-align:center">+</div><div>Nova categoria</div></div></div>
      </div>
    `;
    return;
  }
  wrap.innerHTML = `
    <div class="back" onclick="backToManualList()">← Voltar</div>
    <div class="headline">
      <div><div class="title">${esc(manual.name)}</div><div class="subtitle">${esc(manual.desc||'Manual')}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="uploadAttachmentsModal('manual','${manual.id}')">Arquivos</button>
        <button class="btn" onclick="openManualModal('${manual.id}')">Editar categoria</button>
        <button class="btn primary" onclick="saveManualContent('${manual.id}')">Salvar</button>
      </div>
    </div>
    <div class="cols-2">
      <div class="panel">
        <div class="panel-title">Texto do manual</div>
        <textarea id="manual-editor" class="textarea" style="min-height:440px">${esc(manual.content||'')}</textarea>
      </div>
      <div class="panel">
        <div class="panel-title">Arquivos (até 5)</div>
        ${renderAttachments(manual.attachments||[], 'manual', manual.id)}
      </div>
    </div>
  `;
}
function openManualModal(manualId='') {
  const manual = manualId ? appData.manuals.find(m => m.id === manualId) : null;
  openModal(manual ? 'Editar categoria de manual' : 'Nova categoria de manual', `<div class="row"><label class="lbl">Nome da categoria</label><input id="manual-name" class="input" value="${esc(manual?.name || '')}"></div><div class="row"><label class="lbl">Descrição</label><input id="manual-desc" class="input" value="${esc(manual?.desc || '')}"></div>`, `<button class="btn primary" onclick="saveManual('${manualId}')">Salvar</button>`);
}
function saveManual(manualId='') {
  const name = document.getElementById('manual-name').value.trim();
  const desc = document.getElementById('manual-desc').value.trim();
  if (!name) return;
  if (manualId) {
    const manual = appData.manuals.find(m => m.id === manualId); if (!manual) return;
    manual.name = name; manual.desc = desc;
  } else {
    appData.manuals.push({ id:uid(), name, desc, content:'', attachments:[], createdAt:Date.now() });
  }
  saveUserData(); closeModal(); renderManuals(); renderDashboard(); updateStatus(); showToast(manualId ? 'Categoria atualizada.' : 'Categoria criada.');
}
function openManual(id) { currentDetail.manualId = id; renderManuals(); }
function backToManualList() { currentDetail.manualId = null; renderManuals(); }
function deleteManual(id) {
  const name = appData.manuals.find(m => m.id === id)?.name || 'esta categoria';
  if (!confirm(`Deseja mesmo excluir "${name}"?`)) return;
  appData.manuals = appData.manuals.filter(m => m.id !== id);
  currentDetail.manualId = null;
  saveUserData(); renderManuals(); renderDashboard(); updateStatus(); showToast('Categoria removida.');
}
function saveManualContent(id) {
  const manual = appData.manuals.find(m => m.id === id); if (!manual) return;
  manual.content = document.getElementById('manual-editor').value;
  saveUserData(); showToast('Manual salvo.');
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
  if (type==='manual') return appData.manuals.find(m=>m.id===id1);
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
  } else if (t.section === 'reminders') {
    goSection('reminders');
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
  (appData.reminders || []).forEach(reminder => {
    if ((reminder.title + ' ' + (reminder.details || '') + ' ' + (reminder.dueAt || '')).toLowerCase().includes(q)) {
      results.push({ area:'Lembretes e tarefas', title:reminder.title, text:[getReminderDueLabel(ensureReminderShape(reminder)), reminder.details].filter(Boolean).join(' · ').slice(0,220), target:{ section:'reminders', focusId:`reminder-${reminder.id}` } });
    }
  });
  appData.linkedinPosts.forEach(post => {
    if ((post.title+' '+post.content+' '+(post.status||'')).toLowerCase().includes(q)) results.push({ area:'Postagem LinkedIn', title:post.title||'Post sem título', text:post.content.slice(0,220), target:{ section:'linkedin', focusId:`linkedin-post-${post.id}` } });
  });
  appData.certificates.forEach(cert => {
    if ((cert.name+' '+(cert.issuer||'')+' '+(cert.notes||'')+' '+(cert.status||'')).toLowerCase().includes(q)) results.push({ area:'Certificados e badges', title:cert.name, text:[cert.issuer, cert.status, cert.notes].filter(Boolean).join(' · ').slice(0,220), target:{ section:'certs', focusId:`cert-${cert.id}` } });
  });
  appData.generalNotes.forEach(note => {
    if ((note.title+' '+note.content).toLowerCase().includes(q)) results.push({ area:'Anotações gerais', title:note.title, text:note.content.slice(0,220), target:{ section:'notes', focusId:`general-note-${note.id}` } });
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
  openModal(preset==='backup' ? 'Importar backup do site' : 'Importar conteúdo', `
    <div class="row"><label class="lbl">Tipo padrão</label>
      <select id="imp-type" class="select">
        <option value="code" ${(preset==='code' || preset==='backup')?'selected':''}>Exemplos de código</option>
        <option value="exercise" ${preset==='exercise'?'selected':''}>Exercícios</option>
        <option value="interview" ${preset==='interview'?'selected':''}>Perguntas de entrevista</option>
      </select>
    </div>
    <div class="row"><label class="lbl">Arquivo (.json, .csv, .txt)</label><input id="imp-file" class="input" type="file" accept=".json,.csv,.txt"></div>
    <div class="panel" style="margin-top:8px">
      <div class="panel-title">Backup completo do site</div>
      <div class="row-text">Você pode importar um backup exportado pelo botão "Exportar backup". O sistema detecta automaticamente o arquivo <code>mfhub.v4</code> e mescla o conteúdo com o que já existe.</div>
    </div>
    <div class="panel" style="margin-top:8px">
      <div class="panel-title">Modelo de importação</div>
      <div class="row-text">O app aceita campos em português e em inglês.</div>
      <div class="row-text">Código: tipo / kind, espaco / space, subespaco / subspace, iconeEspaco / spaceIcon, iconeSubespaco / subspaceIcon, titulo / title, linguagem / lang, descricao / description, codigo / code</div>
      <div class="row-text">Exercícios / entrevistas: tipo / kind, espaco / space, subespaco / subspace, iconeEspaco / spaceIcon, iconeSubespaco / subspaceIcon, titulo / title, pergunta / prompt, respostaModelo / modelAnswer</div>
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="panel-title">Exemplo JSON</div>
      <div class="row-text">[{"tipo":"exercicio","espaco":"COBOL","subespaco":"Básico","iconeEspaco":"⚙️","iconeSubespaco":"📘","titulo":"Exercício 1","pergunta":"Enunciado","respostaModelo":"Resposta modelo"}]</div>
      <div class="row-text">[{"tipo":"codigo","espaco":"COBOL","subespaco":"Base","iconeEspaco":"💻","iconeSubespaco":"🧩","titulo":"Loop","linguagem":"COBOL","descricao":"Exemplo","codigo":"DISPLAY 'OI'."}]</div>
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
function normalizeImportHeaderKey(key) {
  return String(key || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function getImportValue(obj, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeImportHeaderKey(alias);
    for (const [key, value] of Object.entries(obj || {})) {
      if (normalizeImportHeaderKey(key) === normalizedAlias) return value;
    }
  }
  return '';
}
function normalizeImportKind(rawKind, fallback='exercise') {
  const raw = String(rawKind || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return fallback;
  if (['code','codigo','codigos','exemplodecodigo','exemplosdecodigo'].includes(raw)) return 'code';
  if (['exercise','exercicio','exercicios'].includes(raw)) return 'exercise';
  if (['interview','entrevista','entrevistas','perguntadeentrevista','perguntasdeentrevista'].includes(raw)) return 'interview';
  return fallback;
}
function normalizeImportedRow(raw, fallbackType='exercise') {
  const kind = normalizeImportKind(getImportValue(raw, ['tipo','kind','categoria']), fallbackType);
  if (kind === 'code') {
    return {
      kind,
      space: String(getImportValue(raw, ['espaco','space','area']) || 'Importado').trim() || 'Importado',
      subspace: String(getImportValue(raw, ['subespaco','subspace','nivel','level']) || 'Base').trim() || 'Base',
      spaceIcon: String(getImportValue(raw, ['iconeEspaco','spaceIcon']) || '').trim(),
      subspaceIcon: String(getImportValue(raw, ['iconeSubespaco','subspaceIcon']) || '').trim(),
      title: String(getImportValue(raw, ['titulo','title']) || 'Snippet').trim() || 'Snippet',
      lang: String(getImportValue(raw, ['linguagem','lang']) || '').trim(),
      description: String(getImportValue(raw, ['descricao','description']) || '').trim(),
      code: String(getImportValue(raw, ['codigo','code']) || '')
    };
  }
  return {
    kind,
    space: String(getImportValue(raw, ['espaco','space','area']) || 'Importado').trim() || 'Importado',
    subspace: String(getImportValue(raw, ['subespaco','subspace','nivel','level']) || 'Base').trim() || 'Base',
    spaceIcon: String(getImportValue(raw, ['iconeEspaco','spaceIcon']) || '').trim(),
    subspaceIcon: String(getImportValue(raw, ['iconeSubespaco','subspaceIcon']) || '').trim(),
    title: String(getImportValue(raw, ['titulo','title']) || (kind === 'exercise' ? 'Exercício' : 'Pergunta')).trim() || (kind === 'exercise' ? 'Exercício' : 'Pergunta'),
    prompt: String(getImportValue(raw, ['pergunta','prompt','enunciado','question']) || ''),
    modelAnswer: String(getImportValue(raw, ['respostaModelo','modelAnswer','answer','resposta']) || '')
  };
}
function ensureImportedSpace(kind, spaceName, subspaceName='Base', options={}) {
  const list = getSpaceList(kind);
  const normalizedSpace = String(spaceName || 'Importado').trim() || 'Importado';
  const normalizedSubspace = String(subspaceName || 'Base').trim() || 'Base';
  let space = list.find(s => String(s.name || '').trim().toLowerCase() === normalizedSpace.toLowerCase());
  if (!space) {
    space = { id:uid(), name:normalizedSpace, desc:String(options.spaceDesc || 'Importado'), icon:normalizeIcon(options.spaceIcon, SPACE_ICON_DEFAULTS[kind] || '📁'), attachments:[], subspaces:[], createdAt:Date.now() };
    list.push(space);
  } else {
    ensureSpaceShape(kind, space);
    if (options.spaceIcon) space.icon = normalizeIcon(options.spaceIcon, getSpaceIcon(kind, space));
    if (options.spaceDesc && !String(space.desc || '').trim()) space.desc = String(options.spaceDesc);
  }
  let sub = (space.subspaces||[]).find(ss => String(ss.name || '').trim().toLowerCase() === normalizedSubspace.toLowerCase());
  if (!sub) {
    sub = kind==='code'
      ? { id:uid(), name:normalizedSubspace, desc:String(options.subspaceDesc || 'Importado'), icon:normalizeIcon(options.subspaceIcon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩'), attachments:[], snippets:[], createdAt:Date.now() }
      : { id:uid(), name:normalizedSubspace, desc:String(options.subspaceDesc || 'Importado'), icon:normalizeIcon(options.subspaceIcon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩'), attachments:[], items:[], createdAt:Date.now() };
    space.subspaces.push(sub);
  } else {
    if (options.subspaceIcon) sub.icon = normalizeIcon(options.subspaceIcon, getSubspaceIcon(kind, sub));
    if (options.subspaceDesc && !String(sub.desc || '').trim()) sub.desc = String(options.subspaceDesc);
  }
  return sub;
}
function importContent() {
  const file = document.getElementById('imp-file').files[0];
  const selectedType = document.getElementById('imp-type').value;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rawText = String(e.target.result || '');
    const text = rawText.replace(/^\ufeff/, '');
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (parsed && parsed.version === 'mfhub.v4' && parsed.data) {
          const src = parsed.data;
          let merged = 0;
          const mergeList = (srcList, destList, itemsKey, kind) => {
            (srcList || []).forEach(srcSpace => {
              ensureSpaceShape(kind, srcSpace);
              let destSpace = destList.find(s => s.name === srcSpace.name);
              if (!destSpace) {
                destSpace = { ...srcSpace, id: uid(), icon: normalizeIcon(srcSpace.icon, SPACE_ICON_DEFAULTS[kind] || '📁'), subspaces: [] };
                destList.push(destSpace);
              }
              (srcSpace.subspaces || []).forEach(srcSub => {
                let destSub = destSpace.subspaces.find(ss => ss.name === srcSub.name);
                if (!destSub) {
                  destSub = { ...srcSub, id: uid(), icon: normalizeIcon(srcSub.icon, SUBSPACE_ICON_DEFAULTS[kind] || '🧩'), [itemsKey]: [] };
                  destSpace.subspaces.push(destSub);
                }
                const existingTitles = new Set((destSub[itemsKey] || []).map(i => i.title));
                (srcSub[itemsKey] || []).forEach(item => {
                  if (!existingTitles.has(item.title)) {
                    const payload = { ...item, id: uid() };
                    if (itemsKey === 'items') payload.modelAnswer = String(item?.modelAnswer || item?.answer || '');
                    destSub[itemsKey].push(payload);
                    merged++;
                  }
                });
              });
            });
          };
          mergeList(src.exerciseSpaces, appData.exerciseSpaces, 'items', 'exercise');
          mergeList(src.interviewSpaces, appData.interviewSpaces, 'items', 'interview');
          mergeList(src.codeSpaces, appData.codeSpaces, 'snippets', 'code');
          const mergeSimple = (key) => {
            const existing = new Set((appData[key]||[]).map(x=>x.name||x.title||x.id));
            (src[key]||[]).forEach(x => {
              if (!existing.has(x.name||x.title||x.id)) {
                appData[key].push({ ...x, id: uid() });
                merged++;
              }
            });
          };
          ['courses','docs','generalNotes','linkedinPosts','certificates','tools','manuals','reminders'].forEach(mergeSimple);
          if ((!appData.profile?.photoData) && src.profile?.photoData) appData.profile = { ...src.profile };
          ensureDefaults();
          saveUserData(); closeModal(); renderAll();
          showToast(`Backup mesclado: ${merged} item(ns) novo(s) adicionado(s).`);
          return;
        }
        if (!Array.isArray(parsed)) throw new Error('JSON inválido');
        let count = 0;
        parsed.forEach(raw => {
          const obj = normalizeImportedRow(raw, selectedType);
          if (obj.kind === 'code') {
            const sub = ensureImportedSpace('code', obj.space, obj.subspace, { spaceIcon: obj.spaceIcon, subspaceIcon: obj.subspaceIcon });
            const titles = new Set((sub.snippets||[]).map(s=>String(s.title || '').trim().toLowerCase()));
            if (!titles.has(String(obj.title || 'Snippet').trim().toLowerCase())) {
              sub.snippets.push({ id:uid(), title:obj.title, lang:obj.lang||'', description:obj.description||'', code:obj.code||'', createdAt:Date.now() });
              count++;
            }
          } else {
            const sub = ensureImportedSpace(obj.kind, obj.space, obj.subspace, { spaceIcon: obj.spaceIcon, subspaceIcon: obj.subspaceIcon });
            const titles = new Set((sub.items||[]).map(i=>String(i.title || '').trim().toLowerCase()));
            if (!titles.has(String(obj.title).trim().toLowerCase())) {
              sub.items.push({ id:uid(), title:obj.title, prompt:obj.prompt||'', userAnswer:'', modelAnswer:obj.modelAnswer||'', createdAt:Date.now(), showModel:false });
              count++;
            }
          }
        });
        ensureDefaults();
        saveUserData(); closeModal(); renderAll();
        showToast(count > 0 ? `Importação concluída: ${count} item(ns) novo(s).` : 'Nenhum item novo — todos já existiam.');
        return;
      }
      let rows = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const prs = simpleCsvParse(text);
        const head = (prs.shift() || []).map(h=>String(h).trim());
        rows = prs.map(r => Object.fromEntries(head.map((h,i)=>[h, r[i] ?? ''])));
      } else {
        rows = text.split(/\n\s*\n/).map(block => {
          const lines = block.trim().split(/\n/);
          return { tipo: selectedType, espaco:lines[0]||'Importado', subespaco:lines[1]||'Base', titulo:lines[2]||'Item importado', pergunta:lines.slice(3).join('\n'), respostaModelo:'' };
        }).filter(item => item.titulo || item.pergunta);
      }
      let count = 0;
      rows.forEach(raw => {
        const obj = normalizeImportedRow(raw, selectedType);
        if (obj.kind === 'code') {
          const sub = ensureImportedSpace('code', obj.space, obj.subspace, { spaceIcon: obj.spaceIcon, subspaceIcon: obj.subspaceIcon });
          const titles = new Set((sub.snippets||[]).map(s=>String(s.title || '').trim().toLowerCase()));
          if (!titles.has(String(obj.title).trim().toLowerCase())) {
            sub.snippets.push({ id:uid(), title:obj.title, lang:obj.lang||'', description:obj.description||'', code:obj.code||'', createdAt:Date.now() });
            count++;
          }
        } else {
          const sub = ensureImportedSpace(obj.kind, obj.space, obj.subspace, { spaceIcon: obj.spaceIcon, subspaceIcon: obj.subspaceIcon });
          const titles = new Set((sub.items||[]).map(i=>String(i.title || '').trim().toLowerCase()));
          if (!titles.has(String(obj.title).trim().toLowerCase())) {
            sub.items.push({ id:uid(), title:obj.title, prompt:obj.prompt||'', userAnswer:'', modelAnswer:obj.modelAnswer||'', createdAt:Date.now(), showModel:false });
            count++;
          }
        }
      });
      ensureDefaults();
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
  renderDashboard(); renderGoals(); renderReminders(); renderNotes(); renderCourses(); renderDocs(); renderCode(); renderExercises(); renderInterviews(); renderLinkedin(); renderCerts(); renderTools(); renderManuals(); renderLab(); updateStatus(); updateFontSelectorValue(); renderSidebarIdentity();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    if (!document.getElementById('register-form').classList.contains('hidden')) doRegister();
    else if (!document.getElementById('recovery-form')?.classList.contains('hidden')) resetPassword();
    else if (!document.getElementById('forgot-form').classList.contains('hidden')) sendResetCode();
    else doLogin();
  }
});



// ═══════════════════════════════════════════════════════════════
// ADVANCED SAFE ENHANCEMENTS LAYER
// ═══════════════════════════════════════════════════════════════
currentDetail.manualNodeId ||= null;
const ADV_PROFILE_DEFAULTS = {
  photoData:'', photoName:'', photoPosition:'center center', displayName:'', tagline:'', bio:'', location:'', links:'',
  favorites:['dashboard','goals','manuals','lab']
};
const ADV_DASHBOARD_WIDGETS = ['today','streak'];
const ADV_MAX_REVISIONS = 18;
let advCloudMeta = { lastSyncAt:'', lastSyncReason:'', pendingReasons:[], payloadBytes:0 };

function advClone(value){ return JSON.parse(JSON.stringify(value)); }
function advFmtDt(value){ return value ? new Date(value).toLocaleString('pt-BR') : '—'; }
function advBytes(bytes){
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function advDownloadJson(filename, payload){
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function processProfilePhotoFile(file){
  return new Promise((resolve, reject) => {
    if (!file) return resolve({ dataUrl:'', fileName:'' });
    if (!/^image\//.test(file.type)) return reject(new Error('Escolha um arquivo de imagem válido.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = event => {
      const img = new Image();
      img.onerror = () => reject(new Error('A imagem enviada está corrompida ou inválida.'));
      img.onload = () => {
        const maxSize = 640;
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.9;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 380000 && quality > 0.5) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ dataUrl, fileName:(file.name || 'perfil').replace(/\.[^.]+$/, '') + '.jpg' });
      };
      img.src = String(event.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}
function getProfileDisplayName(){
  return String(appData?.profile?.displayName || currentAuthIdentity?.displayName || currentUser || 'USER').trim();
}
function ensureManualStructure(manual){
  if (!manual) return null;
  manual.nodes ||= [];
  if (!manual.nodes.length) {
    manual.nodes.push({
      id: uid(),
      parentId: null,
      title: 'Visão geral',
      content: String(manual.content || ''),
      attachments: Array.isArray(manual.attachments) ? manual.attachments : [],
      createdAt: manual.createdAt || Date.now(),
    });
  }
  manual.nodes.forEach(node => {
    node.id ||= uid();
    node.parentId = node.parentId || null;
    node.title = String(node.title || 'Seção');
    node.content = String(node.content || '');
    node.attachments ||= [];
    node.createdAt ||= Date.now();
  });
  manual.content = '';
  manual.attachments = [];
  return manual;
}
function getManualNode(manualId, nodeId=''){
  const manual = appData.manuals.find(m => m.id === manualId);
  if (!manual) return null;
  ensureManualStructure(manual);
  return manual.nodes.find(node => node.id === nodeId) || manual.nodes[0] || null;
}
function serializeAppDataForRevision(){
  const snapshot = advClone(appData || baseData());
  delete snapshot.history;
  return snapshot;
}
function recordRevision(reason='Atualização'){ 
  if (!currentUser || !appData) return;
  appData.history ||= [];
  const snapshot = serializeAppDataForRevision();
  const serialized = JSON.stringify(snapshot);
  const signature = `${serialized.length}:${serialized.slice(0, 180)}`;
  const latest = appData.history[0];
  if (latest && latest.signature === signature) return;
  appData.history.unshift({
    id: uid(),
    ts: new Date().toISOString(),
    reason,
    section: currentSection,
    signature,
    snapshot
  });
  if (appData.history.length > ADV_MAX_REVISIONS) appData.history.length = ADV_MAX_REVISIONS;
}
function applyRevisionSnapshot(snapshot, reason='Restauração'){ 
  const preservedHistory = advClone(appData?.history || []);
  const restored = Object.assign(baseData(), advClone(snapshot || {}));
  restored.history = preservedHistory;
  appData = restored;
  ensureDefaults();
  saveUserData({ skipRevision:true, reason });
  recordRevision(reason);
  writeLS(userDataKey(currentUser), appData);
  renderAll();
  showToast('Versão restaurada com sucesso.');
}
function openHistoryModal(){
  const revisions = appData?.history || [];
  openModal('Histórico de versões', `
    <div class="panel" style="margin-bottom:12px"><div class="panel-title">Desfazer e restaurar</div><div class="row-text">O sistema guarda até ${ADV_MAX_REVISIONS} versões locais do estado do site para permitir restauração rápida sem depender do backup inteiro.</div></div>
    <div class="stack">
      ${revisions.length ? revisions.map((rev, idx) => `
        <div class="panel">
          <div class="row-top">
            <div>
              <div class="row-title">${esc(rev.reason || 'Alteração')}</div>
              <div class="row-sub">${advFmtDt(rev.ts)} · seção ${esc(rev.section || '—')} · versão ${idx + 1}</div>
            </div>
            <div class="row-actions">
              <button class="btn xs" onclick="restoreRevision('${rev.id}')">Restaurar</button>
              <button class="btn xs" onclick="exportRevision('${rev.id}')">Exportar</button>
            </div>
          </div>
        </div>`).join('') : '<div class="empty">Nenhuma versão gravada ainda.</div>'}
    </div>
  `, `<button class="btn" onclick="undoLastChange()">Desfazer última mudança</button>`);
}
function restoreRevision(revisionId){
  const rev = (appData?.history || []).find(item => item.id === revisionId);
  if (!rev) return showToast('Versão não encontrada.');
  closeModal();
  applyRevisionSnapshot(rev.snapshot, `Restaurou versão de ${advFmtDt(rev.ts)}`);
}
function exportRevision(revisionId){
  const rev = (appData?.history || []).find(item => item.id === revisionId);
  if (!rev) return;
  advDownloadJson(`mfhub-revisao-${revisionId}.json`, rev);
  showToast('Versão exportada.');
}
function undoLastChange(){
  const revisions = appData?.history || [];
  if (revisions.length < 2) return showToast('Ainda não há versão anterior para desfazer.');
  closeModal();
  applyRevisionSnapshot(revisions[1].snapshot, 'Desfazer última mudança');
}
function ensureTopbarActions(){
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  // No extra buttons — Perfil is in sidebar photo, Sync/Admin/Histórico removed
  const syncBadge = document.getElementById('cloud-sync-status');
  if (syncBadge && syncBadge.dataset.bound !== '1') {
    syncBadge.dataset.bound = '1';
    syncBadge.style.cursor = 'pointer';
    syncBadge.addEventListener('click', openCloudStatusModal);
  }
}
function renderSidebarIdentityExtra(){
  const displayName = getProfileDisplayName();
  const profileVerse = '"[...] mas o justo viverá pela sua fé." Habacuque 2:4';
  const sidebarUser = document.getElementById('sidebar-user');
  const sidebarEmail = document.getElementById('sidebar-user-email');
  if (sidebarUser) sidebarUser.textContent = displayName.toUpperCase();
  if (sidebarEmail) sidebarEmail.textContent = profileVerse;
  let meta = document.getElementById('sidebar-user-meta');
  if (meta) {
    const tagline = String(appData?.profile?.tagline || '');
    const location = String(appData?.profile?.location || '');
    const lines = [tagline, location].filter(Boolean).map(item => `<div>${esc(item)}</div>`);
    lines.push(`<div style="margin-top:8px"><button class="btn xs" type="button" onclick="openAdminModeModal()">Admin técnico</button></div>`);
    meta.innerHTML = lines.join('');
  }
}
async function saveProfileModal(){
  const file = document.getElementById('profile-photo-file')?.files?.[0] || null;
  const applyFields = (photoData='', photoName='') => {
    appData.profile ||= advClone(ADV_PROFILE_DEFAULTS);
    appData.profile.displayName = document.getElementById('profile-display-name')?.value.trim() || '';
    appData.profile.tagline = document.getElementById('profile-tagline')?.value.trim() || '';
    appData.profile.location = document.getElementById('profile-location')?.value.trim() || '';
    appData.profile.bio = document.getElementById('profile-bio')?.value.trim() || '';
    appData.profile.links = document.getElementById('profile-links')?.value.trim() || '';
    appData.profile.photoPosition = document.getElementById('profile-photo-position')?.value || 'center center';
    appData.profile.favorites = Array.from(document.querySelectorAll('[data-profile-fav]:checked')).map(el => el.value);
    if (photoData) {
      appData.profile.photoData = photoData;
      appData.profile.photoName = photoName || 'perfil.jpg';
    }
    saveUserData({ reason:'Atualizou perfil' });
    renderSidebarIdentity();
    closeModal();
    showToast('Perfil atualizado.');
  };
  if (!file) return applyFields();
  try {
    const processed = await processProfilePhotoFile(file);
    applyFields(processed.dataUrl, processed.fileName);
  } catch (err) {
    showToast(err.message || 'Não foi possível salvar a foto.');
  }
}
function openProfileModal(){
  appData.profile ||= advClone(ADV_PROFILE_DEFAULTS);
  const profile = Object.assign({}, ADV_PROFILE_DEFAULTS, appData.profile || {});
  const favoriteOptions = [
    ['dashboard','Dashboard'], ['goals','Metas'], ['manuals','Manuais'], ['tools','Ferramentas'], ['lab','Lab'], ['courses','Cursos']
  ];
  openModal('Perfil do usuário', `
    <div class="cols-2">
      <div class="panel">
        <div class="panel-title">Identidade</div>
        <div class="row"><label class="lbl">Foto</label><input id="profile-photo-file" class="input" type="file" accept="image/*"></div>
        ${profile.photoData ? `<div class="row"><img src="${esc(profile.photoData)}" alt="Prévia" style="width:96px;height:96px;border-radius:50%;object-fit:cover;object-position:${esc(profile.photoPosition || 'center center')};border:1px solid var(--border)"></div>` : ''}
        <div class="row"><label class="lbl">Posição da foto</label><select id="profile-photo-position" class="select">
          <option value="center center" ${(profile.photoPosition || 'center center') === 'center center' ? 'selected' : ''}>Centralizada</option>
          <option value="center top" ${profile.photoPosition === 'center top' ? 'selected' : ''}>Mais acima</option>
          <option value="center 35%" ${profile.photoPosition === 'center 35%' ? 'selected' : ''}>Rosto mais visível</option>
          <option value="center bottom" ${profile.photoPosition === 'center bottom' ? 'selected' : ''}>Mais abaixo</option>
        </select></div>
        <div class="auth-note">A foto é redimensionada automaticamente antes de salvar para evitar quebra por tamanho.</div>
        <div class="row"><label class="lbl">Nome de exibição</label><input id="profile-display-name" class="input" value="${esc(profile.displayName)}" placeholder="Ex.: Eliel Miranda"></div>
        <div class="row"><label class="lbl">Título</label><input id="profile-tagline" class="input" value="${esc(profile.tagline)}" placeholder="Ex.: Analista Mainframe"></div>
        <div class="row"><label class="lbl">Local</label><input id="profile-location" class="input" value="${esc(profile.location)}" placeholder="Cidade / contexto"></div>
      </div>
      <div class="panel">
        <div class="panel-title">Resumo</div>
        <div class="row"><label class="lbl">Bio curta</label><textarea id="profile-bio" class="textarea">${esc(profile.bio)}</textarea></div>
        <div class="row"><label class="lbl">Links</label><textarea id="profile-links" class="textarea" placeholder="Um por linha">${esc(profile.links)}</textarea></div>
        <div class="row"><label class="lbl">Atalhos favoritos</label>
          <div class="profile-fav-grid">
            ${favoriteOptions.map(([value,label]) => `<label><input type="checkbox" data-profile-fav value="${value}" ${profile.favorites.includes(value) ? 'checked' : ''}> ${label}</label>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `, `<button class="btn" onclick="openAdminModeModal()">Admin técnico</button><button class="btn" onclick="clearProfilePhoto()">Remover foto</button><button class="btn primary" onclick="saveProfileModal()">Salvar perfil</button>`);
}
openProfilePhotoModal = openProfileModal;
const _advClearProfilePhoto = clearProfilePhoto;
clearProfilePhoto = function(){ _advClearProfilePhoto(); appData.profile.displayName ||= ''; renderSidebarIdentity(); };
const _oldBaseData = baseData;
baseData = function(){
  const data = _oldBaseData();
  data.profile = Object.assign({}, ADV_PROFILE_DEFAULTS, data.profile || {});
  data.history = Array.isArray(data.history) ? data.history : [];
  data.meta = Object.assign({ dashboardWidgets: ADV_DASHBOARD_WIDGETS.slice() }, data.meta || {});
  return data;
};
const _oldEnsureDefaults = ensureDefaults;
ensureDefaults = function(){
  _oldEnsureDefaults();
  currentDetail.manualNodeId ||= null;
  appData.history = Array.isArray(appData.history) ? appData.history : [];
  appData.profile = Object.assign({}, ADV_PROFILE_DEFAULTS, appData.profile || {});
  if (!Array.isArray(appData.meta.dashboardWidgets) || !appData.meta.dashboardWidgets.length) appData.meta.dashboardWidgets = ADV_DASHBOARD_WIDGETS.slice();
  appData.manuals.forEach(ensureManualStructure);
};
const _oldSaveUserData = saveUserData;
saveUserData = function(options={}){
  if (!options.skipRevision && appData && currentUser) recordRevision(options.reason || `Atualização em ${currentSection}`);
  _oldSaveUserData(options);
};
const _oldRenderSidebarIdentity = renderSidebarIdentity;
renderSidebarIdentity = function(){
  _oldRenderSidebarIdentity();
  renderSidebarIdentityExtra();
};
const _oldScheduleCloudSync = scheduleCloudSync;
scheduleCloudSync = function(reason='change'){
  advCloudMeta.pendingReasons.push(reason);
  _oldScheduleCloudSync(reason);
};
const _oldPushCloudState = pushCloudState;
pushCloudState = async function(reason='manual'){
  try { advCloudMeta.payloadBytes = new Blob([JSON.stringify(appData || {})]).size; } catch(e) { advCloudMeta.payloadBytes = 0; }
  const ok = await _oldPushCloudState(reason);
  if (ok) {
    advCloudMeta.lastSyncAt = new Date().toISOString();
    advCloudMeta.lastSyncReason = reason;
    advCloudMeta.pendingReasons = [];
  }
  return ok;
};
const _oldBootstrapCloudState = bootstrapCloudState;
bootstrapCloudState = async function(){
  const result = await _oldBootstrapCloudState();
  if (!lastCloudError && canUseCloudSync()) advCloudMeta.lastSyncReason ||= 'bootstrap';
  return result;
};
function openCloudStatusModal(){
  const pending = Array.from(new Set(advCloudMeta.pendingReasons)).join(', ') || 'nenhuma';
  openModal('Diagnóstico da nuvem', `
    <div class="stack">
      <div class="panel"><div class="panel-title">Sincronização</div>
        <div class="stat-row"><span class="sk">Status</span><span class="sv">${esc(document.getElementById('cloud-sync-status')?.textContent || '—')}</span></div>
        <div class="stat-row"><span class="sk">Último sync</span><span class="sv">${esc(advFmtDt(advCloudMeta.lastSyncAt))}</span></div>
        <div class="stat-row"><span class="sk">Motivo</span><span class="sv">${esc(advCloudMeta.lastSyncReason || '—')}</span></div>
        <div class="stat-row"><span class="sk">Fila pendente</span><span class="sv">${esc(pending)}</span></div>
        <div class="stat-row"><span class="sk">Payload</span><span class="sv">${esc(advBytes(advCloudMeta.payloadBytes || new Blob([JSON.stringify(appData || {})]).size))}</span></div>
      </div>
      <div class="panel"><div class="panel-title">Erros</div><div class="row-text">${lastCloudError ? esc(lastCloudError) : 'Nenhum erro recente.'}</div></div>
    </div>
  `, `<button class="btn" onclick="openAdminModeModal()">Modo admin</button><button class="btn primary" onclick="flushCloudSync('manual')">Sincronizar agora</button>`);
}
function buildAdminMetricsSnapshot(remoteMetrics=null, remoteError=''){
  const payloadBytes = new Blob([JSON.stringify(appData || {})]).size;
  const totals = {
    manualsNodes: (appData.manuals || []).reduce((acc, manual) => acc + (ensureManualStructure(manual)?.nodes?.length || 0), 0),
    revisions: (appData.history || []).length,
    attachments: (appData.docs || []).reduce((acc, doc) => acc + (doc.attachments || []).length, 0) + (appData.manuals || []).reduce((acc, manual) => acc + (ensureManualStructure(manual).nodes || []).reduce((sum, node) => sum + (node.attachments || []).length, 0), 0)
  };
  return { payloadBytes, totals, remoteMetrics: remoteMetrics || null, remoteError: remoteError || '' };
}
function advStatRow(label, value){
  return `<div class="stat-row"><span class="sk">${esc(label)}:</span><span class="sv">${typeof value === 'string' ? value : esc(String(value ?? '—'))}</span></div>`;
}

function renderAdminSupabasePanel(snapshot){
  if (!SUPABASE_ENABLED) {
    return `<div class="panel"><div class="panel-title">Supabase</div><div class="row-text">Supabase não está configurado neste build.</div></div>`;
  }
  if (!canUseCloudSync()) {
    return `<div class="panel"><div class="panel-title">Supabase</div><div class="row-text">Entre com uma sessão válida para consultar as métricas do projeto.</div></div>`;
  }
  if (snapshot.remoteError) {
    return `<div class="panel"><div class="panel-title">Supabase</div><div class="row-text">${esc(snapshot.remoteError)}</div></div>`;
  }
  if (!snapshot.remoteMetrics) {
    return `<div class="panel"><div class="panel-title">Supabase</div><div class="row-text">Carregando métricas do projeto...</div></div>`;
  }
  const m = snapshot.remoteMetrics;
  return `
    <div class="panel"><div class="panel-title">Supabase</div>
      ${advStatRow('Banco atual', esc(m.database_size_pretty || advBytes(m.database_size_bytes || 0)))}
      ${advStatRow('WAL atual', esc(m.wal_size_pretty || advBytes(m.wal_size_bytes || 0)))}
      ${advStatRow('Tabela MFHUB', esc(m.mfhub_table_size_pretty || advBytes(m.mfhub_table_size_bytes || 0)))}
      ${advStatRow('Payloads MFHUB', esc(m.payload_total_pretty || advBytes(m.payload_total_bytes || 0)))}
      ${advStatRow('Maior payload', esc(m.largest_payload_pretty || advBytes(m.largest_payload_bytes || 0)))}
      ${advStatRow('Usuários com estado', Number(m.user_count || 0))}
      ${advStatRow('Seu payload salvo', esc(m.current_user_payload_pretty || advBytes(m.current_user_payload_bytes || 0)))}
      ${advStatRow('Storage buckets', esc(m.storage_total_pretty || advBytes(m.storage_total_bytes || 0)))}
      ${advStatRow('Objetos no Storage', Number(m.storage_object_count || 0))}
      <div class="row-text">Banco e WAL vêm do PostgreSQL do próprio projeto. O campo <strong>System</strong> do dashboard da Supabase continua sendo infraestrutura da plataforma e não sai por esta função SQL.</div>
    </div>`;
}

function renderAdminModeModal(snapshot){
  const html = `
    <div class="stack">
      <div class="panel"><div class="panel-title">Sessão</div>
        ${advStatRow('Usuário', currentUser || '—')}
        ${advStatRow('Auth ID', currentAuthIdentity?.id || '—')}
        ${advStatRow('Email', currentAuthIdentity?.email || '—')}
        ${advStatRow('Seção atual', currentSection || 'dashboard')}
      </div>
      <div class="panel"><div class="panel-title">Estado do app</div>
        ${advStatRow('Payload local', advBytes(snapshot.payloadBytes))}
        ${advStatRow('Revisões', snapshot.totals.revisions)}
        ${advStatRow('Nós de manuais', snapshot.totals.manualsNodes)}
        ${advStatRow('Anexos locais', snapshot.totals.attachments)}
        ${advStatRow('Tema / fonte', (document.documentElement.dataset.theme || 'dark') + ' / ' + getCurrentFontStyle())}
      </div>
      ${renderAdminSupabasePanel(snapshot)}
      <div class="panel"><div class="panel-title">Nuvem</div>
        <div class="row-text">${lastCloudError ? esc(lastCloudError) : 'Nenhum erro recente. Último sync em ' + esc(advFmtDt(advCloudMeta.lastSyncAt)) + '.'}</div>
      </div>
    </div>
  `;
  const foot = `<button class="btn" onclick="openCloudStatusModal()">Detalhes da nuvem</button><button class="btn" onclick="refreshAdminMetrics()">Atualizar métricas</button><button class="btn primary" onclick="flushCloudSync('manual')">Sincronizar agora</button>`;
  const titleEl = document.getElementById('modal-title');
  if (titleEl?.textContent === 'Modo admin técnico') {
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-foot').innerHTML = foot + '<button class="btn" onclick="closeModal()">Cancelar</button>';
    return;
  }
  openModal('Modo admin técnico', html, foot);
}

async function fetchAdminMetrics(){
  if (!SUPABASE_ENABLED || !supabaseClient) throw new Error('Supabase não configurado neste build.');
  if (!currentAuthIdentity?.id) throw new Error('Faça login para consultar as métricas do projeto.');
  const { data, error } = await supabaseClient.rpc(CLOUD_RPC_ADMIN_METRICS);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes(CLOUD_RPC_ADMIN_METRICS)) {
      throw new Error('A função SQL mfhub_admin_metrics ainda não foi criada no Supabase. Rode o script SQL que acompanha este pacote.');
    }
    throw error;
  }
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}
async function refreshAdminMetrics(){
  const baseSnapshot = buildAdminMetricsSnapshot();
  renderAdminModeModal(baseSnapshot);
  try {
    const remoteMetrics = await fetchAdminMetrics();
    renderAdminModeModal(buildAdminMetricsSnapshot(remoteMetrics, ''));
  } catch (error) {
    renderAdminModeModal(buildAdminMetricsSnapshot(null, error?.message || 'Falha ao consultar as métricas do Supabase.'));
  }
}
function openAdminModeModal(){
  renderAdminModeModal(buildAdminMetricsSnapshot());
  refreshAdminMetrics();
}
function openExportCenter(){
  const sections = [
    ['all', 'Backup completo'], ['goals', 'Metas diárias'], ['notes', 'Anotações'], ['courses', 'Cursos'], ['docs', 'Documentação'], ['code', 'Código'],
    ['exercises', 'Exercícios'], ['interviews', 'Entrevistas'], ['linkedin', 'LinkedIn'], ['certs', 'Certificados'], ['tools', 'Ferramentas'], ['manuals', 'Manuais'], ['profile', 'Perfil']
  ];
  openModal('Exportar por seção', `
    <div class="stack">${sections.map(([key, label]) => `<div class="row-item"><div class="row-top"><div><div class="row-title">${esc(label)}</div><div class="row-sub">Arquivo JSON separado para essa área.</div></div><button class="btn xs" onclick="exportSectionData('${key}')">Exportar</button></div></div>`).join('')}</div>
  `);
}
function exportSectionData(sectionKey='all'){
  if (sectionKey === 'all') return exportAllData();
  const sectionMap = {
    goals: { dailyGoals: appData.dailyGoals, streak: getStreakData() },
    notes: { generalNotes: appData.generalNotes },
    courses: { courses: appData.courses },
    docs: { docs: appData.docs },
    code: { codeSpaces: appData.codeSpaces },
    exercises: { exerciseSpaces: appData.exerciseSpaces },
    interviews: { interviewSpaces: appData.interviewSpaces },
    linkedin: { linkedinPosts: appData.linkedinPosts },
    certs: { certificates: appData.certificates },
    tools: { tools: appData.tools },
    manuals: { manuals: appData.manuals },
    profile: { profile: appData.profile }
  };
  const payload = { exportedAt: new Date().toISOString(), exportedBy: currentUser, section: sectionKey, data: sectionMap[sectionKey] || {} };
  advDownloadJson(`mfhub-${sectionKey}-${new Date().toISOString().slice(0,10)}.json`, payload);
  showToast(`Seção ${sectionKey} exportada.`);
}
function openDashboardPrefsModal(){
  const selected = new Set(appData.meta.dashboardWidgets || ADV_DASHBOARD_WIDGETS);
  openModal('Personalizar dashboard', `
    <div class="panel"><div class="panel-title">Widgets rápidos</div>
      <div class="profile-fav-grid">${ADV_DASHBOARD_WIDGETS.map(id => `<label><input type="checkbox" data-dash-widget value="${id}" ${selected.has(id) ? 'checked' : ''}> ${esc(id)}</label>`).join('')}</div>
    </div>
  `, `<button class="btn primary" onclick="saveDashboardPrefs()">Salvar preferências</button>`);
}
function saveDashboardPrefs(){
  const selected = Array.from(document.querySelectorAll('[data-dash-widget]:checked')).map(el => el.value);
  appData.meta.dashboardWidgets = selected.length ? selected : ADV_DASHBOARD_WIDGETS.slice();
  saveUserData({ reason:'Atualizou dashboard' });
  closeModal();
  renderDashboard();
  showToast('Dashboard atualizado.');
}
function renderDashboardExtras(){
  const host = document.getElementById('dashboard-extra-zone');
  if (host) host.remove();
}
const _oldRenderDashboard = renderDashboard;
renderDashboard = function(){
  _oldRenderDashboard();
  renderDashboardExtras();
};
const _oldUpdateStatus = updateStatus;
updateStatus = function(){
  _oldUpdateStatus();
  const el = document.getElementById('status-stats');
  if (el) el.textContent += ` · ${(appData.history || []).length} revisões`;
};
const _oldRenderAll = renderAll;
renderAll = function(){
  _oldRenderAll();
  ensureTopbarActions();
  renderSidebarIdentity();
};
const _oldResolveAttachmentHolder = resolveAttachmentHolder;
resolveAttachmentHolder = function(type, id1, id2='', id3=''){
  if (type === 'manual-node') return getManualNode(id1, id2);
  return _oldResolveAttachmentHolder(type, id1, id2, id3);
};
function renderManualTreeNodes(manual, parentId=null, depth=0){
  const nodes = (manual.nodes || []).filter(node => (node.parentId || null) === parentId).sort((a,b) => String(a.title).localeCompare(String(b.title), 'pt-BR'));
  return nodes.map(node => `
    <div class="manual-tree-node ${currentDetail.manualNodeId === node.id ? 'active' : ''}" id="manual-node-${node.id}" style="margin-left:${depth * 14}px" onclick="openManualNode('${manual.id}','${node.id}')">
      <span>${depth ? '└' : '•'}</span>
      <span>${esc(node.title)}</span>
      <span class="manual-node-count">${(node.attachments || []).length}</span>
    </div>
    ${renderManualTreeNodes(manual, node.id, depth + 1)}
  `).join('');
}
renderManuals = function(){
  const wrap = document.getElementById('section-manuals');
  const manual = appData.manuals.find(m => m.id === currentDetail.manualId);
  if (!manual) {
    wrap.innerHTML = `
      <div class="headline">
        <div><div class="title">Manuais</div><div class="subtitle">Categorias com árvore de seções, texto livre e anexos por nó</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="openImportCenter('backup')">Importar</button><button class="btn primary" onclick="openManualModal()">Nova categoria</button></div>
      </div>
      <div class="manual-grid">
        ${appData.manuals.map(m => { ensureManualStructure(m); return `<div class="card clickable" id="manual-card-${m.id}" onclick="openManual('${m.id}')"><div class="card-actions"><button class="btn xs" onclick="event.stopPropagation();openManualModal('${m.id}')">Editar</button><button class="btn xs danger" onclick="event.stopPropagation();deleteManual('${m.id}')">Excluir</button></div><div class="card-icon">📚</div><div class="card-title">${esc(m.name)}</div><div class="manual-card-meta">${esc(m.desc||'Sem descrição')}<br>${(m.nodes || []).length} nó(s)</div></div>`; }).join('')}
        <div class="card new clickable" onclick="openManualModal()"><div><div style="font-size:30px;text-align:center">+</div><div>Nova categoria</div></div></div>
      </div>
    `;
    return;
  }
  ensureManualStructure(manual);
  const selectedNode = getManualNode(manual.id, currentDetail.manualNodeId) || manual.nodes[0];
  currentDetail.manualNodeId = selectedNode?.id || null;
  wrap.innerHTML = `
    <div class="back" onclick="backToManualList()">← Voltar</div>
    <div class="headline">
      <div><div class="title">${esc(manual.name)}</div><div class="subtitle">${esc(manual.desc || 'Manual')}</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" onclick="openManualModal('${manual.id}')">Editar categoria</button>
        <button class="btn" onclick="openManualNodeModal('${manual.id}','')">Nova seção raiz</button>
        <button class="btn primary" onclick="saveManualNodeContent('${manual.id}','${selectedNode.id}')">Salvar seção</button>
      </div>
    </div>
    <div class="manual-tree-layout">
      <div class="panel">
        <div class="panel-title">Árvore do manual</div>
        <div class="manual-tree">${renderManualTreeNodes(manual)}</div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="row-top">
            <div>
              <div class="panel-title">Seção atual</div>
              <div class="row-title">${esc(selectedNode.title)}</div>
              <div class="row-sub">${(selectedNode.attachments || []).length} anexo(s)</div>
            </div>
            <div class="row-actions">
              <button class="btn xs" onclick="openManualNodeModal('${manual.id}','${selectedNode.id}')">Subseção</button>
              <button class="btn xs" onclick="openManualNodeModal('${manual.id}','${selectedNode.parentId || ''}','${selectedNode.id}')">Editar</button>
              <button class="btn xs danger" onclick="deleteManualNode('${manual.id}','${selectedNode.id}')">Excluir</button>
            </div>
          </div>
          <textarea id="manual-node-editor" class="textarea" style="min-height:360px;margin-top:12px">${esc(selectedNode.content || '')}</textarea>
        </div>
        <div class="panel">
          <div class="panel-title">Anexos da seção</div>
          <div style="margin-bottom:10px"><button class="btn xs" onclick="uploadAttachmentsModal('manual-node','${manual.id}','${selectedNode.id}')">Adicionar arquivo</button></div>
          ${renderAttachments(selectedNode.attachments || [], 'manual-node', manual.id, selectedNode.id)}
        </div>
      </div>
    </div>
  `;
};
openManual = function(id){
  currentDetail.manualId = id;
  const manual = appData.manuals.find(m => m.id === id);
  ensureManualStructure(manual);
  currentDetail.manualNodeId = manual?.nodes?.[0]?.id || null;
  renderManuals();
};
backToManualList = function(){
  currentDetail.manualId = null;
  currentDetail.manualNodeId = null;
  renderManuals();
};
function openManualNode(manualId, nodeId){
  currentDetail.manualId = manualId;
  currentDetail.manualNodeId = nodeId;
  renderManuals();
  focusSectionElement(`manual-node-${nodeId}`);
}
function openManualNodeModal(manualId, parentId='', nodeId=''){
  const node = nodeId ? getManualNode(manualId, nodeId) : null;
  openModal(node ? 'Editar seção do manual' : 'Nova seção do manual', `
    <div class="row"><label class="lbl">Título da seção</label><input id="manual-node-title" class="input" value="${esc(node?.title || '')}"></div>
    <div class="row"><label class="lbl">Texto inicial (opcional)</label><textarea id="manual-node-content" class="textarea">${esc(node?.content || '')}</textarea></div>
  `, `<button class="btn primary" onclick="saveManualNode('${manualId}','${parentId}','${nodeId}')">Salvar</button>`);
}
function saveManualNode(manualId, parentId='', nodeId=''){
  const manual = appData.manuals.find(m => m.id === manualId); if (!manual) return;
  ensureManualStructure(manual);
  const title = document.getElementById('manual-node-title').value.trim();
  const content = document.getElementById('manual-node-content').value;
  if (!title) return showToast('Dê um título para a seção.');
  if (nodeId) {
    const node = getManualNode(manualId, nodeId); if (!node) return;
    node.title = title; node.content = content;
  } else {
    manual.nodes.push({ id: uid(), parentId: parentId || null, title, content, attachments: [], createdAt: Date.now() });
    currentDetail.manualNodeId = manual.nodes[manual.nodes.length - 1].id;
  }
  saveUserData({ reason:'Atualizou manual' });
  closeModal();
  renderManuals();
  showToast('Seção do manual salva.');
}
function deleteManualNode(manualId, nodeId){
  const manual = appData.manuals.find(m => m.id === manualId); if (!manual) return;
  const node = getManualNode(manualId, nodeId);
  if (!confirm(`Deseja mesmo excluir a seção "${(node && node.title) ? node.title : 'selecionada'}" e as subseções abaixo dela?`)) return;
  ensureManualStructure(manual);
  if (manual.nodes.length === 1) return showToast('Cada manual precisa manter ao menos uma seção.');
  const idsToRemove = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    manual.nodes.forEach(node => {
      if (!idsToRemove.has(node.id) && idsToRemove.has(node.parentId)) { idsToRemove.add(node.id); changed = true; }
    });
  }
  manual.nodes = manual.nodes.filter(node => !idsToRemove.has(node.id));
  currentDetail.manualNodeId = manual.nodes[0]?.id || null;
  saveUserData({ reason:'Removeu seção do manual' });
  renderManuals();
  showToast('Seção removida.');
}
function saveManualNodeContent(manualId, nodeId){
  const node = getManualNode(manualId, nodeId); if (!node) return;
  node.content = document.getElementById('manual-node-editor').value;
  saveUserData({ reason:'Salvou seção do manual' });
  showToast('Seção salva.');
}
const _oldHandleSearch = handleSearch;
function renderSearchResultsPage(rawQuery){
  const results = currentDetail.searchResults || [];
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
handleSearch = function(query){
  _oldHandleSearch(query);
  const rawQuery = (query || '').trim();
  const q = rawQuery.toLowerCase();
  if (!q) return;
  const extras = [];
  appData.manuals.forEach(manual => {
    ensureManualStructure(manual);
    if ((manual.name + ' ' + (manual.desc || '')).toLowerCase().includes(q)) extras.push({ area:'Manuais', title:manual.name, text:manual.desc || 'Categoria de manual', target:{ section:'manuals', manualId:manual.id, nodeId:manual.nodes[0]?.id, focusId:`manual-card-${manual.id}` } });
    (manual.nodes || []).forEach(node => {
      const nodeText = [node.title, node.content, ...(node.attachments || []).map(file => file.name)].join(' ').toLowerCase();
      if (nodeText.includes(q)) extras.push({ area:'Manual / seção', title:`${manual.name} > ${node.title}`, text:(node.content || (node.attachments || []).map(file => file.name).join(', ')).slice(0, 220), target:{ section:'manuals', manualId:manual.id, nodeId:node.id, focusId:`manual-node-${node.id}` } });
    });
  });
  const profileText = [appData.profile.displayName, appData.profile.tagline, appData.profile.bio, appData.profile.location, appData.profile.links].join(' ').toLowerCase();
  if (profileText.includes(q)) extras.push({ area:'Perfil', title:getProfileDisplayName(), text:[appData.profile.tagline, appData.profile.location].filter(Boolean).join(' · ') || 'Abrir perfil', target:{ section:'profile' } });
  const labText = [appData.lab?.title, appData.lab?.url, appData.lab?.planUrl].join(' ').toLowerCase();
  if (labText.includes(q)) extras.push({ area:'Lab', title:appData.lab?.title || 'EMUNAH BANK LAB', text:[appData.lab?.url, appData.lab?.planUrl].filter(Boolean).join(' · '), target:{ section:'lab' } });
  if (extras.length) {
    currentDetail.searchResults = [...(currentDetail.searchResults || []), ...extras];
    renderSearchResultsPage(rawQuery);
  }
};
const _oldOpenSearchResult = openSearchResult;
openSearchResult = function(index){
  const result = (currentDetail.searchResults || [])[index];
  const t = result?.target || {};
  if (t.section === 'manuals') {
    currentDetail.manualId = t.manualId || null;
    currentDetail.manualNodeId = t.nodeId || null;
    goSection('manuals');
    focusSectionElement(t.focusId || '');
    return;
  }
  if (t.section === 'profile') {
    openProfileModal();
    return;
  }
  if (t.section === 'admin') {
    openAdminModeModal();
    return;
  }
  return _oldOpenSearchResult(index);
};
const _oldExportAllData = exportAllData;
exportAllData = function(){
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser,
    version: 'mfhub.v4',
    data: appData,
    streak: getStreakData(),
    cloud: { lastSyncAt: advCloudMeta.lastSyncAt, lastSyncReason: advCloudMeta.lastSyncReason }
  };
  advDownloadJson(`mfhub-backup-${new Date().toISOString().slice(0,10)}.json`, payload);
  showToast('Backup exportado com sucesso.');
};
const _oldImportContent = importContent;
importContent = function(){
  const file = document.getElementById('imp-file')?.files?.[0];
  if (!file) return _oldImportContent();
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(String(e.target?.result || '{}'));
      if (parsed && parsed.version === 'mfhub.v4' && parsed.streak) {
        const merged = mergeStreakData(getStreakData(), parsed.streak);
        writeLS(getStreakStorageKey(), merged);
      }
    } catch(err) {}
    _oldImportContent();
  };
  reader.readAsText(file, 'utf-8');
};
window.openProfileModal = openProfileModal;
window.openCloudStatusModal = openCloudStatusModal;
window.openHistoryModal = openHistoryModal;
window.restoreRevision = restoreRevision;
window.exportRevision = exportRevision;
window.undoLastChange = undoLastChange;
window.openExportCenter = openExportCenter;
window.exportSectionData = exportSectionData;
window.openAdminModeModal = openAdminModeModal;
window.refreshAdminMetrics = refreshAdminMetrics;
window.openDashboardPrefsModal = openDashboardPrefsModal;
window.saveDashboardPrefs = saveDashboardPrefs;
window.openManualNode = openManualNode;
window.openManualNodeModal = openManualNodeModal;
window.saveManualNode = saveManualNode;
window.deleteManualNode = deleteManualNode;
window.saveManualNodeContent = saveManualNodeContent;
window.saveProfileModal = saveProfileModal;

bindSupabaseAuthEvents();
setMissingSupabaseHelp();
loadRememberedLogin();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushCloudSync('visibility');
});

if (isRecoveryFlow()) {
  showLoginScreen('recovery');
} else {
  // Enquanto resolve a sessão, mantém tela de login invisível para evitar o piscar
  tryRestoreSession().then(restored => {
    if (!restored) showLoginScreen('login');
  }).catch(err => {
    console.warn('session-restore-failed', err?.message || err);
    showLoginScreen('login');
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
window.deleteReminder                 = deleteReminder;
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
window.deleteManual                   = deleteManual;
window.deleteGenericSpace             = deleteGenericSpace;
window.deleteSubspace                 = deleteSubspace;
window.downloadAttachment             = downloadAttachment;
window.duplicateGoalSuggestions       = duplicateGoalSuggestions;
window.openReminderModal              = openReminderModal;
window.saveReminderModal              = saveReminderModal;
window.toggleReminderDone             = toggleReminderDone;
window.setReminderFilter              = setReminderFilter;
window.requestReminderPermission      = requestReminderPermission;
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
window.updatePracticeUserAnswer       = updatePracticeUserAnswer;
window.updatePracticeModelAnswer      = updatePracticeModelAnswer;
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
window.setFontStyle    = setFontStyle;
window.goSection       = goSection;
window.openImportCenter= openImportCenter;
window.openManual                    = openManual;
window.openManualModal               = openManualModal;
window.backToManualList              = backToManualList;
window.saveManual                    = saveManual;
window.saveManualContent             = saveManualContent;
window.openProfilePhotoModal         = openProfilePhotoModal;
window.saveProfilePhoto              = saveProfilePhoto;
window.clearProfilePhoto             = clearProfilePhoto;
window.handleSearch    = handleSearch;
window.closeModal      = closeModal;
window.exportAllData   = exportAllData;
window.nextVerse       = nextVerse;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleLabPlan   = toggleLabPlan;
});