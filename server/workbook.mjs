import ExcelJS from "exceljs";
export const demoKnowledge = {
  company: {
    nome: "Formato Comunicação Visual",
    segmento: "Comunicação visual",
    descricao:
      "Catálogo demonstrativo baseado no material fornecido. Confirme preços e condições antes de usar em atendimento real.",
    horario: "Horário não informado — consultar atendente.",
  },
  products: [
    ["WB-120", "Wind banner 1,2 × 0,50", 250],
    ["WB-200", "Wind banner 2 × 0,75", 280],
    ["WB-250", "Wind banner 2,5 × 0,75", 300],
    ["WB-300", "Wind banner 3 × 0,75", 420],
  ].map(([codigo, nome, preco]) => ({
    codigo,
    nome,
    categoria: "Wind banners",
    unidade: "UN",
    preco,
    entrada: 50,
    prazo: "10 dias úteis; início da contagem a confirmar",
    minimo: 0,
    ativo: true,
    descricao:
      "Kit completo: tecido em dois lados, haste em alumínio e base conforme disponibilidade. Valores de referência.",
    sinonimos: "bandeira, windbanner",
  })),
  faqs: [
    {
      pergunta: "O que vem no wind banner?",
      resposta:
        "O kit inclui tecido em dois lados, haste em alumínio e base disponível no dia, de cimento ou plástica.",
      palavras: "kit,inclui,acompanha,completo",
    },
    {
      pergunta: "Qual é a entrada?",
      resposta:
        "O catálogo de wind banners informa entrada de 50%. Um atendente confirma as condições antes da produção.",
      palavras: "pagamento,entrada,sinal",
    },
    {
      pergunta: "Vocês fazem instalação?",
      resposta:
        "Um atendente precisa confirmar as medidas, o material e as condições do local para orientar sobre a instalação.",
      palavras: "instalação,instalar",
    },
  ],
  conditions: [
    {
      chave: "observacao",
      valor:
        "Preços extraídos de imagem de referência. Não incluem adicionais não informados, como frete e instalação.",
    },
  ],
};
const sheets = {
  EMPRESA: ["nome", "segmento", "descricao", "horario"],
  PRODUTOS: [
    "codigo",
    "nome",
    "categoria",
    "unidade",
    "preco",
    "entrada",
    "prazo",
    "minimo",
    "ativo",
    "descricao",
    "sinonimos",
  ],
  PERGUNTAS: ["pergunta", "resposta", "palavras"],
  CONDICOES: ["chave", "valor"],
};
export async function makeWorkbook(sample = false) {
  const w = new ExcelJS.Workbook();
  w.creator = "cAssistAI";
  const help = w.addWorksheet("LEIA_ME");
  help.columns = [
    { header: "Campo", key: "field", width: 28 },
    { header: "Instrução", key: "instruction", width: 110 },
  ];
  [
    ["Versão", "1.0"],
    [
      "Como usar",
      "Preencha os valores, sem fórmulas. Não renomeie abas ou colunas. Importe e confira a prévia antes de ativar.",
    ],
    [
      "EMPRESA",
      "Uma linha. Nome obrigatório. Segmento, descrição e horário são informações públicas.",
    ],
    [
      "PRODUTOS",
      "Uma linha por produto ou variante. Código único. Use preço em reais e unidade UN ou M2.",
    ],
    ["entrada", "Percentual de 0 a 100. Deixe vazio se não informado."],
    [
      "minimo",
      "Valor mínimo em reais por item, após cálculo de quantidade/área. Zero significa sem mínimo.",
    ],
    ["ativo", "SIM ou NÃO. Produtos inativos não são oferecidos pelo bot."],
    [
      "prazo",
      "Texto aprovado. Informe quando começa a contagem; não invente essa condição.",
    ],
    [
      "PERGUNTAS",
      "Pergunta, resposta aprovada e palavras-chave separadas por vírgula.",
    ],
    [
      "CONDICOES",
      "Informações comerciais públicas em pares chave/valor. Não coloque senhas ou notas internas.",
    ],
    [
      "Limites",
      "Arquivo até 5 MB e 2.000 produtos. Texto até 2.000 caracteres por célula.",
    ],
    [
      "Substituição",
      "A importação substitui a base ativa da empresa. O histórico e os orçamentos anteriores são preservados.",
    ],
    [
      "Dados desconhecidos",
      "Não invente valores. Produtos sem preço não devem ser ativados; encaminhe o pedido ao atendente.",
    ],
    [
      "Exemplo Formato",
      "Valores demonstrativos da imagem enviada; confirmar atualidade antes de atendimento real.",
    ],
  ].forEach(([field, instruction]) => help.addRow({ field, instruction }));
  for (const [name, headers] of Object.entries(sheets)) {
    const s = w.addWorksheet(name);
    s.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: ["descricao", "resposta", "prazo", "valor"].includes(h) ? 70 : 24,
    }));
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = { from: "A1", to: { row: 1, column: headers.length } };
    const data = sample
      ? name === "EMPRESA"
        ? [demoKnowledge.company]
        : name === "PRODUTOS"
          ? demoKnowledge.products.map((p) => ({
              ...p,
              ativo: p.ativo ? "SIM" : "NÃO",
            }))
          : name === "PERGUNTAS"
            ? demoKnowledge.faqs
            : demoKnowledge.conditions
      : [];
    for (const row of data) s.addRow(row);
  }
  w.eachSheet((s) => {
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF51345D" },
    };
    s.getRow(1).height = 28;
    s.eachRow((r) => (r.alignment = { vertical: "top", wrapText: true }));
  });
  return Buffer.from(await w.xlsx.writeBuffer());
}
function inspectZip(buffer) {
  let total = 0,
    entries = 0;
  for (let i = 0; i < buffer.length - 46; i++)
    if (buffer.readUInt32LE(i) === 0x02014b50) {
      total += buffer.readUInt32LE(i + 24);
      entries++;
      if (total > 30 * 1024 * 1024 || entries > 200)
        throw Error("Planilha descompactada excede o limite permitido.");
    }
  if (!entries) throw Error("O arquivo não é uma planilha .xlsx válida.");
}
export async function parseWorkbook(buffer) {
  inspectZip(buffer);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(buffer);
  const errors = [];
  const read = (name) => {
    const sheet = w.getWorksheet(name);
    if (!sheet) {
      errors.push(`${name}: aba ausente.`);
      return [];
    }
    if (sheet.rowCount > 2001) {
      errors.push(`${name}: máximo de 2.000 linhas de dados.`);
      return [];
    }
    const headers = sheet
      .getRow(1)
      .values.slice(1)
      .map((v) => String(v || "").trim());
    for (const h of sheets[name])
      if (!headers.includes(h)) errors.push(`${name}: coluna ${h} ausente.`);
    const rows = [];
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      const o = { _row: n };
      headers.forEach((h, i) => {
        const v = r.getCell(i + 1).value;
        if (v && typeof v === "object") {
          errors.push(
            `${name}!${r.getCell(i + 1).address}: use texto ou número, sem fórmulas ou links.`,
          );
          o[h] = "";
        } else {
          o[h] = v ?? "";
          if (String(o[h]).length > 2000)
            errors.push(
              `${name}!${r.getCell(i + 1).address}: texto acima de 2.000 caracteres.`,
            );
        }
      });
      if (Object.keys(o).some((k) => k !== "_row" && o[k] !== "")) rows.push(o);
    });
    return rows;
  };
  const companyRows = read("EMPRESA"),
    productRows = read("PRODUTOS"),
    faqRows = read("PERGUNTAS"),
    conditionRows = read("CONDICOES");
  if (companyRows.length !== 1 || !companyRows[0]?.nome)
    errors.push("EMPRESA: preencha exatamente uma empresa com nome.");
  const seen = new Set();
  const number = (v) =>
    typeof v === "number"
      ? v
      : typeof v === "string" && /^\d+(?:[,.]\d+)?$/.test(v.trim())
        ? Number(v.trim().replace(",", "."))
        : NaN;
  const products = productRows.map((r) => {
    const line = `PRODUTOS linha ${r._row}`;
    const code = String(r.codigo).trim();
    const price = number(r.preco),
      deposit = r.entrada === "" ? null : number(r.entrada),
      minimum = r.minimo === "" ? 0 : number(r.minimo);
    const unit = String(r.unidade).toUpperCase();
    const active = String(r.ativo).toUpperCase().trim();
    if (!code || seen.has(code))
      errors.push(`${line}: código vazio ou duplicado.`);
    seen.add(code);
    if (!r.nome) errors.push(`${line}: nome obrigatório.`);
    if (!["UN", "M2"].includes(unit))
      errors.push(`${line}: unidade deve ser UN ou M2.`);
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      price > 1000000 ||
      Math.abs(price * 100 - Math.round(price * 100)) > 0.00001
    )
      errors.push(
        `${line}: preço deve ser um número entre 0 e 1.000.000 com até duas casas decimais.`,
      );
    if (
      deposit !== null &&
      (!Number.isFinite(deposit) || deposit < 0 || deposit > 100)
    )
      errors.push(`${line}: entrada deve estar entre 0 e 100.`);
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1000000)
      errors.push(`${line}: mínimo inválido.`);
    if (!["SIM", "NÃO", "NAO"].includes(active))
      errors.push(`${line}: ativo deve ser SIM ou NÃO.`);
    return {
      codigo: code,
      nome: String(r.nome),
      categoria: String(r.categoria),
      unidade: unit,
      preco: price,
      entrada: deposit,
      prazo: String(r.prazo),
      minimo: minimum,
      ativo: active === "SIM",
      descricao: String(r.descricao),
      sinonimos: String(r.sinonimos),
    };
  });
  const faqs = faqRows.map((r) => {
    if (!r.pergunta || !r.resposta)
      errors.push(
        `PERGUNTAS linha ${r._row}: pergunta e resposta obrigatórias.`,
      );
    return {
      pergunta: String(r.pergunta),
      resposta: String(r.resposta),
      palavras: String(r.palavras),
    };
  });
  const company = Object.fromEntries(
    sheets.EMPRESA.map((k) => [k, String(companyRows[0]?.[k] || "")]),
  );
  return {
    errors,
    data: {
      company,
      products,
      faqs,
      conditions: conditionRows.map((r) => ({
        chave: String(r.chave),
        valor: String(r.valor),
      })),
    },
  };
}
