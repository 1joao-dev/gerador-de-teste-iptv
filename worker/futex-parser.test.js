import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAccessDetails,
  extractDuration,
  extractRecommendedApp,
  extractResult,
} from "./futex-parser.js";

test("extrai código, usuário e senha de um teste Uniplay", () => {
  const text = [
    "O aplicativo indicado é o Zuxo Player.",
    "Conseguiu instalar o aplicativo?",
    "Pronto! Seu teste já está ativo.",
    "Seus dados de acesso:",
    "Código Uniplay: 123456",
    "Usuário: cliente01",
    "Senha: senha123",
    "Duração: 6 horas",
  ].join("\n");

  assert.equal(extractRecommendedApp(text), "Zuxo Player");
  assert.deepEqual(extractAccessDetails(text), [
    { label: "Código Uniplay", value: "123456" },
    { label: "Usuário", value: "cliente01" },
    { label: "Senha", value: "senha123" },
    { label: "Duração", value: "6 horas" },
  ]);
  assert.equal(extractResult(text).status, "completed");
  assert.equal(extractDuration(text), "6 horas");
});

test("extrai campos diferentes sem presumir o formato do dispositivo", () => {
  const text = [
    "Pronto! Seu teste já está ativo.",
    "Seus dados de acesso:",
    "Servidor: https://servidor.exemplo",
    "MAC Address: AA:BB:CC:DD:EE:FF",
    "PIN: 9876",
    "Playlist: https://lista.exemplo/playlist.m3u",
  ].join("\n");

  assert.deepEqual(extractAccessDetails(text), [
    { label: "Servidor", value: "https://servidor.exemplo" },
    { label: "MAC Address", value: "AA:BB:CC:DD:EE:FF" },
    { label: "PIN", value: "9876" },
    { label: "Playlist", value: "https://lista.exemplo/playlist.m3u" },
  ]);
});

test("preserva o bloco final quando a FUTEX não usa rótulos", () => {
  const text = [
    "Pronto! Seu teste já está ativo.",
    "Seus dados de acesso:",
    "https://lista.exemplo/cliente/abc.m3u",
  ].join("\n");

  assert.deepEqual(extractAccessDetails(text), [
    { label: "Dados de acesso", value: "https://lista.exemplo/cliente/abc.m3u" },
  ]);
});

test("não considera o texto do atendimento como credenciais antes da etapa final", () => {
  assert.deepEqual(extractAccessDetails("Qual é o seu nome?\nJoão\nQual seu celular?"), []);
  assert.equal(extractResult("Qual é o seu nome?"), undefined);
});


test("extrai o aplicativo recomendado em respostas específicas para iPhone e iPad", () => {
  assert.equal(
    extractRecommendedApp("Para iPhone, recomendamos o aplicativo IPTV Smarters Pro na App Store. Conseguiu instalar o aplicativo?"),
    "IPTV Smarters Pro",
  );
  assert.equal(
    extractRecommendedApp("Aplicativo indicado para iPhone: IBO Player. Conseguiu instalar?"),
    "IBO Player",
  );
  assert.equal(
    extractRecommendedApp("Baixe o app GSE Smart IPTV na App Store. Você conseguiu instalar?"),
    "GSE Smart IPTV",
  );
});

test("não transforma uma indicação genérica da FUTEX em nome de aplicativo", () => {
  assert.equal(extractRecommendedApp("Aplicativo indicado pela FUTEX. Conseguiu instalar o aplicativo?"), undefined);
});

test("reconhece variações de recomendação da FUTEX para Apple", () => {
  assert.equal(
    extractRecommendedApp("O aplicativo indicado pela FUTEX é: IPTV Smarters Pro. Conseguiu instalar?"),
    "IPTV Smarters Pro",
  );
  assert.equal(
    extractRecommendedApp("A FUTEX recomenda o aplicativo IBO Player para iPhone. Conseguiu instalar?"),
    "IBO Player",
  );
  assert.equal(
    extractRecommendedApp("Aplicativo para iOS: GSE Smart IPTV. Conseguiu instalar?"),
    "GSE Smart IPTV",
  );
  assert.equal(
    extractRecommendedApp("Recomendamos instalar o aplicativo XCIPTV no seu iPad. Conseguiu instalar?"),
    "XCIPTV",
  );
});

