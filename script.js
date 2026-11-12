'use strict';

const API = 'https://dog.ceo/api';
const CHAVE_FAVORITOS = 'dog-atlas-favoritos-v1';
const POR_PAGINA = 12;
const $ = (seletor) => document.querySelector(seletor);

const el = {
  racas: $('#racas'), subracas: $('#subracas'), quantidade: $('#quantidade'), quantidadeValor: $('#quantidade-valor'),
  galeria: $('#galeria'), mensagem: $('#mensagem'), vazio: $('#estado-vazio'), vazioTitulo: $('#vazio-titulo'), vazioTexto: $('#vazio-texto'),
  contador: $('#contador-resultados'), titulo: $('#titulo-resultados'), subtitulo: $('#subtitulo-resultados'), modo: $('#modo-label'),
  paginacao: $('#paginacao'), anterior: $('#anterior'), proximo: $('#proximo'), indicador: $('#indicador-pagina'),
  modal: $('#modal-foto'), modalImagem: $('#modal-imagem'), modalTitulo: $('#modal-titulo'), modalSubtitulo: $('#modal-subtitulo'), modalFavoritar: $('#modal-favoritar')
};

let catalogo = {};
let fotos = [];
let favoritos = carregarFavoritos();
let pagina = 1;
let modo = 'explorar';
let colecaoCompleta = false;
let requisicaoAtual = 0;
let fotoModal = null;
let carregando = false;

function carregarFavoritos() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) || '[]');
    if (!Array.isArray(dados)) return [];
    return dados.filter(item => item && typeof item.url === 'string' && item.url.startsWith('https://images.dog.ceo/') && typeof item.raca === 'string');
  } catch { return []; }
}

function salvarFavoritos() {
  try { localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(favoritos)); }
  catch { avisar('Não foi possível salvar: armazenamento do navegador indisponível.', true); }
  atualizarContadores();
}

function atualizarContadores() {
  $('#total-salvos').textContent = favoritos.length;
  $('#nav-fav-count').textContent = favoritos.length;
}

function nomeBonito(nome) {
  return nome ? nome.replace(/[-_]/g, ' ').replace(/\b\w/g, letra => letra.toUpperCase()) : 'Raça não identificada';
}

function nomeDaFoto(foto) {
  return foto.subraca ? `${nomeBonito(foto.subraca)} ${nomeBonito(foto.raca)}` : nomeBonito(foto.raca);
}

function avisar(texto = '', erro = false) {
  el.mensagem.textContent = texto;
  el.mensagem.classList.toggle('is-error', erro);
}

async function consultar(caminho) {
  const resposta = await fetch(`${API}${caminho}`);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const dados = await resposta.json();
  if (dados.status !== 'success') throw new Error('Resposta inválida da API');
  return dados.message;
}

function ativarCarregamento(valor) {
  carregando = valor;
  $('#buscar').disabled = valor;
  $('#todas').disabled = valor;
  $('#recarregar').disabled = valor;
  $('#surpreenda').disabled = valor;
  if (valor) avisar('Buscando fotografias na Dog API...');
}

async function iniciar() {
  atualizarContadores();
  el.quantidade.addEventListener('input', () => { el.quantidadeValor.textContent = el.quantidade.value; });
  el.racas.addEventListener('change', atualizarSubracas);
  $('#buscar').addEventListener('click', () => buscar(false));
  $('#todas').addEventListener('click', () => buscar(true));
  $('#recarregar').addEventListener('click', () => { if (modo === 'favoritos') exibirFavoritos(); else buscar(colecaoCompleta); });
  $('#surpreenda').addEventListener('click', surpreender);
  $('#hero-explorar').addEventListener('click', () => { abrirExplorador(); $('#explorador').scrollIntoView({behavior:'smooth'}); });
  $('#nav-explorar').addEventListener('click', abrirExplorador);
  $('#nav-favoritos').addEventListener('click', exibirFavoritos);
  el.anterior.addEventListener('click', () => trocarPagina(-1));
  el.proximo.addEventListener('click', () => trocarPagina(1));
  el.galeria.addEventListener('click', cliqueGaleria);
  $('#fechar-modal').addEventListener('click', () => el.modal.close());
  el.modal.addEventListener('click', evento => { if (evento.target === el.modal) el.modal.close(); });
  el.modalFavoritar.addEventListener('click', () => { if (fotoModal) alternarFavorito(fotoModal); });
  try {
    catalogo = await consultar('/breeds/list/all');
    const nomes = Object.keys(catalogo).sort((a,b) => a.localeCompare(b));
    for (const raca of nomes) {
      const opcao = new Option(nomeBonito(raca), raca);
      el.racas.add(opcao);
    }
    const total = nomes.length + nomes.reduce((n, raca) => n + catalogo[raca].length, 0);
    $('#total-racas').textContent = total;
    await buscar(false);
  } catch (erro) {
    avisar('Não foi possível carregar o catálogo. Verifique sua conexão e tente recarregar a página.', true);
    mostrarVazio('Catálogo indisponível', 'A Dog API pode estar temporariamente fora do ar.');
  }
}

async function atualizarSubracas() {
  const raca = el.racas.value;
  el.subracas.replaceChildren(new Option('Todas as sub-raças', ''));
  el.subracas.disabled = true;
  if (!raca) return;
  // Endpoint específico de sub-raças, mesmo que a lista geral já contenha os nomes.
  try {
    const variedades = await consultar(`/breed/${encodeURIComponent(raca)}/list`);
    if (el.racas.value !== raca) return; // Impede resposta atrasada de outra seleção.
    for (const variedade of variedades) el.subracas.add(new Option(nomeBonito(variedade), variedade));
    el.subracas.disabled = variedades.length === 0;
  } catch { avisar('Não foi possível consultar as sub-raças. Você ainda pode buscar pela raça.', true); }
}

// A URL da imagem inclui uma pasta como breeds/hound-afghan/...
// O catálogo é usado para reconhecer corretamente a raça e sua variedade.
function identificarImagem(url, racaSelecionada = '', subracaSelecionada = '') {
  let raca = racaSelecionada;
  let subraca = subracaSelecionada;
  const pasta = (url.match(/\/breeds\/([^/]+)\//) || [,''])[1].toLowerCase();
  if (!raca) {
    const racas = Object.keys(catalogo).sort((a,b) => b.length - a.length);
    raca = racas.find(nome => pasta === nome || pasta.startsWith(`${nome}-`)) || pasta.split('-')[0] || 'desconhecida';
  }
  if (!subraca && pasta.startsWith(`${raca}-`)) {
    const sufixo = pasta.slice(raca.length + 1);
    if ((catalogo[raca] || []).includes(sufixo)) subraca = sufixo;
  }
  return {url, raca, subraca};
}

function validarImagem(url) {
  try { const link = new URL(url); return link.protocol === 'https:' && link.hostname === 'images.dog.ceo'; }
  catch { return false; }
}

async function buscar(completa = false) {
  if (carregando) return;
  const raca = el.racas.value;
  const subraca = el.subracas.value;
  const quantidade = Number(el.quantidade.value);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) return avisar('Escolha entre 1 e 10 fotografias.', true);
  if (completa && !raca) return avisar('Escolha uma raça para consultar a coleção completa.', true);
  const base = raca ? `/breed/${encodeURIComponent(raca)}${subraca ? '/' + encodeURIComponent(subraca) : ''}/images` : '/breeds/image';
  const rota = completa ? base : (raca ? `${base}/random/${quantidade}` : `${base}/random/${quantidade}`);
  const id = ++requisicaoAtual;
  ativarCarregamento(true);
  try {
    const imagens = await consultar(rota);
    if (id !== requisicaoAtual) return;
    const lista = Array.isArray(imagens) ? imagens : [imagens];
    fotos = [...new Set(lista)].filter(validarImagem).map(url => identificarImagem(url, raca, subraca));
    pagina = 1;
    modo = 'explorar';
    colecaoCompleta = completa;
    $('#nav-explorar').classList.add('is-active');
    $('#nav-favoritos').classList.remove('is-active');
    el.modo.textContent = completa ? 'ACERVO COMPLETO' : 'DESCOBERTAS';
    el.titulo.textContent = raca ? nomeBonito(subraca ? `${subraca} ${raca}` : raca) : 'Galeria de descobertas';
    el.subtitulo.textContent = completa ? `Todas as imagens disponíveis nesta coleção. Navegue pelas páginas.` : 'Fotografias para conhecer e guardar.';
    avisar();
    renderizar();
  } catch {
    avisar('Falha ao consultar a API. Tente novamente em alguns instantes.', true);
  } finally {
    if (id === requisicaoAtual) ativarCarregamento(false);
  }
}

async function surpreender() {
  const lista = Object.keys(catalogo);
  if (!lista.length || carregando) return avisar('O catálogo ainda não está disponível.', true);
  el.racas.value = lista[Math.floor(Math.random() * lista.length)];
  await atualizarSubracas();
  await buscar(false);
  $('#explorador').scrollIntoView({behavior:'smooth'});
}

function abrirExplorador() {
  modo = 'explorar';
  el.modo.textContent = colecaoCompleta ? 'ACERVO COMPLETO' : 'DESCOBERTAS';
  const raca = el.racas.value;
  const subraca = el.subracas.value;
  el.titulo.textContent = raca ? nomeBonito(subraca ? `${subraca} ${raca}` : raca) : 'Galeria de descobertas';
  el.subtitulo.textContent = colecaoCompleta ? 'Todas as imagens disponíveis nesta coleção. Navegue pelas páginas.' : 'Fotografias para conhecer e guardar.';
  $('#nav-explorar').classList.add('is-active');
  $('#nav-favoritos').classList.remove('is-active');
  renderizar();
}

function exibirFavoritos() {
  modo = 'favoritos';
  pagina = 1;
  $('#nav-favoritos').classList.add('is-active');
  $('#nav-explorar').classList.remove('is-active');
  el.modo.textContent = 'MINHA COLEÇÃO';
  el.titulo.textContent = 'Suas fotos favoritas';
  el.subtitulo.textContent = 'Salvas neste navegador. Você pode remover qualquer foto quando quiser.';
  avisar();
  renderizar();
  $('#explorador').scrollIntoView({behavior:'smooth'});
}

function mostrarVazio(titulo, descricao) {
  el.vazioTitulo.textContent = titulo;
  el.vazioTexto.textContent = descricao;
  el.vazio.hidden = false;
}

function criarCard(foto) {
  const card = document.createElement('article');
  card.className = 'photo-card';
  const figura = document.createElement('div');
  figura.className = 'card-photo';
  const imagem = document.createElement('img');
  imagem.src = foto.url;
  imagem.alt = `Cachorro da raça ${nomeDaFoto(foto)}`;
  imagem.loading = 'lazy';
  imagem.decoding = 'async';
  imagem.addEventListener('error', () => { imagem.alt = 'Não foi possível carregar a imagem'; });
  const badge = document.createElement('span');
  badge.className = 'card-badge';
  badge.textContent = nomeDaFoto(foto);
  const favorito = document.createElement('button');
  favorito.type = 'button';
  favorito.className = 'heart-button';
  favorito.dataset.acao = 'favoritar';
  favorito.dataset.url = foto.url;
  const salvo = favoritos.some(item => item.url === foto.url);
  favorito.classList.toggle('is-saved', salvo);
  favorito.textContent = salvo ? '♥' : '♡';
  favorito.setAttribute('aria-label', salvo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
  figura.append(imagem, badge, favorito);
  const info = document.createElement('div');
  info.className = 'card-info';
  const textos = document.createElement('div');
  const titulo = document.createElement('h4');
  titulo.textContent = nomeDaFoto(foto);
  const descricao = document.createElement('p');
  descricao.textContent = foto.subraca ? 'Sub-raça catalogada' : 'Fotografia da coleção';
  textos.append(titulo, descricao);
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'card-open';
  abrir.textContent = '↗';
  abrir.dataset.acao = 'abrir';
  abrir.dataset.url = foto.url;
  abrir.setAttribute('aria-label', `Ampliar foto de ${nomeDaFoto(foto)}`);
  info.append(textos, abrir);
  card.append(figura, info);
  return card;
}

function itensAtuais() { return modo === 'favoritos' ? favoritos : fotos; }

function renderizar() {
  const lista = itensAtuais();
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  pagina = Math.min(pagina, totalPaginas);
  el.galeria.replaceChildren();
  el.vazio.hidden = true;
  el.contador.textContent = `${lista.length} ${lista.length === 1 ? 'foto' : 'fotos'}`;
  if (lista.length === 0) {
    mostrarVazio(modo === 'favoritos' ? 'Sua coleção está vazia' : 'Nenhuma foto encontrada', modo === 'favoritos' ? 'Clique no coração de uma fotografia para guardá-la aqui.' : 'Selecione outra raça ou tente novamente.');
  } else {
    const inicio = (pagina - 1) * POR_PAGINA;
    const fragmento = document.createDocumentFragment();
    lista.slice(inicio, inicio + POR_PAGINA).forEach(foto => fragmento.append(criarCard(foto)));
    el.galeria.append(fragmento);
  }
  el.paginacao.hidden = totalPaginas <= 1;
  el.indicador.textContent = `Página ${pagina} de ${totalPaginas}`;
  el.anterior.disabled = pagina === 1;
  el.proximo.disabled = pagina === totalPaginas;
}

function trocarPagina(deslocamento) {
  const maximo = Math.ceil(itensAtuais().length / POR_PAGINA);
  pagina = Math.max(1, Math.min(maximo, pagina + deslocamento));
  renderizar();
  $('#titulo-resultados').scrollIntoView({behavior:'smooth', block:'start'});
}

function cliqueGaleria(evento) {
  const botao = evento.target.closest('button[data-acao]');
  if (!botao) return;
  const foto = itensAtuais().find(item => item.url === botao.dataset.url);
  if (!foto) return;
  if (botao.dataset.acao === 'favoritar') alternarFavorito(foto);
  if (botao.dataset.acao === 'abrir') abrirModal(foto);
}

function alternarFavorito(foto) {
  const indice = favoritos.findIndex(item => item.url === foto.url);
  if (indice >= 0) favoritos.splice(indice, 1);
  else favoritos.unshift({...foto});
  salvarFavoritos();
  renderizar();
  if (fotoModal?.url === foto.url) atualizarBotaoModal();
}

function abrirModal(foto) {
  fotoModal = foto;
  el.modalImagem.src = foto.url;
  el.modalImagem.alt = `Fotografia ampliada: ${nomeDaFoto(foto)}`;
  el.modalTitulo.textContent = nomeDaFoto(foto);
  el.modalSubtitulo.textContent = foto.subraca ? 'Sub-raça da coleção Dog CEO' : 'Fotografia da coleção Dog CEO';
  atualizarBotaoModal();
  el.modal.showModal();
}

function atualizarBotaoModal() {
  const salvo = favoritos.some(item => item.url === fotoModal?.url);
  el.modalFavoritar.textContent = salvo ? '♥ Remover dos favoritos' : '♡ Salvar favorito';
}

document.addEventListener('DOMContentLoaded', iniciar);
