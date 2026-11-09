export const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function calculate(product, quantity, width, height) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
    throw Error("Informe uma quantidade inteira entre 1 e 10.000.");
  const price = Math.round(product.preco * 100);
  let total;
  if (product.unidade === "M2") {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width > 100 ||
      height > 100
    )
      throw Error(
        "Informe largura e altura em metros, maiores que zero e até 100.",
      );
    // Integer millimetres and cents: one rounding at the end of the line.
    total = Math.round(
      (price *
        Math.round(width * 1000) *
        Math.round(height * 1000) *
        quantity) /
        1000000,
    );
  } else total = price * quantity;
  total = Math.max(total, Math.round((product.minimo || 0) * 100));
  if (!Number.isSafeInteger(total) || total > 100000000)
    throw Error("Este valor precisa de revisão por um atendente.");
  return {
    total,
    deposit:
      product.entrada === null
        ? null
        : Math.round((total * product.entrada) / 100),
  };
}
// Requests that always go to a person: refunds, complaints, problems, discounts.
const humanPatterns = [
  /\b(atendente|humano|pessoa de verdade|falar com (alguem|uma pessoa|o dono|o gerente|voces))\b/,
  /\b(reembolso|estorno|dinheiro de volta|devolver o dinheiro|devolucao|cancelar|cancelamento)\b/,
  /\b(reclamacao|reclamar|procon|defeito|veio errado|chegou errado|nao chegou|quebrad[oa]|estragad[oa])\b/,
  /\b(desconto|negociar|parcelar|parcelamento)\b/,
];
export const needsHuman = (t) => humanPatterns.some((r) => r.test(t));
const greetingWords =
  "(oi+|ola|opa|eai|e ai|hey|hello|bom dia|boa tarde|boa noite|salve|menu)";
const smallTalk =
  "(tudo (bem|bom|certo|joia|tranquilo)|td (bem|bom)|como vai( voce)?|blz|beleza|tranquilo)";
const greetingRe = new RegExp(
  `^(${greetingWords}( ${greetingWords})*( ${smallTalk})?|${smallTalk})$`,
);
export const isGreeting = (t) =>
  greetingRe.test(
    t
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
export function reply(knowledge, text, context = {}) {
  const t = norm(text),
    products = knowledge.products.filter((p) => p.ativo);
  if (needsHuman(t))
    return {
      text: "Entendi. Vou chamar um atendente para cuidar disso com você, só um instante.",
      handoff: true,
      context: {},
    };
  if (isGreeting(t))
    return {
      text: `${/tudo|td|como vai|blz|beleza/.test(t) ? "Oi! Tudo bem sim, e com você?" : "Olá!"} Sou o assistente da ${knowledge.company.nome}. Posso tirar dúvidas e fazer orçamentos. Como posso ajudar?`,
      smalltalk: true,
      context,
    };
  if (
    /^(obrigad[oa]|muito obrigad[oa]|valeu|vlw|brigad[oa]|ok obrigad[oa])\b/.test(
      t,
    )
  )
    return {
      text: "Por nada! Se precisar de mais alguma coisa, é só chamar.",
      smalltalk: true,
      context,
    };
  if (/horario|abre|fecha/.test(t))
    return {
      text:
        knowledge.company.horario ||
        "O horário não foi informado. Vou chamar um atendente para confirmar.",
      handoff: !knowledge.company.horario,
      context,
    };
  if (/catalogo|produtos|opcoes/.test(t))
    return {
      text: products.length
        ? "Estas são nossas opções:\n" +
          products
            .slice(0, 12)
            .map(
              (p) =>
                `• ${p.nome} (${p.codigo}): ${money(Math.round(p.preco * 100))}/${p.unidade === "M2" ? "m²" : "un."}`,
            )
            .join("\n") +
          "\nQual você deseja?"
        : "Ainda não temos um catálogo ativo. Vou chamar um atendente.",
      handoff: !products.length,
      context: {},
    };
  const faq = knowledge.faqs.find(
    (f) =>
      norm(f.pergunta) === t ||
      String(f.palavras)
        .split(",")
        .some((k) => k.trim().length > 2 && t.includes(norm(k.trim()))),
  );
  if (faq && !context.product) return { text: faq.resposta, context: {} };
  let product =
    products.find((p) => t.includes(norm(p.codigo))) ||
    products.find((p) => t.includes(norm(p.nome))) ||
    products.find((p) => {
      const size = p.nome.match(/\d+(?:[,.]\d+)?\s*[×x]\s*\d+(?:[,.]\d+)?/);
      return (
        size &&
        t
          .replace(/[×x\s]/g, "")
          .replaceAll(",", ".")
          .includes(
            norm(size[0])
              .replace(/[×x\s]/g, "")
              .replaceAll(",", "."),
          )
      );
    });
  product ||= products.find((p) => p.codigo === context.product);
  if (!product) {
    const matches = products.filter((p) =>
      [p.nome, p.categoria, ...p.sinonimos.split(",")].some(
        (s) => s.trim().length > 2 && t.includes(norm(s.trim())),
      ),
    );
    if (matches.length === 1) product = matches[0];
    else if (matches.length > 1)
      return {
        text:
          "Qual destas opções você prefere?\n" +
          matches
            .slice(0, 10)
            .map(
              (p) =>
                `• ${p.nome} — ${p.codigo}: ${money(Math.round(p.preco * 100))}`,
            )
            .join("\n"),
        context: {},
      };
  }
  if (product) {
    const quantityMatch =
      t.match(/(?:^|\s)(\d+)\s*(?:unidades?|un\b|pecas?|kits?)/) ||
      t.match(/^(\d+)$/);
    const quantity = quantityMatch
      ? Number(quantityMatch[1])
      : context.quantity;
    if (!quantity)
      return {
        text: `${product.nome} custa ${money(Math.round(product.preco * 100))} por ${product.unidade === "M2" ? "m²" : "unidade"}. Quantas unidades você precisa?`,
        context: { product: product.codigo },
      };
    let width = context.width,
      height = context.height;
    if (product.unidade === "M2") {
      const dim = t.match(
        /(\d+(?:[,.]\d+)?)\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(m|metros?|cm)\b/,
      );
      if (dim) {
        const scale = dim[3] === "cm" ? 0.01 : 1;
        width = Number(dim[1].replace(",", ".")) * scale;
        height = Number(dim[2].replace(",", ".")) * scale;
      }
      if (!width || !height)
        return {
          text: "Qual é a largura e a altura de cada peça? Informe a unidade, por exemplo: 2 x 1 m.",
          context: { product: product.codigo, quantity },
        };
    }
    try {
      const calculated = calculate(product, quantity, width, height);
      return {
        text: `Seu orçamento:\n${quantity} × ${product.nome}${product.unidade === "M2" ? ` (${width} × ${height} m por peça)` : ""}\nTotal: ${money(calculated.total)}${calculated.deposit === null ? "" : `\nEntrada (${product.entrada}%): ${money(calculated.deposit)}`}\nPrazo: ${product.prazo || "a confirmar com um atendente"}.\n${knowledge.conditions.map((c) => c.valor).join("\n")}\nDeseja aceitar este orçamento?`,
        quote: {
          product: product.nome,
          quantity,
          ...calculated,
          conditions: JSON.stringify({
            prazo: product.prazo,
            width,
            height,
            conditions: knowledge.conditions,
          }),
        },
        context: { awaitingAcceptance: true },
      };
    } catch (e) {
      return { text: e.message, context: { product: product.codigo } };
    }
  }
  return {
    unknown: true,
    text: "Não encontrei uma informação segura na base da empresa. Vou encaminhar sua dúvida a um atendente.",
    handoff: true,
    context: {},
  };
}
