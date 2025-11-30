// app.js — Versão 9.2 (Correção PWA)

"use strict";

// --- REGISTRO DO SERVICE WORKER CORRIGIDO PARA PWA ---
// A base URL é o caminho até a pasta do index.html (ex: /repo-name/)
// Isso é crucial para o GitHub Pages ou qualquer subdiretório de deploy,
// pois o Service Worker precisa do caminho completo, incluindo o nome do repositório.
const BASE_PATH = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

if ('serviceWorker' in navigator) {
  // Aguarda a página carregar completamente
  window.addEventListener('load', function() {
    // Limpa service workers antigos
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (let registration of registrations) {
        registration.unregister();
        console.log('Service Worker antigo removido');
      }

      // Registra o novo service worker usando o BASE_PATH dinâmico
      navigator.serviceWorker.register(BASE_PATH + 'service-worker.js', { scope: BASE_PATH })
        .then(function(registration) {
          console.log('✅ Service Worker registrado com sucesso no escopo:', registration.scope);

          // Verifica se há uma nova versão
          registration.update();
        })
        .catch(function(error) {
          console.log('❌ Falha no registro do Service Worker:', error);
          console.error('Caminho de registro tentado:', BASE_PATH + 'service-worker.js', 'Escopo tentado:', BASE_PATH);
        });
    });
  });
}

// --- VERIFICAÇÃO DE CONECTIVIDADE ---
function initConnectivity() {
    // Eventos online/offline
    window.addEventListener('online', function() {
        console.log('🌐 Conectado à internet');
        document.body.classList.remove('offline');
        showToast('Conexão restaurada!', 'success');
    });

    window.addEventListener('offline', function() {
        console.log('📴 Desconectado da internet');
        document.body.classList.add('offline');
        showToast('Modo Offline Ativo!', 'warning');
    });

    // Estado inicial
    if (!navigator.onLine) {
        document.body.classList.add('offline');
        showToast('Modo Offline Ativo!', 'warning');
    }
}

// --- VARIÁVEIS GLOBAIS ---
// Estado global da aplicação
let appState = {
    currentModule: 'home', // 'home', 'quiz', 'flashcards', 'cronograma', 'ajuda'
    currentQuiz: null, // Índice da pergunta atual no quiz
    quizData: [], // Dados do quiz carregado (perguntas com tags)
    flashcardData: [], // Dados dos flashcards
    quizMode: 'normal', // 'normal' ou 'revisao'
    flashcardStudyData: {
        currentCardIndex: 0,
        cardsToStudy: [],
        studySet: 'all' // all, tag:<tag_name>
    },
    filterTag: null,
    totalQuestions: 0,
    dailyGoal: 0, // Meta diária de perguntas resolvidas
    stats: {
        totalCorrect: 0,
        totalAttempted: 0,
        correctByTag: {},
        attemptedByTag: {},
        correctByDisciplina: {},
        attemptedByDisciplina: {},
        dailyProgress: {}, // { 'YYYY-MM-DD': count }
    },
    cronograma: {
        materias: [], // [{ nome, horasPorSemana, cor }]
        dataFim: null,
        semanas: [], // Estrutura para o cronograma gerado
    },
    settings: {
        theme: 'dark' // 'dark' ou 'light'
    },
};

// Nomes de variáveis para localStorage
const STORAGE_KEY_QUIZ = 'mindforge_quizData';
const STORAGE_KEY_FLASHCARDS = 'mindforge_flashcardData';
const STORAGE_KEY_STATS = 'mindforge_stats';
const STORAGE_KEY_GOAL = 'mindforge_dailyGoal';
const STORAGE_KEY_CRONOGRAMA = 'mindforge_cronograma';
const STORAGE_KEY_SETTINGS = 'mindforge_settings';

// Referências a elementos do DOM
const mainContent = document.getElementById('mainContent');
const headerTitle = document.getElementById('headerTitle');
const menuDrawer = document.getElementById('menuDrawer');
const dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
const dailyProgressIcon = document.getElementById('dailyProgressIcon');

// Mapeamento de Cores para o Cronograma
const colors = [
    '#E74C3C', '#3498DB', '#27AE60', '#F39C12', '#9B59B6',
    '#1ABC9C', '#D35400', '#2980B9', '#8E44AD', '#C0392B'
];
let colorIndex = 0;

// --- FUNÇÕES DE UTILIDADE ---

/**
 * Exibe um toast (notificação temporária).
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de notificação ('success', 'warning', 'danger', 'info').
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

/**
 * Salva o estado da aplicação no localStorage.
 */
function saveState() {
    localStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(appState.quizData));
    localStorage.setItem(STORAGE_KEY_FLASHCARDS, JSON.stringify(appState.flashcardData));
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(appState.stats));
    localStorage.setItem(STORAGE_KEY_GOAL, appState.dailyGoal.toString());
    localStorage.setItem(STORAGE_KEY_CRONOGRAMA, JSON.stringify(appState.cronograma));
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(appState.settings));
}

/**
 * Carrega o estado da aplicação do localStorage.
 */
function loadState() {
    // Carregar dados de perguntas (quiz)
    const storedQuiz = localStorage.getItem(STORAGE_KEY_QUIZ);
    if (storedQuiz) {
        try {
            appState.quizData = JSON.parse(storedQuiz);
            appState.totalQuestions = appState.quizData.length;
        } catch (e) {
            console.error("Erro ao carregar dados do Quiz", e);
            appState.quizData = [];
        }
    }

    // Carregar flashcards
    const storedFlashcards = localStorage.getItem(STORAGE_KEY_FLASHCARDS);
    if (storedFlashcards) {
        try {
            appState.flashcardData = JSON.parse(storedFlashcards);
        } catch (e) {
            console.error("Erro ao carregar Flashcards", e);
            appState.flashcardData = [];
        }
    }

    // Carregar estatísticas
    const storedStats = localStorage.getItem(STORAGE_KEY_STATS);
    if (storedStats) {
        try {
            appState.stats = JSON.parse(storedStats);
            // Limpa o progresso diário se o dia mudou
            const today = new Date().toISOString().slice(0, 10);
            if (!appState.stats.dailyProgress[today]) {
                appState.stats.dailyProgress = {}; // Limpa os anteriores, mantém apenas o atual
                appState.stats.dailyProgress[today] = 0;
            }
        } catch (e) {
            console.error("Erro ao carregar estatísticas", e);
            appState.stats = { totalCorrect: 0, totalAttempted: 0, correctByTag: {}, attemptedByTag: {}, correctByDisciplina: {}, attemptedByDisciplina: {}, dailyProgress: {} };
        }
    }

    // Carregar meta diária
    const storedGoal = localStorage.getItem(STORAGE_KEY_GOAL);
    appState.dailyGoal = storedGoal ? parseInt(storedGoal) : 10; // Meta padrão de 10

    // Carregar cronograma
    const storedCronograma = localStorage.getItem(STORAGE_KEY_CRONOGRAMA);
    if (storedCronograma) {
        try {
            const loadedCronograma = JSON.parse(storedCronograma);
            // Corrige o formato da data se for string (para uso com new Date())
            if (loadedCronograma.dataFim) {
                loadedCronograma.dataFim = new Date(loadedCronograma.dataFim);
            }
            appState.cronograma = loadedCronograma;
        } catch (e) {
            console.error("Erro ao carregar cronograma", e);
            appState.cronograma = { materias: [], dataFim: null, semanas: [] };
        }
    }

    // Carregar configurações
    const storedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (storedSettings) {
        try {
            appState.settings = JSON.parse(storedSettings);
        } catch (e) {
            console.error("Erro ao carregar configurações", e);
            appState.settings = { theme: 'dark' };
        }
    }
}

/**
 * Atualiza a interface de acordo com o estado.
 */
function updateUI() {
    renderMenu();
    updateTheme();
    updateDailyGoalDisplay();

    // Renderiza o módulo atual
    switch (appState.currentModule) {
        case 'home':
            renderHome();
            break;
        case 'quiz':
            renderQuizInterface();
            break;
        case 'flashcards':
            renderFlashcardsModule();
            break;
        case 'flashcardStudy':
            renderFlashcardStudy();
            break;
        case 'cronograma':
            renderCronogramaModule();
            break;
        case 'ajuda':
            renderAjudaModule();
            break;
    }
}

/**
 * Altera o módulo de visualização principal.
 * @param {string} moduleName - Nome do módulo ('home', 'quiz', 'flashcards', 'cronograma', 'ajuda').
 */
function switchModule(moduleName) {
    if (appState.currentModule === 'flashcardStudy' && moduleName !== 'flashcardStudy') {
        // Confirmação para sair do estudo de flashcards
        if (!confirmAction('Tem certeza que deseja sair do modo estudo? O progresso da sessão atual pode ser perdido.')) {
            return;
        }
    }

    appState.currentModule = moduleName;
    // Oculta o drawer
    menuDrawer.classList.remove('open');
    saveState();
    updateUI();
}

/**
 * Função genérica de confirmação que usa um modal ou confirmação nativa.
 * @param {string} message - Mensagem de confirmação.
 * @returns {boolean} - True se confirmado, False caso contrário.
 */
function confirmAction(message) {
    // Neste ambiente limitado, usamos o confirm() nativo, mas em um PWA real seria um modal customizado.
    return window.confirm(message);
}

// --- TEMA E CONFIGURAÇÕES ---

/**
 * Atualiza o tema da aplicação ('dark' ou 'light').
 */
function updateTheme() {
    document.body.className = appState.settings.theme === 'light' ? 'light-mode' : '';
    // Atualiza o texto do botão no menu
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.textContent = appState.settings.theme === 'light' ? 'Modo Escuro' : 'Modo Claro';
    }
}

/**
 * Alterna o tema e salva a preferência.
 */
function toggleTheme() {
    appState.settings.theme = appState.settings.theme === 'dark' ? 'light' : 'dark';
    updateTheme();
    saveState();
}

// --- RENDERIZAÇÃO DO MENU E CABEÇALHO ---

/**
 * Renderiza o menu lateral (Drawer).
 */
function renderMenu() {
    const navItems = document.getElementById('navItems');
    if (!navItems) return;

    // Remove event listeners para evitar duplicação (não é ideal, mas simplifica)
    document.getElementById('btnMenuToggle').onclick = () => menuDrawer.classList.toggle('open');
    document.getElementById('btnCloseDrawer').onclick = () => menuDrawer.classList.remove('open');

    // Cria os botões de navegação
    navItems.innerHTML = `
        <button class="menu-item ${appState.currentModule === 'home' ? 'active' : ''}" onclick="switchModule('home')">
            <i class="fas fa-home"></i> Início
        </button>
        <button class="menu-item ${appState.currentModule === 'quiz' ? 'active' : ''}" onclick="switchModule('quiz')">
            <i class="fas fa-question-circle"></i> Gerenciador de Perguntas
            <span class="count">${appState.totalQuestions}</span>
        </button>
        <button class="menu-item ${appState.currentModule === 'flashcards' ? 'active' : ''}" onclick="switchModule('flashcards')">
            <i class="fas fa-layer-group"></i> Gerenciador de Flashcards
            <span class="count">${appState.flashcardData.length}</span>
        </button>
        <button class="menu-item ${appState.currentModule === 'cronograma' ? 'active' : ''}" onclick="switchModule('cronograma')">
            <i class="fas fa-calendar-alt"></i> Cronograma Inteligente
        </button>
        <button class="menu-item" onclick="document.getElementById('statsModal').showModal()">
            <i class="fas fa-chart-bar"></i> Estatísticas
        </button>
        <button class="menu-item" onclick="switchModule('ajuda')">
            <i class="fas fa-info-circle"></i> Ajuda & Config
        </button>
        <div class="menu-divider"></div>
        <button id="themeToggle" class="menu-item" onclick="toggleTheme()">
            ${appState.settings.theme === 'light' ? '<i class="fas fa-moon"></i> Modo Escuro' : '<i class="fas fa-sun"></i> Modo Claro'}
        </button>
    `;

    // Adiciona o evento de fechar ao clicar fora do drawer
    document.addEventListener('click', (e) => {
        if (menuDrawer.classList.contains('open') && !menuDrawer.contains(e.target) && e.target !== document.getElementById('btnMenuToggle')) {
            menuDrawer.classList.remove('open');
        }
    });

    // Renderiza as estatísticas no modal (já que o botão está aqui)
    renderStatsModal();
}

// --- GESTÃO DE METAS DIÁRIAS ---

/**
 * Atualiza a meta diária.
 * @param {number} newGoal - Novo valor da meta.
 */
function updateDailyGoalTarget(newGoal) {
    appState.dailyGoal = parseInt(newGoal);
    if (isNaN(appState.dailyGoal) || appState.dailyGoal < 1) {
        appState.dailyGoal = 10;
    }
    saveState();
    updateDailyGoalDisplay();
    showToast(`Meta diária atualizada para ${appState.dailyGoal} perguntas/dia!`, 'success');
}

/**
 * Incrementa o progresso diário e salva.
 */
function incrementDailyProgress() {
    const today = new Date().toISOString().slice(0, 10);
    if (!appState.stats.dailyProgress[today]) {
        appState.stats.dailyProgress[today] = 0;
    }
    appState.stats.dailyProgress[today]++;
    saveState();
    updateDailyGoalDisplay();
}

/**
 * Atualiza a exibição da meta diária no cabeçalho.
 */
function updateDailyGoalDisplay() {
    const today = new Date().toISOString().slice(0, 10);
    const progress = appState.stats.dailyProgress[today] || 0;
    const goal = appState.dailyGoal;
    const percentage = goal > 0 ? Math.min(100, (progress / goal) * 100) : 0;

    dailyGoalDisplay.textContent = `${progress}/${goal}`;

    // Atualiza o ícone de progresso (círculo)
    dailyProgressIcon.style.backgroundImage = `conic-gradient(
        var(--success) 0% ${percentage}%,
        var(--border) ${percentage}% 100%
    )`;

    // Se a meta foi atingida
    if (progress >= goal) {
        dailyProgressIcon.classList.add('completed');
    } else {
        dailyProgressIcon.classList.remove('completed');
    }
}

// --- MÓDULO INÍCIO ---

/**
 * Renderiza a tela inicial.
 */
function renderHome() {
    headerTitle.textContent = 'MindForge - Forjando Conhecimento';

    const today = new Date().toISOString().slice(0, 10);
    const progress = appState.stats.dailyProgress[today] || 0;
    const goal = appState.dailyGoal;
    const progressText = progress >= goal ? 'Meta diária concluída! 🎉' : `Faltam ${goal - progress} para atingir sua meta.`;
    const totalFlashcards = appState.flashcardData.length;
    const totalQuizQuestions = appState.quizData.length;

    mainContent.innerHTML = `
        <section class="module-home">
            <h2 class="section-title">Bem-vindo(a) ao MindForge!</h2>

            <div class="summary-cards">
                <div class="card" onclick="switchModule('cronograma')">
                    <i class="fas fa-calendar-alt icon-large accent"></i>
                    <h3>Cronograma</h3>
                    <p>${appState.cronograma.materias.length > 0 ? 'Cronograma Ativo' : 'Configure seu Cronograma'}</p>
                </div>
                <div class="card" onclick="switchModule('quiz')">
                    <i class="fas fa-question-circle icon-large primary"></i>
                    <h3>Banco de Perguntas</h3>
                    <p>${totalQuizQuestions} Questões Cadastradas</p>
                </div>
                <div class="card" onclick="switchModule('flashcards')">
                    <i class="fas fa-layer-group icon-large primary"></i>
                    <h3>Flashcards</h3>
                    <p>${totalFlashcards} Flashcards Cadastrados</p>
                </div>
                <div class="card" onclick="document.getElementById('statsModal').showModal()">
                    <i class="fas fa-chart-bar icon-large success"></i>
                    <h3>Seu Progresso Hoje</h3>
                    <p>${progress} de ${goal} | ${progressText}</p>
                </div>
            </div>

            <div class="home-actions">
                <button class="btn primary large" onclick="initQuiz()">
                    <i class="fas fa-brain"></i> Iniciar Quiz de Prática
                </button>
                <button class="btn accent large" onclick="startFlashcardStudy()">
                    <i class="fas fa-pencil-alt"></i> Iniciar Estudo de Flashcards
                </button>
            </div>

            <div class="help-links">
                <p>Novo por aqui? <a href="#" onclick="switchModule('ajuda'); return false;">Veja o Guia Rápido</a></p>
            </div>
        </section>
    `;
}

// --- MÓDULO GERENCIADOR DE PERGUNTAS (QUIZ) ---

/**
 * Renderiza a interface do gerenciador de perguntas.
 */
function renderQuizInterface() {
    headerTitle.textContent = 'Gerenciador de Perguntas';
    appState.currentQuiz = null; // Reseta o estado do quiz

    const tags = getUniqueTags(appState.quizData.concat(appState.flashcardData)); // Combina tags
    const tagOptions = tags.map(tag => `<option value="${tag}">${tag}</option>`).join('');

    mainContent.innerHTML = `
        <section class="module-quiz">
            <div class="controls-bar">
                <button class="btn primary" onclick="renderAddQuestionForm()">
                    <i class="fas fa-plus-circle"></i> Adicionar Pergunta
                </button>
                <button class="btn accent" onclick="initQuiz()">
                    <i class="fas fa-brain"></i> Iniciar Treino
                </button>
                <div class="filter-group">
                    <select id="tagFilter" onchange="filterByTag(this.value)">
                        <option value="">Filtrar por Tag (Todos)</option>
                        ${tagOptions}
                    </select>
                </div>
            </div>

            <div id="quizListContainer" class="list-container">
                <!-- Lista de perguntas será renderizada aqui -->
            </div>

            <div id="paginationControls" class="pagination-controls">
                <!-- Controles de paginação aqui -->
            </div>
        </section>
    `;

    renderQuizList();
}

/**
 * Renderiza o formulário de adição/edição de pergunta.
 * @param {object} [question] - Pergunta a ser editada (opcional).
 */
function renderAddQuestionForm(question = null) {
    headerTitle.textContent = question ? 'Editar Pergunta' : 'Adicionar Nova Pergunta';

    const isEdit = !!question;
    const tags = getUniqueTags(appState.quizData.concat(appState.flashcardData)); // Tags existentes
    const currentTags = question ? (question.tags || []).join(', ') : '';

    mainContent.innerHTML = `
        <section class="module-form">
            <h2 class="section-title">${isEdit ? 'Editar Pergunta' : 'Adicionar Pergunta'}</h2>

            <form id="questionForm" class="data-form">
                <div class="form-group">
                    <label for="disciplina">Disciplina/Matéria:</label>
                    <input type="text" id="disciplina" value="${question ? (question.disciplina || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label for="enunciado">Enunciado/Pergunta:</label>
                    <textarea id="enunciado" rows="4" required>${question ? question.enunciado : ''}</textarea>
                </div>

                <div class="form-group">
                    <label>Opções (Marque a correta):</label>
                    <div id="optionsContainer">
                        <!-- Opções serão adicionadas aqui -->
                    </div>
                    <button type="button" class="btn secondary small" onclick="addOptionField()">Adicionar Opção</button>
                </div>

                <div class="form-group">
                    <label for="resolucao">Resolução/Explicação:</label>
                    <textarea id="resolucao" rows="4">${question ? question.resolucao : ''}</textarea>
                </div>

                <div class="form-group">
                    <label for="tags">Tags (Separadas por vírgula):</label>
                    <input type="text" id="tags" value="${currentTags}">
                    <div class="tag-suggestions" id="tagSuggestions">
                        ${tags.map(tag => `<span class="tag suggestion-tag" onclick="selectTag('${tag}')">${tag}</span>`).join('')}
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn primary">
                        ${isEdit ? '<i class="fas fa-save"></i> Salvar Edição' : '<i class="fas fa-plus-circle"></i> Adicionar'}
                    </button>
                    <button type="button" class="btn secondary" onclick="renderQuizInterface()">
                        <i class="fas fa-times-circle"></i> Cancelar
                    </button>
                </div>
            </form>
        </section>
    `;

    // Função para adicionar campos de opção e preencher se for edição
    function addOptionField(text = '', isCorrect = false) {
        const container = document.getElementById('optionsContainer');
        const index = container.children.length;
        const div = document.createElement('div');
        div.className = 'option-field';
        div.innerHTML = `
            <input type="radio" name="correctOption" id="correct${index}" value="${index}" ${isCorrect ? 'checked' : ''} required>
            <input type="text" id="option${index}" value="${text}" placeholder="Texto da Opção ${index + 1}" required>
            <label for="correct${index}" class="radio-label">Correta</label>
            <button type="button" class="btn danger small" onclick="this.parentElement.remove()">Remover</button>
        `;
        container.appendChild(div);
    }

    // Preenche opções se for edição
    if (question && question.opcoes) {
        question.opcoes.forEach((opt, index) => {
            addOptionField(opt.texto, opt.correta);
        });
    } else {
        // Adiciona 3 opções padrão para nova pergunta
        addOptionField();
        addOptionField();
        addOptionField();
    }

    // Adiciona o listener para o formulário
    document.getElementById('questionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveQuestion(question ? question.id : null);
    });
}

/**
 * Salva uma nova pergunta ou edita uma existente.
 * @param {string} [id] - ID da pergunta a ser editada (opcional).
 */
function saveQuestion(id = null) {
    const disciplina = document.getElementById('disciplina').value.trim();
    const enunciado = document.getElementById('enunciado').value.trim();
    const resolucao = document.getElementById('resolucao').value.trim();
    const tagsInput = document.getElementById('tags').value;
    const tags = tagsInput.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);

    const optionsContainer = document.getElementById('optionsContainer');
    const optionFields = optionsContainer.querySelectorAll('.option-field');

    if (optionFields.length < 2) {
        showToast('Adicione pelo menos duas opções.', 'danger');
        return;
    }

    let correctIndex = -1;
    const opcoes = Array.from(optionFields).map((field, index) => {
        const inputRadio = field.querySelector(`input[name="correctOption"]`);
        const inputText = field.querySelector(`input[id="option${index}"]`);

        if (inputRadio.checked) {
            correctIndex = index;
        }

        return {
            texto: inputText.value.trim(),
            correta: inputRadio.checked
        };
    });

    if (correctIndex === -1) {
        showToast('Marque uma opção como a correta.', 'danger');
        return;
    }

    const newQuestion = {
        id: id || crypto.randomUUID(),
        disciplina: disciplina,
        enunciado: enunciado,
        opcoes: opcoes,
        resolucao: resolucao,
        tags: tags,
        dataCriacao: id ? appState.quizData.find(q => q.id === id).dataCriacao : new Date().toISOString(),
        ultimaRevisao: new Date().toISOString(),
        acertosConsecutivos: id ? (appState.quizData.find(q => q.id === id).acertosConsecutivos || 0) : 0
    };

    if (id) {
        // Edição
        const index = appState.quizData.findIndex(q => q.id === id);
        if (index !== -1) {
            appState.quizData[index] = newQuestion;
            showToast('Pergunta editada com sucesso!', 'success');
        }
    } else {
        // Nova pergunta
        appState.quizData.push(newQuestion);
        appState.totalQuestions++;
        showToast('Pergunta adicionada com sucesso!', 'success');
    }

    saveState();
    renderQuizInterface();
}

/**
 * Filtra a lista de perguntas por tag.
 * @param {string} tag - A tag para filtrar.
 */
function filterByTag(tag) {
    appState.filterTag = tag || null;
    document.getElementById('tagFilter').value = tag || '';
    renderQuizList();
}

/**
 * Renderiza a lista de perguntas na interface do gerenciador.
 */
function renderQuizList() {
    const container = document.getElementById('quizListContainer');
    const paginationControls = document.getElementById('paginationControls');
    if (!container || !paginationControls) return;

    // Filtra as perguntas
    const filteredQuestions = appState.quizData.filter(q =>
        !appState.filterTag || (q.tags && q.tags.includes(appState.filterTag.toLowerCase()))
    );

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage);
    let currentPage = parseInt(container.dataset.currentPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    container.dataset.currentPage = currentPage;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedQuestions = filteredQuestions.slice(start, end);

    let html = '';
    if (filteredQuestions.length === 0) {
        html = '<p class="empty-state">Nenhuma pergunta encontrada. Adicione uma nova ou ajuste o filtro.</p>';
    } else {
        html = paginatedQuestions.map(q => {
            const isRevisao = q.acertosConsecutivos < 3;
            const statusClass = isRevisao ? 'revisao-tag' : 'dominada-tag';
            const statusText = isRevisao ? 'REVISAR' : 'DOMINADA';

            return `
                <div class="list-item question-item card">
                    <div class="item-header">
                        <span class="disciplina-tag" style="background-color: ${stringToColor(q.disciplina)};">${q.disciplina}</span>
                        <span class="status-tag ${statusClass}">${statusText} (${q.acertosConsecutivos || 0})</span>
                    </div>
                    <p class="item-content">${q.enunciado.substring(0, 150)}...</p>
                    <div class="item-tags">
                        ${(q.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="item-actions">
                        <button class="btn info small" onclick="editQ('${q.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn danger small" onclick="delQ('${q.id}')">
                            <i class="fas fa-trash-alt"></i> Excluir
                        </button>
                        <button class="btn secondary small" onclick="copyQuestion('${q.id}')">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                        <button class="btn warning small" onclick="toggleRevisao('${q.id}', ${isRevisao})">
                            <i class="fas fa-sync-alt"></i> ${isRevisao ? 'Marcar como Dominada' : 'Voltar para Revisão'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = html;

    // Renderiza controles de paginação
    paginationControls.innerHTML = `
        <button class="btn secondary" onclick="changePage(${currentPage - 1}, ${totalPages}, 'quizListContainer')" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Anterior
        </button>
        <span>Página ${currentPage} de ${totalPages} (${filteredQuestions.length} questões)</span>
        <button class="btn secondary" onclick="changePage(${currentPage + 1}, ${totalPages}, 'quizListContainer')" ${currentPage >= totalPages ? 'disabled' : ''}>
            Próxima <i class="fas fa-chevron-right"></i>
        </button>
    `;
}

/**
 * Altera a página da lista.
 * @param {number} newPage - O novo número da página.
 * @param {number} totalPages - Total de páginas.
 * @param {string} containerId - ID do container para armazenar o estado da página.
 */
function changePage(newPage, totalPages, containerId) {
    if (newPage >= 1 && newPage <= totalPages) {
        document.getElementById(containerId).dataset.currentPage = newPage;
        renderQuizList(); // Re-renderiza a lista de perguntas
    }
}

/**
 * Edita uma pergunta.
 * @param {string} id - ID da pergunta.
 */
function editQ(id) {
    const question = appState.quizData.find(q => q.id === id);
    if (question) {
        renderAddQuestionForm(question);
    }
}

/**
 * Exclui uma pergunta.
 * @param {string} id - ID da pergunta.
 */
function delQ(id) {
    if (confirmAction('Tem certeza que deseja excluir esta pergunta?')) {
        appState.quizData = appState.quizData.filter(q => q.id !== id);
        appState.totalQuestions = appState.quizData.length;
        saveState();
        showToast('Pergunta excluída.', 'success');
        renderQuizInterface();
    }
}

/**
 * Copia o enunciado e a resolução da pergunta para o clipboard.
 * @param {string} id - ID da pergunta.
 */
function copyQuestion(id) {
    const question = appState.quizData.find(q => q.id === id);
    if (question) {
        const textToCopy = `Disciplina: ${question.disciplina}\n\nPergunta: ${question.enunciado}\n\nResolução: ${question.resolucao}`;
        // Não podemos usar navigator.clipboard.writeText devido a restrições de iframe, usamos a alternativa.
        try {
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Pergunta copiada para a área de transferência!', 'info');
        } catch (err) {
            showToast('Não foi possível copiar o texto automaticamente.', 'warning');
            console.error('Erro ao copiar:', err);
        }
    }
}

/**
 * Alterna o estado de revisão de uma pergunta.
 * @param {string} id - ID da pergunta.
 * @param {boolean} currentlyInRevisao - Se a pergunta está atualmente em revisão.
 */
function toggleRevisao(id, currentlyInRevisao) {
    const question = appState.quizData.find(q => q.id === id);
    if (question) {
        if (currentlyInRevisao) {
            // Marcar como Dominada (acertos suficientes para sair da revisão)
            question.acertosConsecutivos = 3;
            showToast('Pergunta marcada como Dominada!', 'success');
        } else {
            // Voltar para Revisão
            question.acertosConsecutivos = 0;
            showToast('Pergunta marcada para Revisão!', 'warning');
        }
        question.ultimaRevisao = new Date().toISOString();
        saveState();
        renderQuizInterface();
    }
}

// --- MÓDULO TREINO (QUIZ) ---

/**
 * Inicializa um novo treino/quiz.
 */
function initQuiz() {
    // 1. Define o modo (Normal ou Revisão)
    const allQuestions = appState.quizData;
    const revisaoQuestions = allQuestions.filter(q => (q.acertosConsecutivos || 0) < 3);

    // Se houver perguntas de revisão, prioriza elas (70% de chance)
    if (revisaoQuestions.length > 0 && Math.random() < 0.7) {
        appState.quizData = revisaoQuestions.sort(() => 0.5 - Math.random());
        appState.quizMode = 'revisao';
        showToast(`Iniciando Treino de Revisão com ${revisaoQuestions.length} perguntas!`, 'warning');
    } else if (allQuestions.length > 0) {
        // Senão, pega um conjunto aleatório de 10 perguntas, incluindo as de revisão, para treino normal
        const totalSample = 10;
        const sampleSize = Math.min(totalSample, allQuestions.length);

        // Embaralha todas as perguntas
        const shuffled = allQuestions.sort(() => 0.5 - Math.random());
        // Pega as primeiras do embaralhamento
        appState.quizData = shuffled.slice(0, sampleSize);
        appState.quizMode = 'normal';
        showToast(`Iniciando Treino Normal com ${appState.quizData.length} perguntas.`, 'info');
    } else {
        showToast('Nenhuma pergunta cadastrada para iniciar o treino!', 'danger');
        return;
    }

    appState.currentQuiz = 0;
    appState.currentModule = 'quiz';
    renderQuizInterface(); // Chama para mudar o módulo
    renderQuizQuestion(); // Renderiza a primeira pergunta
}

/**
 * Renderiza a pergunta atual do quiz.
 */
function renderQuizQuestion() {
    if (appState.currentQuiz === null || appState.currentQuiz >= appState.quizData.length) {
        renderQuizEnd();
        return;
    }

    headerTitle.textContent = `Treino (${appState.currentQuiz + 1}/${appState.quizData.length})`;
    const question = appState.quizData[appState.currentQuiz];

    let optionsHtml = question.opcoes.map((opt, index) => `
        <button class="quiz-option" id="option-${index}" onclick="checarResposta(${index})">${String.fromCharCode(65 + index)}. ${opt.texto}</button>
    `).join('');

    mainContent.innerHTML = `
        <section class="module-quiz-active">
            <div class="card quiz-card">
                <div class="quiz-header">
                    <span class="disciplina-tag" style="background-color: ${stringToColor(question.disciplina)};">${question.disciplina}</span>
                    <span class="status-tag ${question.acertosConsecutivos < 3 ? 'revisao-tag' : 'dominada-tag'}">
                        Status: ${question.acertosConsecutivos < 3 ? 'Revisão' : 'Dominada'} (${question.acertosConsecutivos || 0})
                    </span>
                </div>
                <h3 class="quiz-question">${question.enunciado}</h3>

                <div class="quiz-options-container" id="quizOptionsContainer">
                    ${optionsHtml}
                </div>

                <div id="quizFeedback" class="quiz-feedback-box" style="display: none;">
                    <!-- Feedback e resolução aparecem aqui -->
                </div>
            </div>

            <div class="quiz-controls-active">
                <button id="btnPular" class="btn secondary" onclick="pularPergunta()">
                    <i class="fas fa-forward"></i> Pular
                </button>
                <button id="btnExit" class="btn danger" onclick="sairTreino()">
                    <i class="fas fa-times"></i> Sair do Treino
                </button>
            </div>
        </section>
    `;
}

/**
 * Checa a resposta do usuário.
 * @param {number} selectedIndex - Índice da opção selecionada.
 */
function checarResposta(selectedIndex) {
    const question = appState.quizData[appState.currentQuiz];
    const optionsContainer = document.getElementById('quizOptionsContainer');
    const feedbackBox = document.getElementById('quizFeedback');
    const selectedOptionButton = document.getElementById(`option-${selectedIndex}`);
    const isCorrect = question.opcoes[selectedIndex].correta;

    // Desabilita as opções após a escolha
    Array.from(optionsContainer.children).forEach(btn => btn.disabled = true);

    // Atualiza o feedback e o estilo dos botões
    if (isCorrect) {
        selectedOptionButton.classList.add('correct-answer');
        feedbackBox.innerHTML = '<p class="success-message"><i class="fas fa-check-circle"></i> Resposta Correta! Parabéns.</p>';
        updateStats(question, true);
        incrementDailyProgress();
    } else {
        selectedOptionButton.classList.add('wrong-answer');
        const correctIndex = question.opcoes.findIndex(opt => opt.correta);
        document.getElementById(`option-${correctIndex}`).classList.add('correct-answer-highlight');
        feedbackBox.innerHTML = '<p class="danger-message"><i class="fas fa-times-circle"></i> Resposta Incorreta. Revise a explicação.</p>';
        updateStats(question, false);
    }

    feedbackBox.style.display = 'block';

    // Adiciona o botão de resolução e próxima
    feedbackBox.innerHTML += `
        <button class="btn info small" id="btnMostrarResolucao" onclick="mostrarResolucao('${question.id}')">
            <i class="fas fa-book-open"></i> Ver Resolução
        </button>
        <button class="btn primary small" onclick="proximaPergunta()">
            <i class="fas fa-arrow-right"></i> Próxima Pergunta
        </button>
    `;
}

/**
 * Exibe a resolução/explicação da pergunta.
 * @param {string} id - ID da pergunta.
 */
function mostrarResolucao(id) {
    const question = appState.quizData.find(q => q.id === id);
    const feedbackBox = document.getElementById('quizFeedback');
    if (feedbackBox && question) {
        let resolucaoHtml = `
            <div class="resolution-content">
                <h4>Resolução/Explicação:</h4>
                <p>${question.resolucao || 'Nenhuma resolução fornecida.'}</p>
            </div>
        `;
        // Evita duplicar a resolução se já foi exibida
        if (!feedbackBox.querySelector('.resolution-content')) {
            feedbackBox.insertAdjacentHTML('beforeend', resolucaoHtml);
            document.getElementById('btnMostrarResolucao').style.display = 'none';
        }
    }
}

/**
 * Avança para a próxima pergunta.
 */
function proximaPergunta() {
    appState.currentQuiz++;
    renderQuizQuestion();
}

/**
 * Pula a pergunta atual (conta como erro, mas não conta como tentativa).
 */
function pularPergunta() {
    if (confirmAction('Tem certeza que deseja pular esta pergunta?')) {
        // Conta como erro, mas sem afetar o progresso diário de acertos
        // Apenas para fins de contagem de acertos consecutivos (para forçar revisão)
        updateStats(appState.quizData[appState.currentQuiz], false, true);
        proximaPergunta();
    }
}

/**
 * Finaliza o treino.
 */
function sairTreino() {
    if (confirmAction('Tem certeza que deseja finalizar o treino?')) {
        appState.currentQuiz = null;
        switchModule('home');
    }
}

/**
 * Renderiza a tela de fim de quiz.
 */
function renderQuizEnd() {
    headerTitle.textContent = 'Treino Finalizado!';
    const total = appState.quizData.length;
    const correctCount = appState.quizData.filter(q => q.acertoSessao).length;
    const percentage = total > 0 ? (correctCount / total * 100).toFixed(1) : 0;

    mainContent.innerHTML = `
        <section class="module-quiz-end">
            <div class="card end-summary">
                <h2>Parabéns! Você concluiu o treino.</h2>
                <div class="result-stats">
                    <p class="stat-item success"><i class="fas fa-check-circle"></i> Acertos: <span>${correctCount}</span></p>
                    <p class="stat-item danger"><i class="fas fa-times-circle"></i> Erros: <span>${total - correctCount}</span></p>
                    <p class="stat-item primary"><i class="fas fa-percent"></i> Taxa de Acerto: <span>${percentage}%</span></p>
                    <p class="stat-item info"><i class="fas fa-layer-group"></i> Total de Perguntas: <span>${total}</span></p>
                </div>
            </div>

            <div class="end-actions">
                <button class="btn primary large" onclick="initQuiz()">
                    <i class="fas fa-redo"></i> Novo Treino
                </button>
                <button class="btn secondary large" onclick="switchModule('home')">
                    <i class="fas fa-home"></i> Voltar para o Início
                </button>
            </div>
        </section>
    `;

    appState.currentQuiz = null; // Finaliza o estado do quiz
    saveState();
}

// --- GESTÃO DE ESTATÍSTICAS ---

/**
 * Atualiza as estatísticas de acertos/erros.
 * @param {object} question - A pergunta respondida.
 * @param {boolean} isCorrect - Se a resposta foi correta.
 * @param {boolean} isSkipped - Se a pergunta foi pulada (não conta como tentativa normal).
 */
function updateStats(question, isCorrect, isSkipped = false) {
    const disciplina = question.disciplina || 'Geral';
    const tags = question.tags || ['geral'];

    // 1. Atualiza acertos consecutivos no objeto original da pergunta (para controle de revisão)
    const originalQuestion = appState.quizData.find(q => q.id === question.id);
    if (originalQuestion) {
        if (isCorrect) {
            originalQuestion.acertosConsecutivos = (originalQuestion.acertosConsecutivos || 0) + 1;
            originalQuestion.ultimaRevisao = new Date().toISOString();
        } else {
            // Se errou ou pulou, volta para 0
            originalQuestion.acertosConsecutivos = 0;
            originalQuestion.ultimaRevisao = new Date().toISOString();
        }
    }

    // Marca o acerto na sessão para o relatório final
    question.acertoSessao = isCorrect;

    if (!isSkipped) {
        // 2. Atualiza estatísticas globais (só se não for pulada)
        appState.stats.totalAttempted++;
        if (isCorrect) {
            appState.stats.totalCorrect++;
        }

        // 3. Estatísticas por Disciplina
        appState.stats.attemptedByDisciplina[disciplina] = (appState.stats.attemptedByDisciplina[disciplina] || 0) + 1;
        if (isCorrect) {
            appState.stats.correctByDisciplina[disciplina] = (appState.stats.correctByDisciplina[disciplina] || 0) + 1;
        }

        // 4. Estatísticas por Tag
        tags.forEach(tag => {
            appState.stats.attemptedByTag[tag] = (appState.stats.attemptedByTag[tag] || 0) + 1;
            if (isCorrect) {
                appState.stats.correctByTag[tag] = (appState.stats.correctByTag[tag] || 0) + 1;
            }
        });
    }

    saveState();
}

/**
 * Calcula a taxa de acerto.
 * @param {number} correct - Número de acertos.
 * @param {number} attempted - Número de tentativas.
 * @returns {string} - Taxa de acerto formatada.
 */
function calculateRate(correct, attempted) {
    if (attempted === 0) return '0.0%';
    return ((correct / attempted) * 100).toFixed(1) + '%';
}

/**
 * Renderiza o conteúdo do modal de estatísticas.
 */
function renderStatsModal() {
    const body = document.getElementById('statsBodyModal');
    if (!body) return;

    // Estatísticas Globais
    const totalCorrect = appState.stats.totalCorrect;
    const totalAttempted = appState.stats.totalAttempted;
    const overallRate = calculateRate(totalCorrect, totalAttempted);

    let globalHtml = `
        <div class="stats-section">
            <h3>Visão Geral</h3>
            <div class="stats-summary-grid">
                <div class="stat-box">
                    <h4>Total de Acertos</h4>
                    <p class="success">${totalCorrect}</p>
                </div>
                <div class="stat-box">
                    <h4>Total de Tentativas</h4>
                    <p class="primary">${totalAttempted}</p>
                </div>
                <div class="stat-box">
                    <h4>Taxa Global de Acerto</h4>
                    <p class="accent">${overallRate}</p>
                </div>
                <div class="stat-box">
                    <h4>Meta Diária</h4>
                    <p class="info">${appState.dailyGoal} perguntas</p>
                </div>
            </div>
        </div>
    `;

    // Estatísticas por Disciplina
    let disciplinaHtml = '<h3>Taxa de Acerto por Disciplina</h3>';
    const disciplinas = Object.keys(appState.stats.attemptedByDisciplina);

    if (disciplinas.length > 0) {
        disciplinaHtml += '<ul class="stats-list">';
        disciplinas.forEach(disciplina => {
            const correct = appState.stats.correctByDisciplina[disciplina] || 0;
            const attempted = appState.stats.attemptedByDisciplina[disciplina] || 0;
            const rate = calculateRate(correct, attempted);

            disciplinaHtml += `
                <li class="stats-item">
                    <span class="disciplina-tag" style="background-color: ${stringToColor(disciplina)};">${disciplina}</span>
                    <span>Acertos: ${correct} / ${attempted}</span>
                    <span class="rate-display">${rate}</span>
                </li>
            `;
        });
        disciplinaHtml += '</ul>';
    } else {
        disciplinaHtml += '<p class="text-muted">Comece a responder perguntas para ver as estatísticas por disciplina.</p>';
    }

    // Estatísticas por Tag
    let tagHtml = '<h3>Taxa de Acerto por Tag</h3>';
    const tags = Object.keys(appState.stats.attemptedByTag);

    if (tags.length > 0) {
        tagHtml += '<ul class="stats-list tag-stats-list">';
        tags.forEach(tag => {
            const correct = appState.stats.correctByTag[tag] || 0;
            const attempted = appState.stats.attemptedByTag[tag] || 0;
            const rate = calculateRate(correct, attempted);

            tagHtml += `
                <li class="stats-item">
                    <span class="tag">${tag}</span>
                    <span>Acertos: ${correct} / ${attempted}</span>
                    <span class="rate-display">${rate}</span>
                </li>
            `;
        });
        tagHtml += '</ul>';
    } else {
        tagHtml += '<p class="text-muted">Adicione tags às suas perguntas para rastrear o desempenho por tópico.</p>';
    }

    body.innerHTML = globalHtml + '<div class="stats-section">' + disciplinaHtml + '</div>' + '<div class="stats-section">' + tagHtml + '</div>';

    // Adiciona evento para fechar o modal
    document.getElementById('btnCloseStats').onclick = () => document.getElementById('statsModal').close();
}

// --- MÓDULO FLASHCARDS ---

/**
 * Renderiza a interface do gerenciador de flashcards.
 */
function renderFlashcardsModule() {
    headerTitle.textContent = 'Gerenciador de Flashcards';

    const tags = getUniqueTags(appState.flashcardData.concat(appState.quizData));
    const tagOptions = tags.map(tag => `<option value="${tag}">${tag}</option>`).join('');

    mainContent.innerHTML = `
        <section class="module-flashcards">
            <div class="controls-bar">
                <button class="btn primary" onclick="renderAddFlashcardForm()">
                    <i class="fas fa-plus-circle"></i> Adicionar Flashcard
                </button>
                <button class="btn accent" onclick="startFlashcardStudy()">
                    <i class="fas fa-pencil-alt"></i> Iniciar Estudo
                </button>
                <div class="filter-group">
                    <select id="tagFilterFc" onchange="filterFcByTag(this.value)">
                        <option value="">Filtrar por Tag (Todos)</option>
                        ${tagOptions}
                    </select>
                </div>
            </div>

            <div id="flashcardListContainer" class="list-container">
                <!-- Lista de flashcards será renderizada aqui -->
            </div>
             <div id="paginationControlsFc" class="pagination-controls">
                <!-- Controles de paginação aqui -->
            </div>
        </section>
    `;

    renderFlashcardList();
}

/**
 * Renderiza o formulário de adição/edição de flashcard.
 * @param {object} [card] - Flashcard a ser editado (opcional).
 */
function renderAddFlashcardForm(card = null) {
    headerTitle.textContent = card ? 'Editar Flashcard' : 'Adicionar Novo Flashcard';

    const isEdit = !!card;
    const tags = getUniqueTags(appState.flashcardData.concat(appState.quizData));
    const currentTags = card ? (card.tags || []).join(', ') : '';

    mainContent.innerHTML = `
        <section class="module-form">
            <h2 class="section-title">${isEdit ? 'Editar Flashcard' : 'Adicionar Flashcard'}</h2>

            <form id="flashcardForm" class="data-form">
                <div class="form-group">
                    <label for="frente">Frente (Pergunta/Conceito):</label>
                    <textarea id="frente" rows="3" required>${card ? card.frente : ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="verso">Verso (Resposta/Definição):</label>
                    <textarea id="verso" rows="4" required>${card ? card.verso : ''}</textarea>
                </div>
                 <div class="form-group">
                    <label for="disciplina_fc">Disciplina/Matéria:</label>
                    <input type="text" id="disciplina_fc" value="${card ? (card.disciplina || '') : ''}" required>
                </div>
                <div class="form-group">
                    <label for="tags_fc">Tags (Separadas por vírgula):</label>
                    <input type="text" id="tags_fc" value="${currentTags}">
                    <div class="tag-suggestions" id="tagSuggestionsFc">
                        ${tags.map(tag => `<span class="tag suggestion-tag" onclick="selectTagFc('${tag}')">${tag}</span>`).join('')}
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn primary">
                        ${isEdit ? '<i class="fas fa-save"></i> Salvar Edição' : '<i class="fas fa-plus-circle"></i> Adicionar'}
                    </button>
                    <button type="button" class="btn secondary" onclick="renderFlashcardsModule()">
                        <i class="fas fa-times-circle"></i> Cancelar
                    </button>
                </div>
            </form>
        </section>
    `;

    document.getElementById('flashcardForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveFlashcard(card ? card.id : null);
    });
}

/**
 * Salva um novo flashcard ou edita um existente.
 * @param {string} [id] - ID do flashcard a ser editado (opcional).
 */
function saveFlashcard(id = null) {
    const frente = document.getElementById('frente').value.trim();
    const verso = document.getElementById('verso').value.trim();
    const disciplina = document.getElementById('disciplina_fc').value.trim();
    const tagsInput = document.getElementById('tags_fc').value;
    const tags = tagsInput.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);

    if (!frente || !verso) {
        showToast('Frente e verso do flashcard são obrigatórios.', 'danger');
        return;
    }

    const newFlashcard = {
        id: id || crypto.randomUUID(),
        frente: frente,
        verso: verso,
        disciplina: disciplina,
        tags: tags,
        // Espaçamento de Repetição Otimizada (Spaced Repetition System - SRS)
        proxRevisao: id ? appState.flashcardData.find(c => c.id === id).proxRevisao : new Date().toISOString(),
        interval: id ? appState.flashcardData.find(c => c.id === id).interval : 0,
        ef: id ? appState.flashcardData.find(c => c.id === id).ef : 2.5, // Fator de facilidade
    };

    if (id) {
        // Edição
        const index = appState.flashcardData.findIndex(c => c.id === id);
        if (index !== -1) {
            appState.flashcardData[index] = newFlashcard;
            showToast('Flashcard editado com sucesso!', 'success');
        }
    } else {
        // Novo flashcard
        appState.flashcardData.push(newFlashcard);
        showToast('Flashcard adicionado com sucesso!', 'success');
    }

    saveState();
    renderFlashcardsModule();
}

/**
 * Filtra a lista de flashcards por tag.
 * @param {string} tag - A tag para filtrar.
 */
function filterFcByTag(tag) {
    const container = document.getElementById('flashcardListContainer');
    container.dataset.filterTag = tag || '';
    document.getElementById('tagFilterFc').value = tag || '';
    renderFlashcardList();
}

/**
 * Renderiza a lista de flashcards na interface do gerenciador.
 */
function renderFlashcardList() {
    const container = document.getElementById('flashcardListContainer');
    const paginationControls = document.getElementById('paginationControlsFc');
    if (!container || !paginationControls) return;

    const filterTag = container.dataset.filterTag || '';

    // Filtra os flashcards
    const filteredCards = appState.flashcardData.filter(c =>
        !filterTag || (c.tags && c.tags.includes(filterTag.toLowerCase()))
    );

    // Ordena por data de próxima revisão para mostrar o que precisa ser revisado primeiro
    filteredCards.sort((a, b) => new Date(a.proxRevisao) - new Date(b.proxRevisao));

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredCards.length / itemsPerPage);
    let currentPage = parseInt(container.dataset.currentPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    container.dataset.currentPage = currentPage;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedCards = filteredCards.slice(start, end);

    let html = '';
    if (filteredCards.length === 0) {
        html = '<p class="empty-state">Nenhum flashcard encontrado. Adicione um novo ou ajuste o filtro.</p>';
    } else {
        html = paginatedCards.map(c => {
            const needsReview = new Date(c.proxRevisao) <= new Date();
            const statusClass = needsReview ? 'revisao-tag' : 'dominada-tag';
            const statusText = needsReview ? 'REVISAR' : `Próx: ${new Date(c.proxRevisao).toLocaleDateString()}`;

            return `
                <div class="list-item flashcard-item card">
                    <div class="item-header">
                        <span class="disciplina-tag" style="background-color: ${stringToColor(c.disciplina)};">${c.disciplina}</span>
                        <span class="status-tag ${statusClass}">${statusText}</span>
                    </div>
                    <p class="item-content">${c.frente.substring(0, 100)}...</p>
                    <div class="item-tags">
                        ${(c.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="item-actions">
                        <button class="btn info small" onclick="editFC('${c.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn danger small" onclick="delFC('${c.id}')">
                            <i class="fas fa-trash-alt"></i> Excluir
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = html;

    // Renderiza controles de paginação
    paginationControls.innerHTML = `
        <button class="btn secondary" onclick="changePageFc(${currentPage - 1}, ${totalPages})" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Anterior
        </button>
        <span>Página ${currentPage} de ${totalPages} (${filteredCards.length} flashcards)</span>
        <button class="btn secondary" onclick="changePageFc(${currentPage + 1}, ${totalPages})" ${currentPage >= totalPages ? 'disabled' : ''}>
            Próxima <i class="fas fa-chevron-right"></i>
        </button>
    `;
}

/**
 * Altera a página da lista de flashcards.
 * @param {number} newPage - O novo número da página.
 * @param {number} totalPages - Total de páginas.
 */
function changePageFc(newPage, totalPages) {
    const container = document.getElementById('flashcardListContainer');
    if (newPage >= 1 && newPage <= totalPages) {
        container.dataset.currentPage = newPage;
        renderFlashcardList();
    }
}

/**
 * Edita um flashcard.
 * @param {string} id - ID do flashcard.
 */
function editFC(id) {
    const card = appState.flashcardData.find(c => c.id === id);
    if (card) {
        renderAddFlashcardForm(card);
    }
}

/**
 * Exclui um flashcard.
 * @param {string} id - ID do flashcard.
 */
function delFC(id) {
    if (confirmAction('Tem certeza que deseja excluir este flashcard?')) {
        appState.flashcardData = appState.flashcardData.filter(c => c.id !== id);
        saveState();
        showToast('Flashcard excluído.', 'success');
        renderFlashcardsModule();
    }
}

/**
 * Inicia a sessão de estudo de flashcards.
 * @param {string} [studySet='all'] - Conjunto de estudo ('all' ou 'tag:<tag_name>').
 */
function startFlashcardStudy(studySet = 'all') {
    const now = new Date();
    let cardsToStudy = [];

    if (studySet === 'all' || studySet.startsWith('tag:')) {
        let allCards = [...appState.flashcardData]; // Clone

        if (studySet.startsWith('tag:')) {
            const tag = studySet.split(':')[1];
            allCards = allCards.filter(c => c.tags && c.tags.includes(tag.toLowerCase()));
        }

        // Seleciona cards que precisam de revisão (proxRevisao <= now)
        cardsToStudy = allCards.filter(c => new Date(c.proxRevisao) <= now);

        // Se a revisão não for suficiente, adiciona mais cards não revisados
        if (cardsToStudy.length < 10 && allCards.length > cardsToStudy.length) {
            const notReviewed = allCards.filter(c => new Date(c.proxRevisao) > now);
            // Adiciona aleatoriamente para chegar a 10 cards (ou o total disponível)
            const needed = 10 - cardsToStudy.length;
            const randomSample = notReviewed.sort(() => 0.5 - Math.random()).slice(0, needed);
            cardsToStudy = cardsToStudy.concat(randomSample);
        }

        // Embaralha o conjunto final
        cardsToStudy.sort(() => 0.5 - Math.random());
    }

    if (cardsToStudy.length === 0) {
        showToast('Nenhum flashcard para estudar no momento! Revise mais tarde.', 'info');
        return;
    }

    appState.flashcardStudyData = {
        currentCardIndex: 0,
        cardsToStudy: cardsToStudy,
        studySet: studySet,
        isFlipped: false
    };

    appState.currentModule = 'flashcardStudy';
    showToast(`Iniciando Estudo com ${cardsToStudy.length} flashcards.`, 'info');
    renderFlashcardStudy();
}

/**
 * Renderiza a interface de estudo de flashcards.
 */
function renderFlashcardStudy() {
    const data = appState.flashcardStudyData;
    const card = data.cardsToStudy[data.currentCardIndex];

    if (!card) {
        renderFlashcardStudyEnd();
        return;
    }

    headerTitle.textContent = `Estudo de Flashcards (${data.currentCardIndex + 1}/${data.cardsToStudy.length})`;

    const content = data.isFlipped ? card.verso : card.frente;
    const sideLabel = data.isFlipped ? 'VERSO (Resposta)' : 'FRENTE (Pergunta)';

    mainContent.innerHTML = `
        <section class="module-flashcard-study">
            <div class="card flashcard-display ${data.isFlipped ? 'flipped' : ''}" onclick="flipCard()">
                <div class="fc-side-label">${sideLabel}</div>
                <div class="fc-content">
                    <span class="disciplina-tag" style="background-color: ${stringToColor(card.disciplina)};">${card.disciplina}</span>
                    <p>${content}</p>
                </div>
            </div>

            <div class="fc-controls">
                ${data.isFlipped ? `
                    <button class="btn success large" onclick="answerFlashcard(3)">
                        <i class="fas fa-check"></i> Fácil (5+ dias)
                    </button>
                    <button class="btn info large" onclick="answerFlashcard(2)">
                        <i class="fas fa-minus"></i> Médio (3 dias)
                    </button>
                    <button class="btn danger large" onclick="answerFlashcard(1)">
                        <i class="fas fa-times"></i> Difícil (1 dia)
                    </button>
                ` : `
                    <button class="btn primary large" onclick="flipCard()">
                        <i class="fas fa-sync-alt"></i> Virar
                    </button>
                `}
            </div>

            <button id="btnFcExit" class="btn secondary" onclick="switchModule('home')">
                <i class="fas fa-times"></i> Sair do Estudo
            </button>
        </section>
    `;
}

/**
 * Vira o flashcard.
 */
function flipCard() {
    appState.flashcardStudyData.isFlipped = !appState.flashcardStudyData.isFlipped;
    renderFlashcardStudy();
}

/**
 * Processa a resposta do usuário usando o algoritmo SM-2 (Spaced Repetition System).
 * @param {number} quality - Qualidade da resposta (1=Difícil, 2=Médio, 3=Fácil).
 */
function answerFlashcard(quality) {
    const card = appState.flashcardStudyData.cardsToStudy[appState.flashcardStudyData.currentCardIndex];

    // 1. Encontra o flashcard original para atualizar
    const originalCardIndex = appState.flashcardData.findIndex(c => c.id === card.id);
    if (originalCardIndex === -1) {
        proximoFlashcard();
        return;
    }

    const originalCard = appState.flashcardData[originalCardIndex];
    let ef = originalCard.ef || 2.5; // Fator de Facilidade
    let interval = originalCard.interval || 0; // Intervalo em dias

    // 2. Cálculo do novo Fator de Facilidade (EF)
    ef = ef + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02));
    if (ef < 1.3) ef = 1.3; // EF mínimo

    // 3. Cálculo do novo Intervalo (I)
    if (quality === 1) { // Errou/Difícil (reseta o intervalo)
        interval = 1;
    } else if (interval === 0) { // Primeira vez acertando
        interval = 1;
    } else if (interval === 1) { // Segunda vez acertando
        interval = 6;
    } else { // Terceira ou mais
        interval = Math.round(interval * ef);
    }

    // 4. Calcula a Próxima Data de Revisão
    const now = new Date();
    const nextReviewDate = new Date(now.getTime() + (interval * 24 * 60 * 60 * 1000));

    // 5. Atualiza o flashcard original
    originalCard.ef = ef;
    originalCard.interval = interval;
    originalCard.proxRevisao = nextReviewDate.toISOString();

    appState.flashcardData[originalCardIndex] = originalCard; // Salva a atualização

    // 6. Atualiza progresso diário (consideramos acerto se a qualidade for 2 ou 3)
    if (quality >= 2) {
        incrementDailyProgress();
    }

    saveState();
    proximoFlashcard();
}

/**
 * Avança para o próximo flashcard.
 */
function proximoFlashcard() {
    appState.flashcardStudyData.currentCardIndex++;
    appState.flashcardStudyData.isFlipped = false;
    renderFlashcardStudy();
}

/**
 * Renderiza a tela de fim de estudo de flashcards.
 */
function renderFlashcardStudyEnd() {
    headerTitle.textContent = 'Estudo de Flashcards Finalizado!';

    mainContent.innerHTML = `
        <section class="module-quiz-end">
            <div class="card end-summary">
                <h2>Sessão de Estudo Concluída!</h2>
                <p>Você revisou ${appState.flashcardStudyData.cardsToStudy.length} flashcards.</p>
                <p>O algoritmo de Repetição Espaçada otimizou suas datas de revisão.</p>
            </div>

            <div class="end-actions">
                <button class="btn primary large" onclick="startFlashcardStudy()">
                    <i class="fas fa-redo"></i> Estudar Novamente
                </button>
                <button class="btn secondary large" onclick="switchModule('home')">
                    <i class="fas fa-home"></i> Voltar para o Início
                </button>
            </div>
        </section>
    `;

    appState.flashcardStudyData.cardsToStudy = []; // Limpa o conjunto de estudo
}

// --- MÓDULO CRONOGRAMA INTELIGENTE ---

/**
 * Renderiza a interface do cronograma.
 */
function renderCronogramaModule() {
    headerTitle.textContent = 'Cronograma Inteligente';

    const materias = appState.cronograma.materias;
    const dataFim = appState.cronograma.dataFim;
    const dataFimStr = dataFim ? dataFim.toISOString().slice(0, 10) : '';

    const isCronogramaGenerated = appState.cronograma.semanas && appState.cronograma.semanas.length > 0;

    let materiasListHtml = '';
    if (materias.length === 0) {
        materiasListHtml = '<p class="empty-state">Nenhuma matéria adicionada. Use o formulário abaixo.</p>';
    } else {
        materiasListHtml = materias.map(m => `
            <div class="materia-item card" style="border-left: 5px solid ${m.cor || '#000'}">
                <span>${m.nome} (${m.horasPorSemana}h/sem)</span>
                <button class="btn danger small" onclick="removerMateria('${m.nome}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
    }

    let cronogramaDisplayHtml = '';
    if (isCronogramaGenerated) {
        cronogramaDisplayHtml = renderCronogramaDisplay();
    } else {
        cronogramaDisplayHtml = `
            <div class="card empty-state-box">
                <h4>Cronograma Não Gerado</h4>
                <p>Adicione suas matérias e a data limite para gerar um plano de estudos semanal.</p>
            </div>
        `;
    }

    mainContent.innerHTML = `
        <section class="module-cronograma">
            <div class="cronograma-config">
                <h3 class="section-subtitle">Configuração</h3>

                <div class="form-container card">
                    <form id="addMateriaForm" class="data-form inline-form">
                        <div class="form-group">
                            <label for="materiaNome">Matéria:</label>
                            <input type="text" id="materiaNome" placeholder="Ex: Português" required>
                        </div>
                        <div class="form-group">
                            <label for="horasSemana">Horas/Semana:</label>
                            <input type="number" id="horasSemana" min="1" max="50" value="5" required>
                        </div>
                        <button type="submit" class="btn primary">
                            <i class="fas fa-plus"></i> Adicionar Matéria
                        </button>
                    </form>
                    <button class="btn secondary small mt-2" onclick="importarMaterias()">
                        <i class="fas fa-file-import"></i> Importar Matérias
                    </button>
                </div>

                <div class="materias-list">
                    <h4>Matérias Cadastradas (${materias.length})</h4>
                    ${materiasListHtml}
                </div>

                <div class="generate-controls">
                    <div class="form-group">
                        <label for="dataFim">Data Limite da Prova:</label>
                        <input type="date" id="dataFim" value="${dataFimStr}" required>
                    </div>
                    <button class="btn accent large" onclick="gerarCronograma()">
                        <i class="fas fa-magic"></i> Gerar/Atualizar Cronograma
                    </button>
                    <button class="btn danger" onclick="reiniciarCronograma()">
                        <i class="fas fa-trash-alt"></i> Limpar Tudo
                    </button>
                </div>
            </div>

            <div class="cronograma-display">
                <h3 class="section-subtitle">Meu Plano de Estudos</h3>
                <div id="cronogramaContainer">
                    ${cronogramaDisplayHtml}
                </div>
            </div>
        </section>
    `;

    // Adiciona listener para o formulário de matéria
    document.getElementById('addMateriaForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('materiaNome').value.trim();
        const horas = parseInt(document.getElementById('horasSemana').value);
        adicionarMateriaCronograma(nome, horas);
    });

    // Adiciona listener para a data fim
    document.getElementById('dataFim').addEventListener('change', (e) => {
        appState.cronograma.dataFim = new Date(e.target.value + 'T00:00:00'); // Garante que seja a meia-noite
        saveState();
    });
}

/**
 * Renderiza o cronograma gerado em formato semanal.
 */
function renderCronogramaDisplay() {
    const semanas = appState.cronograma.semanas;
    const totalSemanas = semanas.length;
    let currentWeek = parseInt(document.getElementById('cronogramaContainer')?.dataset.currentWeek) || 1;
    if (currentWeek > totalSemanas) currentWeek = totalSemanas;
    if (currentWeek < 1) currentWeek = 1;

    document.getElementById('cronogramaContainer').dataset.currentWeek = currentWeek;
    const semana = semanas[currentWeek - 1];
    if (!semana) return '<div>Nenhuma semana para exibir.</div>';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let diasHtml = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((diaNome, diaIndex) => {
        const agendamentos = semana.dias[diaIndex];
        const diaData = new Date(semana.dataInicio);
        diaData.setDate(diaData.getDate() + diaIndex);
        diaData.setHours(0, 0, 0, 0);

        const isToday = diaData.getTime() === hoje.getTime();
        const isPast = diaData < hoje;
        const diaConcluido = agendamentos.isConcluido;
        const diaHoras = agendamentos.horas;

        const classList = [
            'dia-card',
            isToday ? 'today' : '',
            diaConcluido ? 'concluido' : '',
            isPast && !diaConcluido ? 'atrasado' : ''
        ].join(' ');

        const agendamentosHtml = agendamentos.materias.map(item => `
            <div class="agendamento-item" style="border-left-color: ${item.cor}">
                <span>${item.nome}</span>
                <span class="horas">${item.horas}h</span>
            </div>
        `).join('');

        return `
            <div class="${classList}">
                <div class="dia-header">
                    <h4>${diaNome} (${diaData.toLocaleDateString()})</h4>
                    <span class="horas-total">${diaHoras} horas</span>
                </div>
                <div class="agendamentos-container">
                    ${agendamentosHtml || '<p class="text-muted small">Dia livre ou Semanas a revisar</p>'}
                </div>
                <div class="dia-actions">
                    <button class="btn secondary small" onclick="atualizarHorasDia('${semana.id}', ${diaIndex})" title="Atualizar horas estudadas">
                        <i class="fas fa-clock"></i> Horas
                    </button>
                    <button class="btn ${diaConcluido ? 'warning' : 'success'} small" onclick="marcarDiaConcluido('${semana.id}', ${diaIndex}, ${!diaConcluido})">
                        <i class="fas ${diaConcluido ? 'fa-undo' : 'fa-check'}"></i> ${diaConcluido ? 'Desfazer' : 'Concluir'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    let displayHtml = `
        <div class="semana-header card">
            <button class="btn secondary" onclick="mostrarSemana(${currentWeek - 1}, ${totalSemanas})" ${currentWeek <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Semana Anterior
            </button>
            <h3>Semana ${currentWeek} de ${totalSemanas}</h3>
            <span class="date-range">${new Date(semana.dataInicio).toLocaleDateString()} - ${new Date(semana.dataFim).toLocaleDateString()}</span>
            <button class="btn secondary" onclick="mostrarSemana(${currentWeek + 1}, ${totalSemanas})" ${currentWeek >= totalSemanas ? 'disabled' : ''}>
                Próxima Semana <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="dias-grid">
            ${diasHtml}
        </div>
        <div class="resumo-semana">
            <p><strong>Total de Horas Agendadas na Semana:</strong> ${semana.totalHorasSemana}h</p>
            <p><strong>Total de Horas Concluídas:</strong> ${semana.totalHorasConcluidas}h</p>
        </div>
    `;

    return displayHtml;
}

/**
 * Adiciona uma nova matéria ao cronograma.
 * @param {string} nome - Nome da matéria.
 * @param {number} horasPorSemana - Horas semanais dedicadas.
 */
function adicionarMateriaCronograma(nome, horasPorSemana) {
    if (!nome || horasPorSemana < 1) {
        showToast('Preencha o nome da matéria e horas por semana (mínimo 1).', 'danger');
        return;
    }

    // Verifica se a matéria já existe
    if (appState.cronograma.materias.some(m => m.nome.toLowerCase() === nome.toLowerCase())) {
        showToast(`A matéria "${nome}" já foi adicionada.`, 'warning');
        return;
    }

    const newMateria = {
        nome: nome,
        horasPorSemana: horasPorSemana,
        cor: colors[colorIndex % colors.length], // Cicla pelas cores
        progressoHoras: 0, // Horas acumuladas de estudo
    };
    colorIndex++; // Incrementa para a próxima cor

    appState.cronograma.materias.push(newMateria);
    saveState();
    renderCronogramaModule();
    showToast(`Matéria "${nome}" adicionada!`, 'success');
}

/**
 * Remove uma matéria do cronograma.
 * @param {string} nome - Nome da matéria a ser removida.
 */
function removerMateria(nome) {
    if (confirmAction(`Tem certeza que deseja remover a matéria "${nome}"? Isso irá limpar o cronograma gerado.`)) {
        appState.cronograma.materias = appState.cronograma.materias.filter(m => m.nome !== nome);
        appState.cronograma.semanas = []; // Limpa o cronograma gerado
        saveState();
        renderCronogramaModule();
        showToast(`Matéria "${nome}" removida.`, 'success');
    }
}

/**
 * Gera ou atualiza o cronograma semanal.
 */
function gerarCronograma() {
    const materias = appState.cronograma.materias;
    let dataFim = appState.cronograma.dataFim;
    const dataFimInput = document.getElementById('dataFim');

    if (!dataFimInput.value && !dataFim) {
        showToast('Selecione a Data Limite da Prova.', 'danger');
        return;
    }
    if (dataFimInput.value) {
        dataFim = new Date(dataFimInput.value + 'T00:00:00');
        appState.cronograma.dataFim = dataFim;
    }
    if (materias.length === 0) {
        showToast('Adicione pelo menos uma matéria para gerar o cronograma.', 'danger');
        return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (dataFim < hoje) {
        showToast('A data limite da prova deve ser no futuro.', 'danger');
        return;
    }

    // Calcula o total de horas a serem agendadas por semana
    const totalHorasSemanais = materias.reduce((sum, m) => sum + m.horasPorSemana, 0);

    // Encontra o início da próxima semana (Domingo)
    const start = new Date(hoje);
    start.setDate(start.getDate() + (7 - start.getDay())); // Vai para o próximo domingo
    start.setHours(0, 0, 0, 0);

    let semanas = [];
    let currentWeekStart = start;
    let weekId = 1;

    // Distribuição das matérias (peso simples baseado em horas)
    const distribution = {};
    materias.forEach(m => {
        distribution[m.nome] = m.horasPorSemana / totalHorasSemanais;
    });

    while (currentWeekStart <= dataFim) {
        let currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

        // Se a semana terminar após a data limite, ajusta o final (ou ignora, se for muito perto)
        if (currentWeekStart > dataFim) break;

        let semana = {
            id: `s${weekId}`,
            dataInicio: currentWeekStart.toISOString(),
            dataFim: currentWeekEnd.toISOString(),
            totalHorasSemana: totalHorasSemanais,
            totalHorasConcluidas: 0,
            dias: Array(7).fill(null).map((_, dayIndex) => ({
                dia: dayIndex,
                materias: [],
                horas: 0,
                isConcluido: false
            }))
        };

        // Distribui as horas da semana pelos dias (excluindo domingo - dia 0)
        let totalHorasRestantes = totalHorasSemanais;
        let diasParaDistribuir = [1, 2, 3, 4, 5, 6]; // Seg a Sáb

        // Calcula a média de horas por dia útil
        let mediaHorasPorDia = totalHorasSemanais / diasParaDistribuir.length;

        // Distribui o totalHorasSemanais pelos 6 dias úteis de forma pseudo-aleatória (para alternar as matérias)
        let materiaIndex = 0;
        let horasDistribuidas = 0;

        diasParaDistribuir.forEach(dayIndex => {
            let horasDoDia = 0;
            // Tenta agendar um pouco mais ou um pouco menos que a média
            const targetHorasDia = Math.max(1, Math.round(mediaHorasPorDia + (Math.random() * 1.5 - 0.75)));

            while (horasDoDia < targetHorasDia && horasDistribuidas < totalHorasSemanais) {
                const materia = materias[materiaIndex % materias.length];

                // Limita a 2 horas por bloco de estudo por matéria
                const horasParaEstudar = Math.min(2, targetHorasDia - horasDoDia, materia.horasPorSemana, totalHorasSemanais - horasDistribuidas);

                if (horasParaEstudar > 0) {
                    semana.dias[dayIndex].materias.push({
                        nome: materia.nome,
                        horas: horasParaEstudar,
                        cor: materia.cor
                    });
                    semana.dias[dayIndex].horas += horasParaEstudar;
                    horasDistribuidas += horasParaEstudar;
                }

                materiaIndex++; // Passa para a próxima matéria (alternância)
                if (materiaIndex > 5 * materias.length) break; // Limite de segurança
            }
        });

        // Atualiza o total de horas na semana (se houver arredondamento)
        semana.totalHorasSemana = horasDistribuidas;

        semanas.push(semana);
        weekId++;
        currentWeekStart = new Date(currentWeekEnd);
        currentWeekStart.setDate(currentWeekStart.getDate() + 1); // Próximo dia (próximo domingo)
    }

    appState.cronograma.semanas = semanas;
    saveState();
    renderCronogramaModule();
    showToast(`Cronograma gerado com sucesso! ${semanas.length} semanas de estudo.`, 'success');
}

/**
 * Marca um dia do cronograma como concluído e atualiza o total de horas concluídas.
 * @param {string} semanaId - ID da semana.
 * @param {number} diaIndex - Índice do dia (0=Dom, 1=Seg...).
 * @param {boolean} isConcluido - Novo estado de conclusão.
 */
function marcarDiaConcluido(semanaId, diaIndex, isConcluido) {
    const semana = appState.cronograma.semanas.find(s => s.id === semanaId);
    if (!semana) return;

    const dia = semana.dias[diaIndex];
    if (dia.isConcluido === isConcluido) return; // Estado inalterado

    dia.isConcluido = isConcluido;

    // Recalcula o total de horas concluídas na semana
    semana.totalHorasConcluidas = semana.dias.reduce((sum, d) => sum + (d.isConcluido ? d.horas : 0), 0);

    saveState();
    renderCronogramaModule();
    showToast(`Dia ${isConcluido ? 'marcado' : 'desmarcado'} como concluído.`, 'info');
}

/**
 * Atualiza o número de horas estudadas em um dia.
 * @param {string} semanaId - ID da semana.
 * @param {number} diaIndex - Índice do dia (0=Dom, 1=Seg...).
 */
function atualizarHorasDia(semanaId, diaIndex) {
    const semana = appState.cronograma.semanas.find(s => s.id === semanaId);
    if (!semana) return;

    const dia = semana.dias[diaIndex];
    const currentHours = dia.horas;

    const newHoursInput = prompt(`Digite as horas reais de estudo para este dia (Agendado: ${currentHours}h):`, currentHours);

    if (newHoursInput === null) return; // Usuário cancelou
    const newHours = parseFloat(newHoursInput);

    if (isNaN(newHours) || newHours < 0) {
        showToast('Valor de horas inválido.', 'danger');
        return;
    }

    // Se o dia estava concluído e as horas mudaram, desmarca a conclusão
    if (dia.isConcluido && newHours !== dia.horas) {
        dia.isConcluido = false;
        semana.totalHorasConcluidas = semana.dias.reduce((sum, d) => sum + (d.isConcluido ? d.horas : 0), 0);
    }

    // Logica simples: Se o usuário estudou mais que o agendado, a matéria original recebe o excedente.
    // Para simplificar, vamos apenas atualizar o total do dia.
    // Uma implementação mais robusta envolveria distribuir o excedente entre as matérias do dia.
    if (newHours !== dia.horas) {
         showToast(`Horas atualizadas para ${newHours}h. (Atenção: A distribuição das matérias permanece a original)`, 'warning');
         dia.horas = newHours;

         // Recalcula o total de horas na semana
         semana.totalHorasSemana = semana.dias.reduce((sum, d) => sum + d.horas, 0);
    }


    saveState();
    renderCronogramaModule();
}

/**
 * Exibe a semana do cronograma especificada.
 * @param {number} weekNum - O número da semana a ser exibida.
 * @param {number} totalPages - Total de semanas.
 */
function mostrarSemana(weekNum, totalPages) {
    if (weekNum >= 1 && weekNum <= totalPages) {
        document.getElementById('cronogramaContainer').dataset.currentWeek = weekNum;
        document.getElementById('cronogramaContainer').innerHTML = renderCronogramaDisplay();
    }
}

/**
 * Reinicia o cronograma (remove matérias e o plano gerado).
 */
function reiniciarCronograma() {
    if (confirmAction('Tem certeza que deseja limpar todas as matérias e o cronograma gerado? Esta ação é irreversível.')) {
        appState.cronograma = {
            materias: [],
            dataFim: null,
            semanas: []
        };
        colorIndex = 0; // Reseta o índice de cores
        saveState();
        renderCronogramaModule();
        showToast('Cronograma e matérias limpos!', 'success');
    }
}

/**
 * Inicia a importação de matérias a partir de um JSON.
 */
function importarMaterias() {
    const jsonString = prompt("Cole o JSON das matérias no formato:\n" +
        "[{\"nome\":\"Português\", \"horasPorSemana\":5}, {\"nome\":\"Matemática\", \"horasPorSemana\":8}]");

    if (jsonString === null) return;

    try {
        const disciplinas = JSON.parse(jsonString);
        processarDisciplinasImportadas(disciplinas);
    } catch (e) {
        showToast('Formato JSON inválido. Verifique o padrão e tente novamente.', 'danger');
        console.error('Erro ao processar JSON de importação:', e);
    }
}

/**
 * Processa as matérias importadas.
 * @param {Array<object>} disciplinas - Array de objetos { nome, horasPorSemana }.
 */
function processarDisciplinasImportadas(disciplinas) {
    if (!Array.isArray(disciplinas)) {
        showToast('O JSON deve ser um array de disciplinas.', 'danger');
        return;
    }

    let importCount = 0;
    disciplinas.forEach(disc => {
        const nome = disc.nome ? disc.nome.trim() : null;
        const horas = parseInt(disc.horasPorSemana);

        if (nome && horas >= 1) {
            // Verifica se já existe para evitar duplicatas
            if (!appState.cronograma.materias.some(m => m.nome.toLowerCase() === nome.toLowerCase())) {
                const newMateria = {
                    nome: nome,
                    horasPorSemana: horas,
                    cor: colors[colorIndex % colors.length],
                    progressoHoras: 0,
                };
                colorIndex++;
                appState.cronograma.materias.push(newMateria);
                importCount++;
            }
        }
    });

    if (importCount > 0) {
        // Limpa o cronograma anterior e salva o estado
        appState.cronograma.semanas = [];
        saveState();
        renderCronogramaModule();
        showToast(`${importCount} matéria(s) importada(s) com sucesso! Gere o cronograma.`, 'success');
    } else {
        showToast('Nenhuma nova matéria válida foi encontrada para importação.', 'info');
    }
}


// --- MÓDULO AJUDA & CONFIGURAÇÕES GERAIS ---

/**
 * Renderiza a interface de ajuda e configurações.
 */
function renderAjudaModule() {
    headerTitle.textContent = 'Ajuda & Configurações';

    // Data de meta diária atual
    const goalValue = appState.dailyGoal;

    mainContent.innerHTML = `
        <section class="module-help">
            <h2 class="section-title">Configurações Gerais</h2>

            <div class="config-section card">
                <h3>Meta Diária de Estudo</h3>
                <p>Defina o número de perguntas/flashcards que você deseja revisar por dia.</p>
                <div class="config-control">
                    <input type="number" id="dailyGoalInput" value="${goalValue}" min="1">
                    <button class="btn primary" onclick="updateDailyGoalTarget(document.getElementById('dailyGoalInput').value)">
                        <i class="fas fa-save"></i> Salvar Meta
                    </button>
                </div>
            </div>

            <div class="config-section card">
                <h3>Gerenciamento de Dados</h3>
                <p>Exporte seus dados para backup ou importe um arquivo existente.</p>
                <div class="config-actions">
                    <button class="btn info" onclick="exportDB()">
                        <i class="fas fa-file-export"></i> Exportar Dados (JSON)
                    </button>
                    <button class="btn warning" onclick="document.getElementById('fileInput').click()">
                        <i class="fas fa-file-import"></i> Importar Dados (JSON)
                    </button>
                    <button class="btn danger" onclick="clearDB()">
                        <i class="fas fa-exclamation-triangle"></i> Limpar TODOS os Dados
                    </button>
                </div>
            </div>

            <div class="config-section card">
                <h3>Guia Rápido de Uso</h3>
                <div class="help-grid">
                    <div class="help-section">
                        <h4><i class="fas fa-question-circle"></i> Gerenciador de Perguntas</h4>
                        <ul>
                            <li>Cadastre suas perguntas de múltipla escolha.</li>
                            <li>Use a funcionalidade "Iniciar Treino" para revisar de forma otimizada.</li>
                            <li>A taxa de acertos consecutivos (no cartão) determina se a questão está em Revisão (&lt;3) ou Dominada (>=3).</li>
                        </ul>
                    </div>

                    <div class="help-section">
                        <h4><i class="fas fa-layer-group"></i> Flashcards e SRS</h4>
                        <ul>
                            <li>O sistema usa o <a href="https://en.wikipedia.org/wiki/Spaced_repetition" target="_blank">SRS (Spaced Repetition System)</a> para agendar a próxima revisão.</li>
                            <li>Responda "Difícil (1)", "Médio (2)", ou "Fácil (3)" para atualizar o intervalo de revisão.</li>
                            <li>O estudo prioriza cards com a data de "Próxima Revisão" vencida.</li>
                        </ul>
                    </div>

                    <div class="help-section">
                        <h4><i class="fas fa-calendar-alt"></i> Cronograma</h4>
                        <ul>
                            <li>Defina a Data Limite da Prova e adicione suas matérias com as horas semanais.</li>
                            <li>A função "Gerar Cronograma" distribui o tempo de estudo pelas semanas até a data final.</li>
                            <li>Acompanhe seu progresso diário e semanal marcando os dias como concluídos.</li>
                        </div>
                    </div>
                </div>
            </div>

             <p class="app-version">MindForge v9.2 - Correção PWA | Por: Walker Dias</p>
        </section>
    `;
    // Adiciona listener de importação
    document.getElementById('fileInput').addEventListener('change', importDB);
}

// --- GESTÃO DE DADOS (IMPORTAÇÃO/EXPORTAÇÃO) ---

/**
 * Exporta todo o estado da aplicação como um arquivo JSON.
 */
function exportDB() {
    const exportData = {
        quizData: appState.quizData,
        flashcardData: appState.flashcardData,
        stats: appState.stats,
        dailyGoal: appState.dailyGoal,
        cronograma: appState.cronograma,
        settings: appState.settings
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindforge_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Dados exportados com sucesso!', 'success');
}

/**
 * Importa dados de um arquivo JSON.
 * @param {Event} event - Evento de mudança do input file.
 */
function importDB(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirmAction('A importação substituirá TODOS os dados atuais (Perguntas, Flashcards, Estatísticas). Deseja continuar?')) {
        // Limpa o valor do input para permitir nova seleção
        event.target.value = null;
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            if (importedData.quizData) appState.quizData = importedData.quizData;
            if (importedData.flashcardData) appState.flashcardData = importedData.flashcardData;
            if (importedData.stats) appState.stats = importedData.stats;
            if (importedData.dailyGoal) appState.dailyGoal = parseInt(importedData.dailyGoal);
            if (importedData.cronograma) {
                 // Converte a dataFim de volta para objeto Date
                 if (importedData.cronograma.dataFim) {
                    importedData.cronograma.dataFim = new Date(importedData.cronograma.dataFim);
                 }
                appState.cronograma = importedData.cronograma;
            }
            if (importedData.settings) appState.settings = importedData.settings;

            appState.totalQuestions = appState.quizData.length;
            saveState();
            updateUI();
            showToast('Dados importados com sucesso! Verifique a tela inicial.', 'success');
        } catch (error) {
            showToast('Erro ao processar o arquivo JSON. Certifique-se de que o formato está correto.', 'danger');
            console.error('Erro na importação:', error);
        } finally {
            // Limpa o valor do input para permitir nova seleção
            event.target.value = null;
        }
    };
    reader.onerror = () => {
        showToast('Não foi possível ler o arquivo.', 'danger');
         // Limpa o valor do input para permitir nova seleção
        event.target.value = null;
    };
    reader.readAsText(file);
}

/**
 * Limpa todos os dados salvos no localStorage.
 */
function clearDB() {
    if (confirmAction('ATENÇÃO: Você tem certeza que deseja APAGAR TODOS os seus dados salvos? Esta ação é irreversível.')) {
        localStorage.clear();
        window.location.reload(); // Recarrega a aplicação
    }
}

// --- FUNÇÕES AUXILIARES ---

/**
 * Obtém tags únicas de uma lista de objetos.
 * @param {Array<object>} data - Array de perguntas ou flashcards.
 * @returns {Array<string>} - Array de tags únicas.
 */
function getUniqueTags(data) {
    const tags = new Set();
    data.forEach(item => {
        (item.tags || []).forEach(tag => tags.add(tag.toLowerCase()));
    });
    return Array.from(tags).sort();
}

/**
 * Gera uma cor determinística a partir de uma string.
 * @param {string} str - String de entrada (ex: nome da disciplina).
 * @returns {string} - Cor em formato hexadecimal.
 */
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}

/**
 * Funções para seleção de tags nos formulários.
 * @param {string} tag - A tag selecionada.
 */
function selectTag(tag) {
    const tagsInput = document.getElementById('tags');
    if (!tagsInput) return;
    const currentTags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
    if (!currentTags.includes(tag)) {
        tagsInput.value = currentTags.length > 0 ? currentTags.join(', ') + `, ${tag}` : tag;
    }
}

function selectTagFc(tag) {
    const tagsInput = document.getElementById('tags_fc');
    if (!tagsInput) return;
    const currentTags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
    if (!currentTags.includes(tag)) {
        tagsInput.value = currentTags.length > 0 ? currentTags.join(', ') + `, ${tag}` : tag;
    }
}

// --- INICIALIZAÇÃO ---

/**
 * Inicializa a aplicação.
 */
function init() {
    loadState();
    initConnectivity(); // Inicializa a verificação de conectividade
    updateUI();
}

// Inicializa a aplicação
init();

// Exportações Globais para funções usadas no HTML
window.editQ = editQ;
window.delQ = delQ;
window.copyQuestion = copyQuestion;
window.toggleRevisao = toggleRevisao;
window.filterByTag = filterByTag;
window.sairTreino = sairTreino;
window.checarResposta = checarResposta;
window.mostrarResolucao = mostrarResolucao;
window.proximaPergunta = proximaPergunta;
window.pularPergunta = pularPergunta;
window.editFC = editFC;
window.delFC = delFC;
window.exportDB = exportDB;
window.importDB = importDB; // Agora usa o input file, mas mantemos a função global
window.clearDB = clearDB;
window.switchModule = switchModule;
window.initQuiz = initQuiz;
window.startFlashcardStudy = startFlashcardStudy;
window.updateDailyGoalTarget = updateDailyGoalTarget;
window.adicionarMateriaCronograma = adicionarMateriaCronograma;
window.removerMateria = removerMateria;
window.gerarCronograma = gerarCronograma;
window.marcarDiaConcluido = marcarDiaConcluido;
window.atualizarHorasDia = atualizarHorasDia;
window.mostrarSemana = mostrarSemana;
window.reiniciarCronograma = reiniciarCronograma;
window.mostrarSemana = mostrarSemana;
window.importarMaterias = importarMaterias;
window.processarDisciplinasImportadas = processarDisciplinasImportadas; // Função auxiliar
window.selectTag = selectTag;
window.selectTagFc = selectTagFc;
window.toggleTheme = toggleTheme;
window.flipCard = flipCard;
window.answerFlashcard = answerFlashcard;
window.changePageFc = changePageFc;
window.changePage = changePage;