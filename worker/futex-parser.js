function lastMatch(text, patterns) {
  let result;
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    const candidate = matches.at(-1);
    if (candidate && (!result || candidate.index > result.index)) result = candidate;
  }
  return result;
}

function cleanRecommendedApp(value) {
  let candidate = value
    .replace(/^[\s"'“”‘’:;,.!?–—-]+/u, "")
    .replace(/[🎬📺📲]+$/u, "")
    .replace(/^(?:o|a|app|aplicativo)\s+/iu, "")
    .trim();

  candidate = candidate
    .replace(/\s+(?:na|no|pela|através da|por meio da)\s+(?:app store|play store|loja(?: de aplicativos)?|seu aparelho|seu dispositivo|seu iphone|seu ipad|iphone|ipad).*$/i, "")
    .replace(/\s+para\s+(?:o\s+)?(?:iphone|ipad|ios|seu aparelho|seu dispositivo).*$/i, "")
    .replace(/\s+(?:disponível|disponivel|encontrado|encontrado na|na loja|na app store|na play store).*$/i, "")
    .replace(/\s+(?:e depois|para continuar|para assistir|para acessar).*$/i, "")
    .replace(/[\s"'“”‘’:;,.!?–—-]+$/u, "")
    .trim();

  if (!candidate || candidate.length > 64) return undefined;
  if (/^(?:pela\s+)?futex$|^(?:o\s+)?(?:aplicativo|app)(?:\s+indicado)?$|^(?:iphone|ipad|ios|apple)$/i.test(candidate)) return undefined;
  if (/^(?:sim|não|nao|consegui|não consegui|nao consegui|já instalei|ja instalei|instalar|confirmar)$/i.test(candidate)) return undefined;
  if (/^(?:indicado|recomendado)\s+(?:pela|por)\s+futex$/i.test(candidate)) return undefined;
  return candidate;
}

export function extractRecommendedApp(text) {
  const patterns = [
    /(?:o\s+)?aplicativo indicado(?:\s+(?:pela|por)\s+futex)?(?:\s+para\s+[^:,.!?;\n]+)?\s*(?:é|:|=)\s*(?:o\s+)?([^.!;\n]+)/gi,
    /(?:o\s+)?aplicativo recomendado(?:\s+(?:pela|por)\s+futex)?(?:\s+para\s+[^:,.!?;\n]+)?\s*(?:é|:|=)\s*(?:o\s+)?([^.!;\n]+)/gi,
    /(?:a\s+)?futex\s+(?:indica|recomenda|sugere)\s+(?:o\s+)?(?:aplicativo|app)\s+(?:chamado|denominado|de nome)?\s*[:\-]?\s*([^.!;\n]+)/gi,
    /(?:nome do aplicativo|nome do app)\s*(?:é|:|=)?\s*(?:o\s+)?([^.!;\n]+)/gi,
    /(?:app|aplicativo)\s+(?:indicado|recomendado)\s*[:=]\s*(?:o\s+)?([^.!;\n]+)/gi,
    /(?:app|aplicativo)\s*[:=]\s*(?:o\s+)?([^.!;\n]+)/gi,
    /(?:recomendamos|recomendo|indicamos|indico)\s+(?:o\s+)?(?:aplicativo|app)\s+(?:chamado|denominado|de nome)?\s*[:\-]?\s*([^.!;\n]+)/gi,
    /(?:recomendamos|recomendo|indicamos|indico)\s+(?:que você\s+)?(?:instale|baixe|use|utilize|instalar|baixar|usar|utilizar)\s+(?:o\s+)?(?:aplicativo|app)\s+([^.!;\n]+)/gi,
    /(?:a\s+)?futex\s+(?:recomenda|indica)\s+(?:que você\s+)?(?:instale|baixe|use|utilize)\s+(?:o\s+)?(?:aplicativo|app)\s+([^.!;\n]+)/gi,
    /(?:baixe|instale|procure|pesquise|utilize|use|abra)\s+(?:o\s+)?(?:aplicativo|app)\s+(.+?)\s+(?:na|no|pela)\s+(?:app store|play store|loja(?: de aplicativos)?|seu aparelho|seu dispositivo|iphone|ipad)/gi,
    /(?:baixe|instale|procure|pesquise|utilize|use|abra)\s+(?:o\s+)?(.+?)\s+(?:na|no|pela)\s+(?:app store|play store|loja(?: de aplicativos)?|seu iphone|seu ipad)/gi,
    /(?:instale|baixe|procure|pesquise|utilize|use)\s+(?:o\s+)?(?:aplicativo|app)\s+(.+?)\s+(?:no seu aparelho|no seu dispositivo|no iphone|no ipad|em seu aparelho|em seu iphone|em seu ipad)/gi,
    /(?:para\s+(?:o\s+)?(?:iphone|ipad|ios)[^.!;\n]*?\b(?:instale|baixe|use|utilize)\s+(?:o\s+)?(?:aplicativo|app)?\s*)([^.!;\n]+)/gi,
    /(?:aplicativo|app)\s+para\s+(?:o\s+)?(?:iphone|ipad|ios)\s*(?:é|:|=)\s*(?:o\s+)?([^.!;\n]+)/gi,
    /instale o\s+([^.!;\n]+?)\s+(?:na sua tv|no seu aparelho)/gi,
    /app recomendado(?: é|:)?\s*(?:o\s+)?([^.!;\n]+)/gi,
  ];

  const candidates = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = cleanRecommendedApp(match[1] || "");
      if (candidate) candidates.push({ index: match.index ?? -1, candidate });
    }
  }

  candidates.sort((a, b) => a.index - b.index);
  return candidates.at(-1)?.candidate;
}

export function extractDuration(text) {
  const match = lastMatch(text, [
    /duração(?: do teste)?\s*[:\-]?\s*([0-9]+\s*(?:horas?|h|minutos?|min))/gi,
    /teste de\s*([0-9]+\s*(?:horas?|h|minutos?|min))/gi,
    /validade\s*[:\-]?\s*([0-9]+\s*(?:horas?|h|minutos?|min))/gi,
  ]);
  return match?.[1]?.trim() || undefined;
}

const knownStandaloneLabels = /^(c[oó]digo(?: de acesso| uniplay| de ativa[cç][aã]o)?|usu[aá]rio|login|senha|password|url|url do servidor|server url|portal url|servidor|server|host|portal|dns|mac(?: address)?|pin|playlist|lista m3u|m3u(?: url)?|device id|device key|client id|account id|token|key|chave|serial|porta|username|e-?mail|link)$/i;

function cleanLabel(value) {
  return value.replace(/^[\s•\-–—📌🔑✅☑️]+/u, "").replace(/[*_]+/g, "").trim();
}

function cleanValue(value) {
  return value.replace(/^[\s•\-–—📌🔑✅☑️]+/u, "").replace(/[*_]+/g, "").trim();
}

export function extractAccessDetails(text) {
  const lower = text.toLowerCase();
  const markers = [
    "seus dados de acesso",
    "dados de acesso",
    "dados do teste",
    "acesso liberado",
    "teste gerado",
    "teste de 6 horas gerado",
    "seu teste foi gerado",
    "seu teste já está ativo",
    "aqui estão os dados",
  ];
  const markerIndex = markers.reduce((latest, marker) => Math.max(latest, lower.lastIndexOf(marker)), -1);
  if (markerIndex < 0) return [];

  let tail = text.slice(markerIndex);
  tail = tail.split(/(?:aguarde|para efetuar o pagamento|antes de efetuar o pagamento|volte ao site onde)/i)[0];

  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const details = [];
  const seen = new Set();

  const add = (label, value) => {
    const normalizedLabel = cleanLabel(label).replace(/[:=]+$/, "");
    const normalizedValue = cleanValue(value);
    const key = normalizedLabel.toLowerCase();
    if (!normalizedLabel || !normalizedValue || normalizedLabel.length > 64 || normalizedValue.length > 1200) return;
    if (/^(seus dados de acesso|dados de acesso|dados do teste|acesso liberado|teste gerado)$/i.test(normalizedLabel)) return;
    if (seen.has(key)) {
      const existing = details.find((item) => item.label.toLowerCase() === key);
      if (existing && existing.value !== normalizedValue) existing.value += "\n" + normalizedValue;
      return;
    }
    seen.add(key);
    details.push({ label: normalizedLabel, value: normalizedValue });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/^[🔑✅☑️📌\s]+/u, "").trim();
    if (!line || /^(seus dados de acesso|dados de acesso|dados do teste|acesso liberado|teste gerado|pronto!?|seu teste já está ativo)/i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;

    const pair = line.match(/^([^:=]{2,64})\s*[:=]\s*(.+)$/);
    if (pair) {
      add(pair[1], pair[2]);
      continue;
    }

    const label = cleanLabel(line).replace(/[:=]+$/, "");
    if ((knownStandaloneLabels.test(label) || /[:=]$/.test(line)) && lines[index + 1]) {
      const next = lines[index + 1].replace(/^[🔑✅☑️📌\s]+/u, "").trim();
      if (next && !knownStandaloneLabels.test(cleanLabel(next))) {
        add(label, next);
        index += 1;
      }
    }
  }

  // Alguns atendimentos apresentam o bloco final sem rótulos (por exemplo,
  // uma única URL ou playlist). Mantém o texto integral em vez de inventar campos.
  if (details.length === 0) {
    const fallback = lines
      .filter((line) => !/^(seus dados de acesso|dados de acesso|dados do teste|acesso liberado|teste gerado|pronto!?|seu teste já está ativo)/i.test(line))
      .join("\n")
      .trim();
    if (fallback) details.push({ label: "Dados de acesso", value: fallback });
  }

  return details;
}

export function extractResult(text) {
  const accessDetails = extractAccessDetails(text);
  if (accessDetails.length === 0) return undefined;

  const activeMatch = lastMatch(text, [
    /pronto!\s*seu teste já está ativo[^\n]*/gi,
    /seu teste foi gerado[^\n]*/gi,
    /teste liberado[^\n]*/gi,
  ]);
  const message = activeMatch?.[0]?.trim();

  return {
    status: "completed",
    resultTitle: "Teste gerado com sucesso",
    accessDetails,
    duration: extractDuration(text) || "6 horas",
    message,
  };
}
