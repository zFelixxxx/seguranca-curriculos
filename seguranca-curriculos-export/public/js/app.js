document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const screens = {
    list: document.getElementById('screen-list'),
    create: document.getElementById('screen-create'),
    details: document.getElementById('screen-details')
  };

  const buttons = {
    goToCreate: document.getElementById('btn-go-to-create'),
    backFromCreate: document.getElementById('btn-back-from-create'),
    cancelCreate: document.getElementById('btn-cancel-create'),
    backFromDetails: document.getElementById('btn-back-from-details')
  };

  const forms = {
    create: document.getElementById('create-curriculo-form')
  };

  const inputs = {
    nome: document.getElementById('input-nome'),
    email: document.getElementById('input-email'),
    telefone: document.getElementById('input-telefone'),
    web: document.getElementById('input-web'),
    experiencia: document.getElementById('textarea-experiencia'),
    search: document.getElementById('search-input')
  };

  const charCounter = document.getElementById('char-count');
  const curriculosTableBody = document.getElementById('curriculos-table-body');
  const emptyState = document.getElementById('empty-state');
  const toastContainer = document.getElementById('toast-container');

  // Details screen data holders
  const detailsData = {
    nome: document.getElementById('detail-nome'),
    email: document.getElementById('detail-email'),
    telefone: document.getElementById('detail-telefone'),
    web: document.getElementById('detail-web'),
    experiencia: document.getElementById('detail-experiencia')
  };

  // State Management
  let activeScreen = 'list';
  let registeredCurriculos = [];
  let csrfToken = '';

  // Controllers de Abortamento de Requisições (Prevenção de Race Conditions)
  let loadCurriculosController = null;
  let loadDetailsController = null;

  // Regex de Validação Alinhados com o Servidor
  const NOME_REGEX = /^[a-zA-ZÀ-ÖØ-öø-ÿ\s'.~^-]{2,100}$/;
  const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const PHONE_REGEX = /^(?:\(?[1-9]{2}\)?\s?)?(?:(?:9\d|[2-9])\d{3}\-?\d{4})$/;
  const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

  // Inicializa Histórico de Navegação Seguro contra Manipulação
  history.replaceState({ screen: 'list' }, '', '#list');
  showScreen('list', false);
  fetchCsrfToken();

  // Escuta alteração do histórico protegida contra injeção externa
  window.addEventListener('popstate', (e) => {
    if (e.state && typeof e.state.screen === 'string') {
      const targetScreen = e.state.screen;
      if (['list', 'create', 'details'].includes(targetScreen)) {
        showScreen(targetScreen, false);
      }
    } else {
      showScreen('list', false);
    }
  });

  // Event Listeners para Navegação
  buttons.goToCreate.addEventListener('click', () => {
    resetForm();
    showScreen('create');
  });

  buttons.backFromCreate.addEventListener('click', () => showScreen('list'));
  buttons.cancelCreate.addEventListener('click', () => showScreen('list'));
  buttons.backFromDetails.addEventListener('click', () => showScreen('list'));

  // Contador de caracteres para a experiência profissional
  inputs.experiencia.addEventListener('input', () => {
    const len = inputs.experiencia.value.length;
    charCounter.textContent = len;
    if (len > 5000) {
      charCounter.style.color = 'var(--color-danger)';
    } else {
      charCounter.style.color = 'var(--color-text-muted)';
    }
  });

  // Limpeza de erros em tempo real
  Object.keys(inputs).forEach(key => {
    if (inputs[key] && key !== 'search') {
      inputs[key].addEventListener('input', () => {
        clearFieldError(inputs[key], `error-${key}`);
      });
    }
  });

  // Filtro na listagem de currículos
  inputs.search.addEventListener('input', () => {
    renderCurriculosTable(inputs.search.value.trim().toLowerCase());
  });

  // Handler de submissão do formulário
  forms.create.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm()) {
      submitForm();
    } else {
      showToast('Por favor, corrija os erros no formulário.', 'error');
    }
  });

  // SPA Screen routing com pushState higienizado
  function showScreen(screenKey, pushToHistory = true) {
    if (!['list', 'create', 'details'].includes(screenKey)) {
      screenKey = 'list';
    }
    activeScreen = screenKey;
    
    // Oculta todas as telas
    Object.keys(screens).forEach(key => {
      screens[key].classList.add('hidden');
    });

    // Exibe tela ativa
    screens[screenKey].classList.remove('hidden');

    if (screenKey === 'list') {
      loadCurriculos();
      inputs.search.value = '';
    }

    if (pushToHistory) {
      history.pushState({ screen: screenKey }, '', `#${screenKey}`);
    }
  }

  // Wrapper do Fetch com timeout integrado
  async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeout);
    
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timerId);
      return response;
    } catch (err) {
      clearTimeout(timerId);
      throw err;
    }
  }

  // Busca do CSRF Token na inicialização
  async function fetchCsrfToken() {
    try {
      const response = await fetchWithTimeout('/api/csrf-token');
      if (response.ok) {
        const data = await response.json();
        csrfToken = data.csrfToken;
      }
    } catch (err) {
      // Falha silenciosa no client, tratada na submissão
    }
  }

  // Toast notification segura (usa textContent para evitar injeção nos alertas)
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (toast.parentNode) {
          toastContainer.removeChild(toast);
        }
      }, 350);
    }, 4000);
  }

  // Carrega currículos tratando concorrência e timeout
  async function loadCurriculos() {
    if (loadCurriculosController) {
      loadCurriculosController.abort();
    }
    loadCurriculosController = new AbortController();

    curriculosTableBody.textContent = '';
    const loadingTr = document.createElement('tr');
    loadingTr.className = 'loading-state';
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 3;
    loadingTd.textContent = 'Carregando currículos...';
    loadingTr.appendChild(loadingTd);
    curriculosTableBody.appendChild(loadingTr);

    emptyState.classList.add('hidden');

    try {
      const response = await fetchWithTimeout('/api/curriculos', {
        signal: loadCurriculosController.signal
      });
      if (!response.ok) {
        throw new Error();
      }
      registeredCurriculos = await response.json();
      renderCurriculosTable();
    } catch (err) {
      if (err.name === 'AbortError') return;
      showToast('Erro ao carregar lista de currículos.', 'error');
      
      curriculosTableBody.textContent = '';
      const errTr = document.createElement('tr');
      errTr.className = 'loading-state loading-state-error';
      const errTd = document.createElement('td');
      errTd.colSpan = 3;
      errTd.textContent = 'Não foi possível carregar os currículos. Tente novamente mais tarde.';
      errTr.appendChild(errTd);
      curriculosTableBody.appendChild(errTr);
    }
  }

  // Renderiza tabela usando DOM seguro (sem innerHTML ou injeção de estilo inline)
  function renderCurriculosTable(filterText = '') {
    curriculosTableBody.textContent = '';
    
    const filtered = registeredCurriculos.filter(item => {
      return item.nome.toLowerCase().includes(filterText) || 
             item.email.toLowerCase().includes(filterText);
    });

    if (filtered.length === 0) {
      if (registeredCurriculos.length === 0) {
        emptyState.classList.remove('hidden');
      } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'table-no-results-cell';
        td.textContent = 'Nenhum currículo corresponde à pesquisa.';
        tr.appendChild(td);
        curriculosTableBody.appendChild(tr);
      }
      return;
    }

    emptyState.classList.add('hidden');

    filtered.forEach(item => {
      const tr = document.createElement('tr');

      const tdNome = document.createElement('td');
      tdNome.textContent = item.nome;

      const tdEmail = document.createElement('td');
      tdEmail.textContent = item.email;

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-col';

      const btnDetails = document.createElement('button');
      btnDetails.className = 'btn btn-secondary btn-sm';
      btnDetails.textContent = '🔍 Detalhes';
      btnDetails.addEventListener('click', () => {
        loadCurriculoDetails(item.id);
      });

      tdActions.appendChild(btnDetails);
      tr.appendChild(tdNome);
      tr.appendChild(tdEmail);
      tr.appendChild(tdActions);

      curriculosTableBody.appendChild(tr);
    });
  }

  // Carrega detalhes mitigando race conditions e XSS em links
  async function loadCurriculoDetails(id) {
    showScreen('details');
    
    Object.keys(detailsData).forEach(key => {
      detailsData[key].textContent = 'Carregando...';
    });

    if (loadDetailsController) {
      loadDetailsController.abort();
    }
    loadDetailsController = new AbortController();

    try {
      const response = await fetchWithTimeout(`/api/curriculos/${id}`, {
        signal: loadDetailsController.signal
      });
      
      if (response.status === 404) {
        showToast('Currículo não encontrado.', 'error');
        showScreen('list');
        return;
      }
      if (!response.ok) {
        throw new Error();
      }
      const data = await response.json();
      
      detailsData.nome.textContent = data.nome;
      detailsData.email.textContent = data.email;
      detailsData.telefone.textContent = data.telefone ? data.telefone : 'Não informado';
      
      // Geração de link segura (Sem innerHTML, validação estrita de esquemas permitidos)
      detailsData.web.textContent = '';
      if (data.web_address) {
        const urlStr = data.web_address.trim();
        if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
          const anchor = document.createElement('a');
          anchor.href = urlStr;
          anchor.textContent = urlStr;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          detailsData.web.appendChild(anchor);
        } else {
          detailsData.web.textContent = urlStr;
        }
      } else {
        detailsData.web.textContent = 'Não informado';
      }
      
      detailsData.experiencia.textContent = data.experiencia;

    } catch (err) {
      if (err.name === 'AbortError') return;
      showToast('Erro ao carregar detalhes do candidato.', 'error');
      showScreen('list');
    }
  }

  // Prevenção preemptiva de HTML / Protocolos perigosos nos inputs
  function containsHtmlOrInjects(text) {
    if (typeof text !== 'string') return false;
    return /<[^>]*>|javascript:|data:|vbscript:|file:|blob:/i.test(text);
  }

  // Validação estrita do Formulário no Client
  function validateForm() {
    let isValid = true;

    Object.keys(inputs).forEach(key => {
      if (inputs[key] && key !== 'search') {
        inputs[key].classList.remove('is-invalid', 'is-valid');
      }
    });

    // 1. Nome Completo
    const nomeVal = inputs.nome.value.trim();
    if (nomeVal.length < 2 || nomeVal.length > 100 || !NOME_REGEX.test(nomeVal) || containsHtmlOrInjects(nomeVal)) {
      setFieldError(inputs.nome, 'error-nome', 'Nome deve conter apenas letras e espaços (2 a 100 caracteres).');
      isValid = false;
    } else {
      setFieldSuccess(inputs.nome);
    }

    // 2. Email
    const emailVal = inputs.email.value.trim();
    if (!emailVal || emailVal.length > 100 || !EMAIL_REGEX.test(emailVal) || containsHtmlOrInjects(emailVal)) {
      setFieldError(inputs.email, 'error-email', 'Informe um endereço de e-mail válido (máximo 100 caracteres).');
      isValid = false;
    } else {
      setFieldSuccess(inputs.email);
    }

    // 3. Telefone (Opcional)
    const telVal = inputs.telefone.value.trim();
    if (telVal) {
      if (telVal.length > 20 || !PHONE_REGEX.test(telVal) || containsHtmlOrInjects(telVal)) {
        setFieldError(inputs.telefone, 'error-telefone', 'Formato aceito: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX.');
        isValid = false;
      } else {
        setFieldSuccess(inputs.telefone);
      }
    }

    // 4. Endereço Web (Opcional)
    const webVal = inputs.web.value.trim();
    if (webVal) {
      if (webVal.length > 200 || !URL_REGEX.test(webVal) || containsHtmlOrInjects(webVal)) {
        setFieldError(inputs.web, 'error-web', 'URL inválida. O link deve iniciar com http:// ou https://.');
        isValid = false;
      } else {
        setFieldSuccess(inputs.web);
      }
    }

    // 5. Experiência Profissional
    const expVal = inputs.experiencia.value.trim();
    if (expVal.length < 5 || expVal.length > 5000 || containsHtmlOrInjects(expVal)) {
      setFieldError(inputs.experiencia, 'error-experiencia', 'A experiência deve conter entre 5 e 5000 caracteres.');
      isValid = false;
    } else {
      setFieldSuccess(inputs.experiencia);
    }

    return isValid;
  }

  // Funções visuais auxiliares de erros
  function setFieldError(inputEl, errorId, message) {
    inputEl.classList.add('is-invalid');
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = message;
    }
  }

  function setFieldSuccess(inputEl) {
    inputEl.classList.add('is-valid');
  }

  function clearFieldError(inputEl, errorId) {
    inputEl.classList.remove('is-invalid');
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = '';
    }
  }

  function resetForm() {
    forms.create.reset();
    charCounter.textContent = '0';
    charCounter.style.color = 'var(--color-text-muted)';
    
    Object.keys(inputs).forEach(key => {
      if (inputs[key] && key !== 'search') {
        inputs[key].classList.remove('is-invalid', 'is-valid');
        const errEl = document.getElementById(`error-${key}`);
        if (errEl) errEl.textContent = '';
      }
    });
  }

  // Submissão AJAX segura contendo token anti-CSRF no Header
  async function submitForm() {
    const submitBtn = document.getElementById('btn-submit-curriculo');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processando...';

    const payload = {
      nome: inputs.nome.value.trim(),
      email: inputs.email.value.trim(),
      telefone: inputs.telefone.value.trim() || null,
      web_address: inputs.web.value.trim() || null,
      experiencia: inputs.experiencia.value.trim()
    };

    try {
      const response = await fetchWithTimeout('/api/curriculos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ocorreu um erro ao processar o cadastro.');
      }

      showToast(data.message || 'Currículo cadastrado com sucesso!', 'success');
      resetForm();
      showScreen('list');
    } catch (err) {
      showToast(err.message || 'Erro de rede ao salvar currículo.', 'error');
      // Atualiza token CSRF para a próxima tentativa caso tenha expirado/falhado
      fetchCsrfToken();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Salvar Currículo Seguro';
    }
  }
});
