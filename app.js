// app.js — Versão 9.2 (Correção PWA)

"use strict";

// --- REGISTRO DO SERVICE WORKER CORRIGIDO PARA PWA ---
if ('serviceWorker' in navigator) {
  // Aguarda a página carregar completamente
  window.addEventListener('load', function() {
    // Limpa service workers antigos
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (let registration of registrations) {
        registration.unregister();
        console.log('Service Worker antigo removido');
      }
      
      // Registra o novo service worker
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(function(registration) {
          console.log('✅ Service Worker registrado com sucesso no escopo:', registration.scope);
          
          // Verifica se há uma nova versão
          registration.update();
        })
        .catch(function(error) {
          console.log('❌ Falha no registro do Service Worker:', error);
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
        console.log('🔴 Sem conexão com a internet');
        document.body.classList.add('offline');
        showToast('Modo offline ativado - usando dados locais', 'info');
    });

    // Verificar status inicial
    if (!navigator.onLine) {
        document.body.classList.add('offline');
        console.log('Iniciando em modo offline');
    }
}

// --- VERIFICAÇÃO DO PWA ---
function checkPWAStatus() {
    // Verifica se está instalado como PWA
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                window.navigator.standalone === true;
  
  console.log(isPWA ? '📱 Executando como PWA' : '🌐 Executando no navegador');
  
  if (isPWA) {
    document.body.classList.add('pwa-mode');
  }

    // Verifica service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            console.log('✅ Service Worker pronto para uso offline');
        }).catch(error => {
            console.log('❌ Service Worker não está pronto:', error);
        });
    }
}

/* ---------------------------
   Estado e Dados
----------------------------*/
let BD = JSON.parse(localStorage.getItem('BD_QUESTOES') || '[]');
let BD_FC = JSON.parse(localStorage.getItem('BD_FLASHCARDS') || '[]');
let SAVED_FILTERS = JSON.parse(localStorage.getItem('BD_FILTROS') || '{}');
let DAILY_GOAL = JSON.parse(localStorage.getItem('BD_DAILY_GOAL') || '{"date": "", "count": 0, "target": 20}');
let CURRENT_MODULE = 'dashboard';
let CRONOGRAMA_DATA = JSON.parse(localStorage.getItem('BD_CRONOGRAMA') || 'null');
let MATERIAS_CRONOGRAMA = JSON.parse(localStorage.getItem('BD_MATERIAS') || '[]');
let MODELOS_CRONOGRAMA = JSON.parse(localStorage.getItem('BD_MODELOS_CRONOGRAMA') || '[]');

// Quiz / Treino State
let inQuiz = false;
let quizIndex = 0;
let quizOrder = [];
let timerInterval = null;
let startTime = 0;

// Flashcard Player State
let fcIndex = 0;
let fcList = [];

let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let questionsSinceBackup = 0;

// Dashboard State
let dashboardData = JSON.parse(localStorage.getItem('BD_DASHBOARD') || '{"lastUpdate": "", "weeklyStats": {}}');

/* ---------------------------
   Sistema de Módulos e Navegação
----------------------------*/
function switchModule(moduleName) {
    // Esconde todos os módulos
    document.querySelectorAll('.module').forEach(module => {
        module.classList.remove('active');
    });

    // Remove active de todos os itens do menu
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Ativa o módulo selecionado
    const targetModule = document.getElementById(moduleName);
    if (targetModule) {
        targetModule.classList.add('active');
    }

    // Ativa o item do menu correspondente
    const menuItem = document.querySelector(`[data-module="${moduleName}"]`);
    if (menuItem) {
        menuItem.classList.add('active');
    }

    CURRENT_MODULE = moduleName;

    // Fecha menu mobile se aberto
    closeMobileMenu();

    // Executa funções específicas do módulo
    switch (moduleName) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'questoes':
            renderQuestions();
            break;
        case 'flashcards':
            renderFlashcardsList();
            updateFCFilters(); // ← ADICIONAR ESTA LINHA
            break;
        case 'estatisticas':
            loadStatisticsModule();
            break;
        case 'metas':
            loadGoalsModule();
            break;
        case 'backup':
            loadBackupModule();
            break;
        case 'cronograma':
            // Já é gerenciado pelo cronograma existente
            break;
    }

    // Salva o último módulo visitado
    localStorage.setItem('LAST_MODULE', moduleName);
}

function updateDashboard() {
    // Atualiza meta diária
    const goalElement = document.getElementById('dashboardGoal');
    const progressElement = document.getElementById('dashboardProgressFill');
    if (goalElement && progressElement) {
        goalElement.textContent = `${DAILY_GOAL.count}/${DAILY_GOAL.target}`;
        const progress = (DAILY_GOAL.count / DAILY_GOAL.target) * 100;
        progressElement.style.width = `${Math.min(progress, 100)}%`;
    }

    // Atualiza contadores
    const questionsElement = document.getElementById('dashboardQuestions');
    const flashcardsElement = document.getElementById('dashboardFlashcards');
    if (questionsElement) questionsElement.textContent = BD.length;
    if (flashcardsElement) flashcardsElement.textContent = BD_FC.length;

    // Atualiza progresso do cronograma
    const scheduleElement = document.getElementById('dashboardSchedule');
    if (scheduleElement && CRONOGRAMA_DATA) {
        const progress = calcularProgressoCronograma(CRONOGRAMA_DATA);
        scheduleElement.textContent = `${progress}%`;
    }

    // Atualiza progresso na sidebar
    updateSidebarProgress();

    // Atualiza tempo atual
    updateCurrentTime();

    // Atualiza atividade recente
    updateRecentActivity();
}

function updateSidebarProgress() {
    const progressElement = document.getElementById('sidebarProgress');
    const progressFill = document.getElementById('sidebarProgressFill');

    if (progressElement && progressFill) {
        // Calcula progresso geral baseado em múltiplos fatores
        let totalProgress = 0;
        let factors = 0;

        // Progresso da meta diária (25%)
        const dailyProgress = (DAILY_GOAL.count / DAILY_GOAL.target) * 100;
        totalProgress += Math.min(dailyProgress, 100) * 0.25;
        factors += 0.25;

        // Progresso do cronograma (25%)
        if (CRONOGRAMA_DATA) {
            const scheduleProgress = calcularProgressoCronograma(CRONOGRAMA_DATA);
            totalProgress += scheduleProgress * 0.25;
            factors += 0.25;
        }

        // Questões respondidas (25%)
        const totalQuestions = BD.length;
        const answeredQuestions = BD.filter(q => q.stats && (q.stats.correct + q.stats.wrong) > 0).length;
        const questionProgress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;
        totalProgress += questionProgress * 0.25;
        factors += 0.25;

        // Flashcards estudados (25%)
        const totalFlashcards = BD_FC.length;
        // Simulação - na versão real poderia rastrear flashcards estudados
        const flashcardProgress = totalFlashcards > 0 ? Math.min((totalFlashcards / 50) * 100, 100) : 0;
        totalProgress += flashcardProgress * 0.25;
        factors += 0.25;

        // Calcula média final
        const finalProgress = factors > 0 ? totalProgress / factors : 0;

        progressElement.textContent = `${Math.round(finalProgress)}%`;
        progressFill.style.width = `${finalProgress}%`;
    }
}

function updateCurrentTime() {
    const timeElement = document.getElementById('currentTime');
    if (timeElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const dateString = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        timeElement.innerHTML = `
      <div style="font-size: 1.1rem; font-weight: 600;">${timeString}</div>
      <div style="font-size: 0.8rem; opacity: 0.8;">${dateString}</div>
    `;
    }
}

function updateRecentActivity() {
    const activityElement = document.getElementById('recentActivity');
    if (!activityElement) return;

    // Simula atividades recentes - na versão real viria do histórico
    const activities = [];

    // Adiciona atividade de questões respondidas hoje
    if (DAILY_GOAL.count > 0) {
        activities.push({
            icon: '🎯',
            text: `Resolveu ${DAILY_GOAL.count} questões hoje`,
            time: 'Hoje'
        });
    }

    // Adiciona atividade de novas questões
    const recentQuestions = BD.filter(q => {
        const questionDate = new Date(q.id);
        const today = new Date();
        return (today - questionDate) < (24 * 60 * 60 * 1000); // Últimas 24h
    });

    if (recentQuestions.length > 0) {
        activities.push({
            icon: '📝',
            text: `Adicionou ${recentQuestions.length} novas questões`,
            time: 'Hoje'
        });
    }

    // Adiciona placeholder se não houver atividades
    if (activities.length === 0) {
        activities.push({
            icon: '📚',
            text: 'Comece a estudar para ver suas atividades aqui!',
            time: 'Vamos começar?'
        });
    }

    activityElement.innerHTML = activities.map(activity => `
    <div class="activity-item">
      <span class="activity-icon">${activity.icon}</span>
      <div class="activity-content">
        <p>${activity.text}</p>
        <span class="activity-time">${activity.time}</span>
      </div>
    </div>
  `).join('');
}

/* ---------------------------
   Mobile Menu Handling
----------------------------*/
function initMobileMenu() {
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.querySelector('.sidebar');

    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Fecha menu ao clicar em um item (em mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                closeMobileMenu();
            }
        });
    });
}

function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
    }
}

/* ---------------------------
   Módulos Específicos
----------------------------*/
function loadStatisticsModule() {
    // Reutiliza a função showStats existente
    showStats();
}

function loadGoalsModule() {
    // Atualiza os elementos de metas
    const currentProgress = document.getElementById('currentProgress');
    const targetProgress = document.getElementById('targetProgress');
    const goalProgressFill = document.getElementById('goalProgressFill');
    const dailyGoalInput = document.getElementById('dailyGoalInput');

    if (currentProgress) currentProgress.textContent = DAILY_GOAL.count;
    if (targetProgress) targetProgress.textContent = DAILY_GOAL.target;
    if (goalProgressFill) {
        const progress = (DAILY_GOAL.count / DAILY_GOAL.target) * 100;
        goalProgressFill.style.width = `${Math.min(progress, 100)}%`;
    }
    if (dailyGoalInput) dailyGoalInput.value = DAILY_GOAL.target;

    // Atualiza estatísticas da semana
    updateWeeklyStats();
}

function updateWeeklyStats() {
    const weekStatsElement = document.getElementById('weekStats');
    if (!weekStatsElement) return;

    // Simula dados da semana - na versão real viria do histórico
    const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Qua', 'Sáb', 'Dom'];
    const today = new Date().getDay();
    const weekData = weekDays.map((day, index) => {
        const isToday = index === (today === 0 ? 6 : today - 1); // Ajuste para DOM começando em 0
        const count = isToday ? DAILY_GOAL.count : Math.floor(Math.random() * 25);

        return {
            day,
            count,
            isToday
        };
    });

    weekStatsElement.innerHTML = weekData.map(day => `
    <div class="day-stat ${day.isToday ? 'today' : ''}" style="
      background: var(--card); 
      padding: 10px; 
      border-radius: 8px; 
      text-align: center;
      border: ${day.isToday ? '2px solid var(--accent)' : '1px solid var(--border)'};
    ">
      <div style="font-size: 0.8rem; color: var(--text-muted);">${day.day}</div>
      <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">${day.count}</div>
      <div style="font-size: 0.7rem; color: var(--text-muted);">questões</div>
    </div>
  `).join('');
}

function updateDailyGoalTarget() {
    const input = document.getElementById('dailyGoalInput');
    if (input) {
        const newTarget = parseInt(input.value);
        if (newTarget > 0 && newTarget <= 100) {
            DAILY_GOAL.target = newTarget;
            localStorage.setItem('BD_DAILY_GOAL', JSON.stringify(DAILY_GOAL));
            updateDailyGoalUI();
            loadGoalsModule(); // Recarrega o módulo
            showToast(`Meta diária atualizada para ${newTarget} questões!`, 'success');
        }
    }
}

function loadBackupModule() {
    // Atualiza informações do backup
    const backupQuestions = document.getElementById('backupQuestions');
    const backupFlashcards = document.getElementById('backupFlashcards');
    const lastBackup = document.getElementById('lastBackup');

    if (backupQuestions) backupQuestions.textContent = BD.length;
    if (backupFlashcards) backupFlashcards.textContent = BD_FC.length;
    if (lastBackup) {
        const lastBackupDate = localStorage.getItem('LAST_BACKUP_DATE');
        lastBackup.textContent = lastBackupDate || 'Nunca';
    }
}

/* ---------------------------
   Inicialização do Dashboard
----------------------------*/
function initDashboard() {
    // Atualiza dashboard imediatamente
    updateDashboard();

    // Atualiza dashboard a cada minuto
    setInterval(updateDashboard, 60000);

    // Atualiza estatísticas semanais
    updateWeeklyStats();
}

/* ---------------------------
   Utilitários e Meta
----------------------------*/
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function saveBD() {
    try {
        localStorage.setItem('BD_QUESTOES', JSON.stringify(BD));
    } catch (e) {
        if (e.name === 'QuotaExceededError') showToast("Erro: Limite cheio!", "error");
    }
}

function saveBD_FC() {
    try {
        localStorage.setItem('BD_FLASHCARDS', JSON.stringify(BD_FC));
    } catch (e) {
        showToast("Erro: Limite cheio!", "error");
    }
}

function escapeHtml(txt) {
    return String(txt || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>');
}

function renderEnunciadoWithImage(enunciado, imagemBase64, isQuiz = false) {
    const safeText = escapeHtml(enunciado || "");
    if (!imagemBase64) return safeText;
    const imgClass = isQuiz ? "q-image quiz-image" : "q-image";
    const imgTag = `<img src="${imagemBase64}" class="${imgClass}" alt="Imagem">`;
    const placeHolder = '[IMAGEM]';
    return safeText.includes(placeHolder) ? safeText.replace(placeHolder, imgTag) : `${imgTag}<br>${safeText}`;
}

// --- META DIÁRIA ---
function initDailyGoal() {
    const today = new Date().toLocaleDateString();
    if (DAILY_GOAL.date !== today) {
        DAILY_GOAL = {
            date: today,
            count: 0,
            target: 20
        };
        localStorage.setItem('BD_DAILY_GOAL', JSON.stringify(DAILY_GOAL));
    }
    updateDailyGoalUI();
}

function updateDailyGoal(increment = 1) {
    const today = new Date().toLocaleDateString();
    if (DAILY_GOAL.date !== today) {
        DAILY_GOAL.count = 0;
        DAILY_GOAL.date = today;
    }
    DAILY_GOAL.count += increment;
    localStorage.setItem('BD_DAILY_GOAL', JSON.stringify(DAILY_GOAL));
    updateDailyGoalUI();
    if (DAILY_GOAL.count === DAILY_GOAL.target) showToast("🎉 Parabéns! Meta diária batida!", "success");
}

function updateDailyGoalUI() {
    const goalBarFill = document.getElementById('goalBarFill');
    const goalText = document.getElementById('goalText');
    if (!goalBarFill || !goalText) return;
    const perc = Math.min((DAILY_GOAL.count / DAILY_GOAL.target) * 100, 100);
    goalBarFill.style.width = `${perc}%`;
    goalText.textContent = `${DAILY_GOAL.count}/${DAILY_GOAL.target}`;
    const dailyGoalPanel = document.getElementById('dailyGoalPanel');
    if (perc >= 100) {
        if (dailyGoalPanel) dailyGoalPanel.classList.add('goal-reached');
    } else {
        if (dailyGoalPanel) dailyGoalPanel.classList.remove('goal-reached');
    }
}

/* ---------------------------
   Questões (CRUD e Imagem)
----------------------------*/
function saveQuestion(e) {
    e.preventDefault();
    const id = document.getElementById('qid').value;
    const novaQuestao = {
        assunto: document.getElementById('assunto').value.trim(),
        topico: document.getElementById('topico').value.trim(),
        enunciado: document.getElementById('enunciado').value.trim(),
        A: document.getElementById('optA').value.trim(),
        B: document.getElementById('optB').value.trim(),
        C: document.getElementById('optC').value.trim(),
        D: document.getElementById('optD').value.trim(),
        E: document.getElementById('optE').value.trim(),
        correta: document.getElementById('correta').value,
        resolucao: document.getElementById('resolucao').value.trim(),
        tags: document.getElementById('tags').value.toLowerCase().trim(),
        ano: document.getElementById('ano').value.trim(),
        banca: document.getElementById('banca').value.trim(),
        disciplina: document.getElementById('disciplina').value.trim(),
        dificuldade: document.getElementById('dificuldade') ? document.getElementById('dificuldade').value : "",
        imagem: null
    };
    const currentImg = document.getElementById('imgPreview').src;
    if (document.getElementById('imgPreview').style.display !== 'none') {
        novaQuestao.imagem = currentImg;
    }

    if (!novaQuestao.enunciado || !novaQuestao.correta || !novaQuestao.assunto) {
        showToast("Preencha Enunciado, Assunto e Resposta.", "error");
        return;
    }

    if (id) {
        // ✅ CORREÇÃO: Usando Object.assign em vez de spread operator
        const index = BD.findIndex(q => q.id == id);
        if (index !== -1) {
            BD[index] = Object.assign(
                {}, 
                BD[index], 
                novaQuestao, 
                {
                    stats: BD[index].stats || { correct: 0, wrong: 0 },
                    revisao: BD[index].revisao || false
                }
            );
        }
    } else {
        novaQuestao.id = Date.now();
        novaQuestao.stats = {
            correct: 0,
            wrong: 0
        };
        novaQuestao.revisao = false;
        BD.push(novaQuestao);
        questionsSinceBackup++;
        if (questionsSinceBackup >= 20) {
            alert("Lembrete: Faça backup clicando em Exportar!");
            questionsSinceBackup = 0;
        }
    }
    saveBD();
    showToast("Salvo!", "success");
    fecharFormulario();
    updateFilterOptions();
    renderQuestions();
}

function clearForm() {
    const form = document.getElementById('form');
    if (form) form.reset();
    document.getElementById('qid').value = '';
    const imgPreview = document.getElementById('imgPreview');
    const btnRemoverImg = document.getElementById('btnRemoverImg');
    if (imgPreview) {
        imgPreview.src = '';
        imgPreview.style.display = 'none';
    }
    if (btnRemoverImg) btnRemoverImg.style.display = 'none';
}

function editQ(id) {
    const q = BD.find(x => x.id == id);
    if (!q) return;

    switchModule('questoes');

    abrirFormulario();

    document.getElementById('qid').value = q.id;
    document.getElementById('assunto').value = q.assunto;
    document.getElementById('topico').value = q.topico;
    document.getElementById('enunciado').value = q.enunciado;
    document.getElementById('optA').value = q.A;
    document.getElementById('optB').value = q.B;
    document.getElementById('optC').value = q.C;
    document.getElementById('optD').value = q.D;
    document.getElementById('optE').value = q.E;
    document.getElementById('correta').value = q.correta;
    document.getElementById('resolucao').value = q.resolucao;
    document.getElementById('tags').value = q.tags;
    document.getElementById('ano').value = q.ano;
    document.getElementById('banca').value = q.banca;
    document.getElementById('disciplina').value = q.disciplina;
    if (document.getElementById('dificuldade')) document.getElementById('dificuldade').value = q.dificuldade || "";

    if (q.imagem) {
        const imgPreview = document.getElementById('imgPreview');
        const btnRemoverImg = document.getElementById('btnRemoverImg');
        if (imgPreview) {
            imgPreview.src = q.imagem;
            imgPreview.style.display = 'block';
        }
        if (btnRemoverImg) btnRemoverImg.style.display = 'inline-block';
    } else {
        const imgPreview = document.getElementById('imgPreview');
        const btnRemoverImg = document.getElementById('btnRemoverImg');
        if (imgPreview) imgPreview.style.display = 'none';
        if (btnRemoverImg) btnRemoverImg.style.display = 'none';
    }
}

function delQ(id) {
    if (!confirm('Excluir?')) return;
    BD = BD.filter(q => q.id != id);
    saveBD();
    showToast("Excluída.", "info");
    renderQuestions();
    updateFilterOptions();
}

function toggleRevisao(id, isQuiz = false) {
    const index = BD.findIndex(q => q.id == id);
    if (index !== -1) {
        BD[index].revisao = !BD[index].revisao;
        saveBD();

        if (isQuiz) {
            const btn = document.getElementById(`btnQuizRev-${id}`);
            if (btn) btn.classList.toggle('active');
        } else {
            renderQuestions();
        }
    }
}

function copyQuestion(id) {
    const q = BD.find(x => x.id == id);
    if (!q) return;
    const text = `${q.enunciado}\n\nA) ${q.A}\nB) ${q.B}\nC) ${q.C}\nD) ${q.D}\nE) ${q.E}\n\nResp: ${q.correta}`;
    navigator.clipboard.writeText(text).then(() => showToast('Copiado!', 'success'));
}

/* ---------------------------
   FUNÇÕES PARA BOTÕES DE AÇÃO RÁPIDA
----------------------------*/

function abrirFormularioQuestaoRapido() {
    switchModule('questoes');

    setTimeout(() => {
        abrirFormulario();

        const formCard = document.getElementById('formCard');
        if (formCard) {
            formCard.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Adiciona highlight
            formCard.classList.add('form-highlight');
            setTimeout(() => formCard.classList.remove('form-highlight'), 2000);
        }
    }, 100);
}

function abrirFormularioFlashcardRapido() {
    switchModule('flashcards');

    setTimeout(() => {
        openFCForm();

        const formCardFC = document.getElementById('formCardFC');
        if (formCardFC) {
            formCardFC.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Adiciona highlight
            formCardFC.classList.add('form-highlight');
            setTimeout(() => formCardFC.classList.remove('form-highlight'), 2000);
        }
    }, 100);
}

function iniciarTreinoRapido() {
    switchModule('questoes');
    setTimeout(() => {
        initQuiz();
    }, 100);
}

function verCronogramaRapido() {
    switchModule('cronograma');
}

/* ---------------------------
   Sistema de Tags Clicáveis
----------------------------*/
function filterByTag(tagName) {
    // Limpa outros filtros e define a tag no campo de busca
    const fSearch = document.getElementById('fSearch');
    if (fSearch) {
        fSearch.value = tagName;

        // Limpa outros filtros para focar apenas na tag
        clearOtherFilters();

        renderQuestions();
        showToast(`Filtrando por tag: ${tagName}`, 'info');
    }
}

function clearOtherFilters() {
    // Limpa filtros exceto o de busca
    const fDisciplina = document.getElementById('fDisciplina');
    const fAssunto = document.getElementById('fAssunto');
    const fBanca = document.getElementById('fBanca');
    const fAno = document.getElementById('fAno');
    const fDificuldade = document.getElementById('fDificuldade');
    const fRevisao = document.getElementById('fRevisao');

    if (fDisciplina) fDisciplina.value = "";
    if (fAssunto) fAssunto.value = "";
    if (fBanca) fBanca.value = "";
    if (fAno) fAno.value = "";
    if (fDificuldade) fDificuldade.value = "";
    if (fRevisao) fRevisao.checked = false;

    // Atualiza os filtros cascata
    updateFilterOptions();
}

function abrirFormulario() {
    clearForm();
    const formContainer = document.getElementById('formCard');
    const formCardFC = document.getElementById('formCardFC');
    if (formContainer) formContainer.style.display = 'block';
    if (formContainer) formContainer.scrollIntoView();
    if (formCardFC) formCardFC.style.display = 'none';
}

function fecharFormulario() {
    const formContainer = document.getElementById('formCard');
    if (formContainer) formContainer.style.display = 'none';
    clearForm();
}

/* ---------------------------
   FILTROS CASCATA (Universal)
----------------------------*/
// Configuração dos filtros de QUESTÕES que participarão da cascata
const questionFiltersConfig = [{
        el: document.getElementById('fDisciplina'),
        prop: 'disciplina',
        label: "Todas as disciplinas"
    },
    {
        el: document.getElementById('fAssunto'),
        prop: 'assunto',
        label: "Todos os assuntos"
    },
    {
        el: document.getElementById('fBanca'),
        prop: 'banca',
        label: "Todas as bancas"
    },
    {
        el: document.getElementById('fAno'),
        prop: 'ano',
        label: "Todos os anos"
    },
    {
        el: document.getElementById('fDificuldade'),
        prop: 'dificuldade',
        label: "Dificuldade"
    }
];

function updateFilterOptions() {
    // 1. Captura o estado atual de todos os selects + checkbox de revisão
    const activeStates = {};
    questionFiltersConfig.forEach(cfg => {
        if (cfg.el) activeStates[cfg.prop] = cfg.el.value;
    });
    const fRevisao = document.getElementById('fRevisao');
    const isRevisao = fRevisao ? fRevisao.checked : false;

    // 2. Para CADA filtro, recalcula suas opções disponíveis
    questionFiltersConfig.forEach(target => {
        if (!target.el) return;

        // Conjunto para guardar opções únicas encontradas
        const availableOptions = new Set();

        // 3. Varre o Banco de Dados
        BD.forEach(q => {
            // A regra de Revisão é absoluta (se marcada, só mostra o que é revisão)
            if (isRevisao && !q.revisao) return;

            // Verifica se a questão passa por TODOS os filtros, EXCETO o filtro alvo (target)
            let match = true;
            for (const cfg of questionFiltersConfig) {
                if (cfg.prop === target.prop) continue; // Ignora o próprio campo para não restringir a si mesmo

                const filterVal = activeStates[cfg.prop];
                // Se filtro tem valor e a questão não bate
                if (filterVal && String(q[cfg.prop] || '') !== filterVal) {
                    match = false;
                    break;
                }
            }

            // Se a questão é válida no contexto dos outros filtros, adiciona a opção deste campo
            if (match) {
                const val = q[target.prop];
                if (val) availableOptions.add(String(val));
            }
        });

        // 4. Ordena e Renderiza
        let optionsArray = [...availableOptions].sort();
        if (target.prop === 'ano') optionsArray.sort((a, b) => b - a); // Ano descrescente

        renderSelectOptions(target.el, target.label, optionsArray, activeStates[target.prop]);
    });
}

function renderSelectOptions(selectEl, defaultText, optionsArray, currentValue) {
    // Guarda o valor atual para tentar restaurar após re-render
    const val = currentValue || selectEl.value;
    selectEl.innerHTML = `<option value="">${defaultText}</option>` +
        optionsArray.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');

    // Tenta restaurar a seleção anterior se ela ainda existir nas novas opções
    if (val && optionsArray.includes(val)) {
        selectEl.value = val;
    } else {
        selectEl.value = "";
    }
}

function onFilterChange() {
    currentPage = 1;
    renderQuestions();
    updateFilterOptions();
}

/* ---------------------------
   Flashcards
----------------------------*/
function renderFlashcardsList() {
    const fcPlayer = document.getElementById('fcPlayer');
    const fcListContainer = document.getElementById('fcListContainer');

    if (fcPlayer && fcPlayer.style.display === 'block') return;

    if (fcListContainer) fcListContainer.style.display = 'block';

    const fcSearch = document.getElementById('fcSearch');
    const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');
    const fcCount = document.getElementById('fcCount');
    const listaFlashcards = document.getElementById('listaFlashcards');

    const term = fcSearch ? fcSearch.value.toLowerCase().trim() : '';
    const fDisc = fcDisciplinaFilter ? fcDisciplinaFilter.value : '';
    const fAssu = fcAssuntoFilter ? fcAssuntoFilter.value : '';

    const filtered = BD_FC.filter(fc => {
        const matchSearch = (fc.assunto || "").toLowerCase().includes(term) ||
            (fc.frente || "").toLowerCase().includes(term) ||
            (fc.verso || "").toLowerCase().includes(term);
        const matchDisc = !fDisc || fc.disciplina === fDisc;
        const matchAssunto = !fAssu || fc.assunto === fAssu;

        return matchSearch && matchDisc && matchAssunto;
    });

    if (fcCount) fcCount.textContent = `Total: ${filtered.length} flashcards`;

    if (filtered.length === 0) {
        if (listaFlashcards) listaFlashcards.innerHTML = `<p class="meta" style="text-align:center; padding: 20px;">Nenhum flashcard encontrado.</p>`;
        return;
    }

    if (listaFlashcards) {
        listaFlashcards.innerHTML = filtered.map(fc => `
            <div class="qitem" id="fc-${fc.id}">
                <div class="meta" style="margin-bottom:5px;">
                    <span class="badge-diff diff-media" style="margin:0; font-size:0.7rem;">${escapeHtml(fc.disciplina || 'Geral')}</span>
                    ${escapeHtml(fc.assunto || 'Sem Título')}
                </div>
                <p style="font-weight:500; margin-bottom:10px;">${escapeHtml(fc.frente)}</p>
                <div class="actions">
                    <button onclick="editFC(${fc.id})" class="btn secondary">Editar</button>
                    <button onclick="delFC(${fc.id})" class="btn secondary" style="background: var(--danger)">Excluir</button>
                </div>
            </div>
        `).join('');
    }
}

function openFCForm() {
    const formFC = document.getElementById('formFC');
    const formCardFC = document.getElementById('formCardFC');
    const formContainer = document.getElementById('formCard');

    if (formFC) formFC.reset();
    document.getElementById('fcId').value = '';
    if (formCardFC) formCardFC.style.display = 'block';
    if (formCardFC) formCardFC.scrollIntoView();
    if (formContainer) formContainer.style.display = 'none';
}

function saveFC(e) {
    e.preventDefault();
    const id = document.getElementById('fcId').value;
    const disciplina = document.getElementById('fcDisciplina').value.trim();
    const assunto = document.getElementById('fcAssunto').value.trim();
    const frente = document.getElementById('fcFrente').value.trim();
    const verso = document.getElementById('fcVerso').value.trim();

    if (!frente || !verso) {
        showToast("Preencha Frente e Verso.", "error");
        return;
    }

    const novoFC = {
        disciplina: disciplina || "Geral",
        assunto: assunto || "Sem Título",
        frente,
        verso
    };

    if (id) {
      // ✅ CORREÇÃO: Usando Object.assign em vez de spread operator
        const index = BD_FC.findIndex(f => f.id == id);
        if (index !== -1) {
            BD_FC[index] = Object.assign({}, 
			BD_FC[index], novoFC);
        }
    } else {
        novoFC.id = Date.now();
        BD_FC.push(novoFC);
    }
    saveBD_FC();
    showToast("Flashcard salvo!", "success");
    const formCardFC = document.getElementById('formCardFC');
    if (formCardFC) formCardFC.style.display = 'none';

    // Atualiza filtros após salvar
    updateFCFilters();
    renderFlashcardsList();
}

window.editFC = function(id) {
    const fc = BD_FC.find(f => f.id == id);
    if (!fc) return;
    openFCForm();
    document.getElementById('fcId').value = fc.id;
    document.getElementById('fcDisciplina').value = fc.disciplina || "";
    document.getElementById('fcAssunto').value = fc.assunto || fc.titulo || "";
    document.getElementById('fcFrente').value = fc.frente;
    document.getElementById('fcVerso').value = fc.verso;
};

window.delFC = function(id) {
    if (!confirm('Excluir este Flashcard?')) return;
    BD_FC = BD_FC.filter(f => f.id != id);
    saveBD_FC();

    // Atualiza filtros após excluir
    updateFCFilters();
    renderFlashcardsList();
};

function forceUpdateFCFilters() {
    if (CURRENT_MODULE === 'flashcards') {
        updateFCFilters();
    }
}

// 2. Cascata para FLASHCARDS
function updateFCFilters() {
    console.log("Atualizando filtros de flashcards...");

    const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');

    if (!fcDisciplinaFilter || !fcAssuntoFilter) {
        console.error("Elementos de filtro de flashcards não encontrados");
        return;
    }

    // Extrai disciplinas únicas
    const disciplinas = [...new Set(BD_FC.map(f => f.disciplina).filter(d => d && d.trim() !== ''))].sort();
    const currentDisc = fcDisciplinaFilter.value || '';

    console.log("Disciplinas encontradas:", disciplinas);

    // Renderiza opções de disciplina
    renderSelectOptions(fcDisciplinaFilter, "Todas as disciplinas", disciplinas, currentDisc);

    // Atualiza opções de assunto baseado na disciplina selecionada
    updateFCAssuntoOptions();
}

function updateFCAssuntoOptions() {
    const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');

    if (!fcDisciplinaFilter || !fcAssuntoFilter) return;

    const selectedDisc = fcDisciplinaFilter.value;
    let assuntos = [];

    if (selectedDisc) {
        assuntos = [...new Set(
            BD_FC
            .filter(f => f.disciplina === selectedDisc)
            .map(f => f.assunto)
            .filter(a => a && a.trim() !== '')
        )].sort();
    } else {
        assuntos = [...new Set(
            BD_FC
            .map(f => f.assunto)
            .filter(a => a && a.trim() !== '')
        )].sort();
    }

    console.log("Assuntos encontrados para disciplina", selectedDisc, ":", assuntos);

    renderSelectOptions(fcAssuntoFilter, "Todos os assuntos", assuntos, fcAssuntoFilter.value);
}

/* ---------------------------
   Flashcard Logic
----------------------------*/
function startFlashcardStudy() {
    if (BD_FC.length === 0) {
        showToast("Crie flashcards primeiro.", "error");
        return;
    }

    // Usa os filtros atuais para o estudo
    const fcSearch = document.getElementById('fcSearch');
    const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');

    const term = fcSearch ? fcSearch.value.toLowerCase().trim() : '';
    const fDisc = fcDisciplinaFilter ? fcDisciplinaFilter.value : '';
    const fAssu = fcAssuntoFilter ? fcAssuntoFilter.value : '';

    fcList = BD_FC.filter(fc => {
        const matchSearch = (fc.assunto || "").toLowerCase().includes(term) ||
            (fc.frente || "").toLowerCase().includes(term);
        const matchDisc = !fDisc || fc.disciplina === fDisc;
        const matchAssunto = !fAssu || fc.assunto === fAssu;
        return matchSearch && matchDisc && matchAssunto;
    });

    if (fcList.length === 0) {
        showToast("Nenhum flashcard neste filtro.", "error");
        return;
    }

    fcList.sort(() => Math.random() - 0.5);

    fcIndex = 0;

    const fcListContainer = document.getElementById('fcListContainer');
    const fcPlayer = document.getElementById('fcPlayer');
    const headerControls = document.querySelector('header .controls');

    if (fcListContainer) fcListContainer.style.display = 'none';
    if (fcPlayer) fcPlayer.style.display = 'block';
    if (headerControls) headerControls.style.display = 'none';

    showFlashcard(0);
}

function showFlashcard(index) {
    if (index < 0) index = 0;
    if (index >= fcList.length) index = fcList.length - 1;
    fcIndex = index;

    const fc = fcList[fcIndex];
    const fcContentFront = document.getElementById('fcContentFront');
    const fcContentBack = document.getElementById('fcContentBack');
    const fcCardElement = document.getElementById('fcCardElement');

    if (fcContentFront) fcContentFront.textContent = fc.frente;
    if (fcContentBack) fcContentBack.textContent = fc.verso;

    if (fcCardElement) fcCardElement.classList.remove('is-flipped');
}

function flipCard() {
    const fcCardElement = document.getElementById('fcCardElement');
    if (fcCardElement) fcCardElement.classList.toggle('is-flipped');
}

function nextCard() {
    if (fcIndex < fcList.length - 1) {
        const fcCardElement = document.getElementById('fcCardElement');
        if (fcCardElement && fcCardElement.classList.contains('is-flipped')) {
            fcCardElement.classList.remove('is-flipped');
            setTimeout(() => showFlashcard(fcIndex + 1), 300);
        } else {
            showFlashcard(fcIndex + 1);
        }
    } else {
        showToast("Fim da pilha!", "success");
    }
}

function prevCard() {
    if (fcIndex > 0) {
        const fcCardElement = document.getElementById('fcCardElement');
        if (fcCardElement && fcCardElement.classList.contains('is-flipped')) {
            fcCardElement.classList.remove('is-flipped');
            setTimeout(() => showFlashcard(fcIndex - 1), 300);
        } else {
            showFlashcard(fcIndex - 1);
        }
    }
}

function exitFlashcardStudy() {
    const fcPlayer = document.getElementById('fcPlayer');
    const fcListContainer = document.getElementById('fcListContainer');
    const headerControls = document.querySelector('header .controls');

    if (fcPlayer) fcPlayer.style.display = 'none';
    if (fcListContainer) fcListContainer.style.display = 'block';
    if (headerControls) headerControls.style.display = 'flex';
}

/* ---------------------------
   QUIZ E TIMER
----------------------------*/
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
}

function startTimer() {
    const quizTimerEl = document.getElementById('quizTimer');
    startTime = Date.now();
    if (quizTimerEl) quizTimerEl.textContent = "00:00";
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        if (quizTimerEl) quizTimerEl.textContent = formatTime(elapsed);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function initQuiz() {
    try {
        if (BD.length === 0) {
            showToast('Adicione questões primeiro.', 'error');
            return;
        }

        const headerControls = document.querySelector('header .controls');
        const formContainer = document.getElementById('formCard');
        const paginationControls = document.getElementById('paginationControls');
        const questoesCountEl = document.getElementById('questoesCount');
        const timerContainer = document.getElementById('timerContainer');

        if (headerControls) headerControls.style.display = 'none';
        if (formContainer) formContainer.style.display = 'none';
        if (paginationControls) paginationControls.style.display = 'none';
        if (questoesCountEl) questoesCountEl.style.display = 'none';
        document.querySelectorAll('.top-bar .search').forEach(el => el.style.display = 'none');

        if (timerContainer) timerContainer.style.display = 'block';

        const filteredForQuiz = getFilteredBD();

        if (filteredForQuiz.length === 0) {
            showToast('Nenhuma questão para os filtros atuais.', 'error');
            sairTreino(false);
            return;
        }

        filteredForQuiz.sort(() => Math.random() - 0.5);

        let limit = 0;
        const fQtdTreino = document.getElementById('fQtdTreino');
        if (fQtdTreino) limit = parseInt(fQtdTreino.value) || 0;

        if (limit > 0 && limit < filteredForQuiz.length) {
            quizOrder = filteredForQuiz.slice(0, limit);
        } else {
            quizOrder = filteredForQuiz;
        }

        const lista = document.getElementById('lista');
        if (lista) {
            lista.classList.remove('list');
            lista.classList.add('quiz-container');
        }

        inQuiz = true;
        quizIndex = 0;
        const quizTimerEl = document.getElementById('quizTimer');
        if (quizTimerEl) quizTimerEl.style.display = 'inline-block';
        startTimer();
        mostrarQuiz();
    } catch (err) {
        console.error(err);
        alert("Erro ao iniciar Quiz: " + err.message);
        sairTreino(false);
    }
}

function mostrarQuiz() {
    try {
        if (!inQuiz || quizOrder.length === 0) return;

        const q = quizOrder[quizIndex];
        const total = quizOrder.length;
        const current = quizIndex + 1;

        const resolucaoEl = document.getElementById('resultado');
        const quizActions = document.getElementById('quizActions');
        const lista = document.getElementById('lista');
        const quizTimerEl = document.getElementById('quizTimer');

        if (!q) {
            stopTimer();
            if (lista) {
                lista.innerHTML = `
            <div class="card quiz-card" style="text-align: center;">
              <div style="font-size: 4rem; margin-bottom: 20px;">🎉</div>
              <h2 style="color: var(--success); margin-bottom: 15px;">Treino Concluído!</h2>
              <p style="font-size: 1.2rem; margin-bottom: 10px;">Você completou <strong>${total} questões</strong></p>
              <p style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 25px;">
                Tempo total: <strong>${quizTimerEl ? quizTimerEl.textContent : '00:00'}</strong>
              </p>
              <button onclick="sairTreino(false)" class="btn primary" style="padding: 15px 30px; font-size: 1.1rem;">
                🏠 Voltar ao Banco
              </button>
            </div>`;
            }
            if (quizTimerEl) quizTimerEl.style.display = 'none';
            if (resolucaoEl) resolucaoEl.innerHTML = '';
            if (quizActions) quizActions.innerHTML = '';
            return;
        }

        const opcoes = [{
                letra: 'A',
                texto: q.A
            },
            {
                letra: 'B',
                texto: q.B
            },
            {
                letra: 'C',
                texto: q.C
            },
            {
                letra: 'D',
                texto: q.D
            },
            {
                letra: 'E',
                texto: q.E
            }
        ].filter(opt => opt.texto && opt.texto.trim() !== "");

        const contentHtml = renderEnunciadoWithImage(q.enunciado, q.imagem, true);
        const revClass = q.revisao ? 'active' : '';
        const revTitle = q.revisao ? 'Remover da Revisão' : 'Marcar para Revisão';

        if (lista) {
            lista.innerHTML = `
            <div class="card quiz-card">
              <!-- Header com botão de revisão no canto superior direito -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <div style="flex: 1;">
                  <div class="questao-atual" style="display: inline-block; margin-bottom: 10px;">Questão ${current}/${total}</div>
                  <div style="color: var(--text-muted); font-size: 0.9rem;">
                    <strong>${escapeHtml(q.disciplina || 'Geral')}</strong> • ${escapeHtml(q.banca || 'N/A')} • ${escapeHtml(q.ano || 'Ano')}
                    ${q.assunto ? ` • ${escapeHtml(q.assunto)}` : ''}
                  </div>
                </div>
                <!-- Botão de revisão no canto superior direito -->
                <button id="btnQuizRev-${q.id}" class="btn-icon ${revClass}" onclick="toggleRevisao(${q.id}, true)" title="${revTitle}" 
                        style="font-size: 1.5rem; margin-left: 15px; flex-shrink: 0;">
                  🚩
                </button>
              </div>

              <!-- Enunciado -->
              <div style="
                background: var(--bg); 
                padding: 20px; 
                border-radius: 12px; 
                border: 2px solid var(--border);
                margin-bottom: 25px;
                font-size: 1.1rem;
                line-height: 1.6;
              ">
                ${contentHtml}
              </div>

              <!-- Opções -->
              <div style="margin-top: 10px;">
                <h4 style="margin: 0 0 15px 0; color: var(--text-primary); text-align: center;">Selecione a alternativa correta:</h4>
                <div id="opcoesQuiz" style="display: flex; flex-direction: column; gap: 12px;">
                  ${opcoes.map(opt => `
                    <button class="quiz-option" onclick="checarResposta(this, '${opt.letra}', ${q.id})">
                      <strong style="color: inherit;">${opt.letra})</strong> 
                      <span style="margin-left: 8px;">${escapeHtml(opt.texto)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }

        if (resolucaoEl) resolucaoEl.innerHTML = '';

        // Botões Sair e Pular no canto inferior direito
        if (quizActions) {
            quizActions.innerHTML = `
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button id="btnSair" onclick="sairTreino()" class="btn secondary" style="background: var(--danger); color: white;">
                🏃 Sair
              </button>
              <button id="btnPular" onclick="pularPergunta()" class="btn secondary">
                ⏭️ Pular
              </button>
            </div>
          `;
        }
    } catch (err) {
        console.error(err);
        alert("Erro ao exibir questão: " + err.message);
        pularPergunta();
    }
}

function checarResposta(btn, letra, id) {
    const q = quizOrder.find(x => x.id == id);
    const realQ = BD.find(x => x.id == id);
    if (!q) return;

    const opcoes = document.querySelectorAll('.quiz-option');
    opcoes.forEach(option => option.disabled = true);
    btn.classList.add('selecionada');

    const quizActions = document.getElementById('quizActions');
    const btnPular = document.getElementById('btnPular');
    if (btnPular) btnPular.remove();

    if (realQ) {
        if (!realQ.stats) realQ.stats = {
            correct: 0,
            wrong: 0
        };
        if (letra === q.correta) {
            realQ.stats.correct++;
        } else {
            realQ.stats.wrong++;
        }
        saveBD();
        updateDailyGoal(1);
    }

    if (quizActions && !document.getElementById('btnVerResp')) {
        quizActions.innerHTML += `
          <button id="btnVerResp" onclick="mostrarResolucao()" class="btn primary" style="margin-left: 10px;">Ver Resposta</button>
      `;
    }
}

function mostrarResolucao() {
    const q = quizOrder[quizIndex];
    if (!q) return;

    const opcoes = document.querySelectorAll('.quiz-option');
    const resolucaoEl = document.getElementById('resultado');
    let acertou = false;

    opcoes.forEach(option => {
        const text = option.textContent.trim();
        const letra = text.substring(0, 1);
        if (letra === q.correta) {
            option.classList.add('certa');
            if (option.classList.contains('selecionada')) acertou = true;
        }
        if (option.classList.contains('selecionada') && letra !== q.correta) {
            option.classList.add('errada');
        }
        option.classList.remove('selecionada');
    });

    let feedbackHTML = acertou ?
        `<div class="quiz-feedback acerto">
         <div style="font-size: 2rem; margin-bottom: 10px;">🎉</div>
         <div>Resposta Correta!</div>
         <div style="font-size: 0.9rem; margin-top: 8px; opacity: 0.9;">Você acertou esta questão!</div>
       </div>` :
        `<div class="quiz-feedback erro">
         <div style="font-size: 2rem; margin-bottom: 10px;">💡</div>
         <div>Resposta Incorreta</div>
         <div style="font-size: 0.9rem; margin-top: 8px; opacity: 0.9;">A alternativa correta é <strong>${q.correta}</strong></div>
       </div>`;

    // Resolução formatada com melhor visualização
    const resolucaoConteudo = q.resolucao ?
        `<div class="quiz-resolucao">
       <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
         <span>💡</span>
         <span>Resolução Detalhada</span>
       </div>
       <div style="line-height: 1.7; font-size: 1.05rem;">
         ${escapeHtml(q.resolucao).replace(/\n/g, '<br>')}
       </div>
       ${q.tags ? `
         <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border);">
           <strong style="color: var(--text-muted);">Tags:</strong>
           <div style="margin-top: 8px;">
             ${q.tags.split(',').filter(t => t.trim()).map(t => 
               `<span class="tag" style="font-size: 0.8rem; margin: 2px;">${escapeHtml(t.trim())}</span>`
             ).join('')}
           </div>
         </div>
       ` : ''}
     </div>` :
        `<div class="quiz-resolucao">
         <div style="text-align: center; padding: 30px 20px; color: var(--text-muted);">
           <div style="font-size: 3rem; margin-bottom: 15px;">📝</div>
           <div style="font-size: 1.1rem; font-weight: 600;">Nenhuma resolução cadastrada</div>
           <div style="margin-top: 8px;">Esta questão ainda não possui uma resolução detalhada.</div>
         </div>
       </div>`;

    if (resolucaoEl) resolucaoEl.innerHTML = feedbackHTML + resolucaoConteudo;

    const quizActions = document.getElementById('quizActions');
    const btnVerResp = document.getElementById('btnVerResp');
    if (btnVerResp) btnVerResp.remove();

    if (quizActions) {
        const btnProx = document.getElementById('btnProx');
        if (!btnProx) {
            quizActions.innerHTML += `
        <button id="btnProx" onclick="proximaPergunta()" class="btn primary" style="
          background: linear-gradient(135deg, var(--success), var(--accent));
          color: white;
          font-weight: 700;
          padding: 15px 30px;
          font-size: 1.1rem;
        ">
          ⏭️ Próxima Questão
        </button>
      `;
        }
    }

    // Scroll suave para a resolução
    setTimeout(() => {
        if (resolucaoEl) {
            resolucaoEl.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }, 300);
}

function proximaPergunta() {
    quizIndex++;
    mostrarQuiz();
}

function pularPergunta() {
    const q = quizOrder.splice(quizIndex, 1)[0];
    quizOrder.push(q);
    mostrarQuiz();
}

function sairTreino(askConfirm = true) {
    if (askConfirm && !confirm('Sair do treino?')) return;

    stopTimer();
    inQuiz = false;
    const quizTimerEl = document.getElementById('quizTimer');
    if (quizTimerEl) quizTimerEl.style.display = 'none';

    const headerControls = document.querySelector('header .controls');
    const formContainer = document.getElementById('formCard');
    const timerContainer = document.getElementById('timerContainer');

    if (headerControls) headerControls.style.display = 'flex';
    if (formContainer) formContainer.style.display = 'none';

    document.querySelectorAll('.top-bar .search').forEach(el => el.style.display = 'flex');
    if (timerContainer) timerContainer.style.display = 'none';

    renderQuestions();
}

/* ---------------------------
   Função de Filtro Global (Questões)
----------------------------*/
function getFilteredBD() {
    const fSearch = document.getElementById('fSearch');
    const fAssunto = document.getElementById('fAssunto');
    const fAno = document.getElementById('fAno');
    const fBanca = document.getElementById('fBanca');
    const fDisciplina = document.getElementById('fDisciplina');
    const fRevisao = document.getElementById('fRevisao');
    const fDificuldade = document.getElementById('fDificuldade');

    const termo = fSearch ? fSearch.value.toLowerCase().trim() : '';
    const valAssunto = fAssunto ? fAssunto.value : '';
    const valAno = fAno ? fAno.value : '';
    const valBanca = fBanca ? fBanca.value : '';
    const valDisciplina = fDisciplina ? fDisciplina.value : '';
    const valRevisao = fRevisao ? fRevisao.checked : false;
    const valDificuldade = fDificuldade ? fDificuldade.value : '';

    return BD.filter(q => {
        const matchSearch = !termo ||
            (q.enunciado || "").toLowerCase().includes(termo) ||
            (q.assunto || "").toLowerCase().includes(termo) ||
            (q.topico || "").toLowerCase().includes(termo) ||
            (q.tags || "").toLowerCase().includes(termo);

        const matchAssunto = !valAssunto || q.assunto === valAssunto;
        const matchAno = !valAno || String(q.ano) === valAno;
        const matchBanca = !valBanca || q.banca === valBanca;
        const matchDisciplina = !valDisciplina || q.disciplina === valDisciplina;
        const matchRevisao = !valRevisao || q.revisao === true;
        const matchDificuldade = !valDificuldade || q.dificuldade === valDificuldade;

        return matchSearch && matchAssunto && matchAno && matchBanca && matchDisciplina && matchRevisao && matchDificuldade;
    });
}

function renderQuestions() {
    if (inQuiz) {
        const questoesCountEl = document.getElementById('questoesCount');
        const paginationControls = document.getElementById('paginationControls');
        if (questoesCountEl) questoesCountEl.style.display = 'none';
        if (paginationControls) paginationControls.style.display = 'none';
        return;
    }

    const lista = document.getElementById('lista');
    if (lista) {
        lista.classList.remove('quiz-container');
        lista.classList.add('list');
    }

    const resEl = document.getElementById('resultado');
    const actEl = document.getElementById('quizActions');
    if (resEl) resEl.innerHTML = '';
    if (actEl) actEl.innerHTML = '';

    const filteredBD = getFilteredBD();
    const total = filteredBD.length;

    const questoesCountEl = document.getElementById('questoesCount');
    if (questoesCountEl) {
        questoesCountEl.style.display = 'block';
        questoesCountEl.innerHTML = `Total: <span style="color: var(--accent)">${total}</span> questões`;
    }

    if (total === 0) {
        if (lista) {
            lista.innerHTML = `<p class="meta" style="text-align:center; padding: 20px;">Nenhuma questão encontrada.</p>`;
        }
        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) paginationControls.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = filteredBD.slice(start, end);

    if (lista) {
        lista.innerHTML = pageItems.map(q => {
            const stats = q.stats || {
                correct: 0,
                wrong: 0
            };
            const totalAttempts = stats.correct + stats.wrong;
            const perc = totalAttempts > 0 ? Math.round((stats.correct / totalAttempts) * 100) : 0;
            const statsHtml = totalAttempts > 0 ?
                `<span class="stats-badge" title="${stats.correct} acertos / ${stats.wrong} erros">Tx: ${perc}% (${totalAttempts}x)</span>` :
                '';

            const revClass = q.revisao ? 'active' : '';
            const revTitle = q.revisao ? 'Remover da Revisão' : 'Marcar para Revisão';

            let diffBadge = '';
            if (q.dificuldade) {
                let diffClass = 'diff-media';
                if (q.dificuldade === 'Fácil') diffClass = 'diff-facil';
                if (q.dificuldade === 'Difícil') diffClass = 'diff-dificil';
                diffBadge = `<span class="badge-diff ${diffClass}">${q.dificuldade}</span>`;
            }

            return `
        <div class="qitem" id="q-${q.id}">
          <div class="meta header-meta">
            <div>
                ${escapeHtml(q.disciplina || 'Disciplina')} — ${escapeHtml(q.banca || 'Banca')} (${escapeHtml(q.ano || 'Ano')})
                ${diffBadge}
                <br>
                <b>${escapeHtml(q.assunto)}</b> — ${escapeHtml(q.topico)}
            </div>
            <div style="text-align:right;">
                <button class="btn-icon ${revClass}" onclick="toggleRevisao(${q.id})" title="${revTitle}">🚩</button>
                <br>
                <small>Resp: <b>${escapeHtml(q.correta)}</b></small>
            </div>
          </div>

          <p style="margin: 8px 0;">${renderEnunciadoWithImage(q.enunciado, q.imagem, false)}</p>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <div class="tags-container">
                 ${(q.tags || "").split(',').filter(t => t.trim()).map(t => 
                   `<span class="tag clickable-tag" onclick="filterByTag('${escapeHtml(t.trim()).replace(/'/g, "\\'")}')" 
                         title="Clique para filtrar por esta tag">${escapeHtml(t.trim())}</span>`
                 ).join('')}
                 ${statsHtml}
              </div>
          </div>

          <div class="actions">
            <button onclick="editQ(${q.id})" class="btn secondary">Editar</button>
            <button onclick="delQ(${q.id})" class="btn secondary" style="background: var(--danger)">Excluir</button>
            <button onclick="copyQuestion(${q.id})" class="btn secondary" style="background: var(--success)">Copiar</button>
          </div>
        </div>
      `
        }).join('');
    }


    const paginationControls = document.getElementById('paginationControls');
    const pageInfo = document.getElementById('pageInfo');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');

    if (paginationControls) {
        paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';
        if (pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        if (btnPrevPage) btnPrevPage.disabled = currentPage === 1;
        if (btnNextPage) btnNextPage.disabled = currentPage === totalPages;
    }
}

/* ---------------------------
   Cadernos e Backup
----------------------------*/
function populateSavedFilters() {
    const savedFiltersSelect = document.getElementById('savedFilters');
    if (!savedFiltersSelect) return;
    savedFiltersSelect.innerHTML = `<option value="">📂 Meus Cadernos...</option>`;
    Object.keys(SAVED_FILTERS).forEach(name => {
        savedFiltersSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

function saveCurrentFilter() {
    const name = prompt("Dê um nome para este caderno:");
    if (!name) return;

    const fAssunto = document.getElementById('fAssunto');
    const fDisciplina = document.getElementById('fDisciplina');
    const fBanca = document.getElementById('fBanca');
    const fAno = document.getElementById('fAno');
    const fRevisao = document.getElementById('fRevisao');
    const fDificuldade = document.getElementById('fDificuldade');

    SAVED_FILTERS[name] = {
        assunto: fAssunto ? fAssunto.value : "",
        disciplina: fDisciplina ? fDisciplina.value : "",
        banca: fBanca ? fBanca.value : "",
        ano: fAno ? fAno.value : "",
        revisao: fRevisao ? fRevisao.checked : false,
        dificuldade: fDificuldade ? fDificuldade.value : ""
    };
    localStorage.setItem('BD_FILTROS', JSON.stringify(SAVED_FILTERS));
    populateSavedFilters();
    const savedFiltersSelect = document.getElementById('savedFilters');
    if (savedFiltersSelect) savedFiltersSelect.value = name;
    const btnDeleteFilter = document.getElementById('btnDeleteFilter');
    if (btnDeleteFilter) btnDeleteFilter.style.display = 'inline-block';
    showToast(`Caderno "${name}" salvo!`, 'success');
}

function loadSavedFilter() {
    const savedFiltersSelect = document.getElementById('savedFilters');
    if (!savedFiltersSelect) return;
    const name = savedFiltersSelect.value;
    if (!name) {
        const btnDeleteFilter = document.getElementById('btnDeleteFilter');
        if (btnDeleteFilter) btnDeleteFilter.style.display = 'none';
        return;
    }
    const saved = SAVED_FILTERS[name];
    if (saved) {
        const fAssunto = document.getElementById('fAssunto');
        const fDisciplina = document.getElementById('fDisciplina');
        const fBanca = document.getElementById('fBanca');
        const fAno = document.getElementById('fAno');
        const fRevisao = document.getElementById('fRevisao');
        const fDificuldade = document.getElementById('fDificuldade');
        const btnDeleteFilter = document.getElementById('btnDeleteFilter');

        if (fAssunto) fAssunto.value = saved.assunto || "";
        if (fDisciplina) fDisciplina.value = saved.disciplina || "";
        if (fBanca) fBanca.value = saved.banca || "";
        if (fAno) fAno.value = saved.ano || "";
        if (fRevisao) fRevisao.checked = saved.revisao || false;
        if (fDificuldade) fDificuldade.value = saved.dificuldade || "";
        if (btnDeleteFilter) btnDeleteFilter.style.display = 'inline-block';
        showToast(`Caderno "${name}" carregado.`, 'info');
        onFilterChange();
    }
}

function deleteFilter() {
    const savedFiltersSelect = document.getElementById('savedFilters');
    if (!savedFiltersSelect) return;
    const name = savedFiltersSelect.value;
    if (!name) return;
    if (confirm(`Excluir o caderno "${name}"?`)) {
        delete SAVED_FILTERS[name];
        localStorage.setItem('BD_FILTROS', JSON.stringify(SAVED_FILTERS));
        populateSavedFilters();
        const btnDeleteFilter = document.getElementById('btnDeleteFilter');
        if (btnDeleteFilter) btnDeleteFilter.style.display = 'none';
        showToast('Caderno excluído.', 'info');
    }
}

/* ---------------------------
   Estatísticas
----------------------------*/
function showStats() {
    const totalQuestions = BD.length;
    let totalAttempts = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let uniqueAnswered = 0;

    const discMap = {};

    BD.forEach(q => {
        if (q.stats) {
            const c = q.stats.correct || 0;
            const w = q.stats.wrong || 0;
            const t = c + w;

            if (t > 0) {
                uniqueAnswered++;
                totalCorrect += c;
                totalWrong += w;
                totalAttempts += t;

                const disc = q.disciplina ? q.disciplina.trim() : 'Sem Disciplina';
                if (!discMap[disc]) discMap[disc] = {
                    correct: 0,
                    wrong: 0
                };
                discMap[disc].correct += c;
                discMap[disc].wrong += w;
            }
        }
    });

    const accuracy = totalAttempts > 0 ? ((totalCorrect / totalAttempts) * 100).toFixed(1) : "0.0";
    const bankProgress = totalQuestions > 0 ? ((uniqueAnswered / totalQuestions) * 100).toFixed(1) : "0.0";

    let html = `
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Banco</h3>
                <div class="value">${totalQuestions}</div>
            </div>
             <div class="stat-card">
                <h3>Respondidas</h3>
                <div class="value" title="${uniqueAnswered} questões únicas">${uniqueAnswered}</div>
            </div>
             <div class="stat-card success">
                <h3>Acertos</h3>
                <div class="value">${totalCorrect}</div>
            </div>
             <div class="stat-card danger">
                <h3>Erros</h3>
                <div class="value">${totalWrong}</div>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span style="font-weight:bold; color:var(--text-primary)">Taxa de Acerto: ${accuracy}%</span>
            <span style="font-size:0.9rem; color:var(--text-muted)">Progresso do Banco: ${bankProgress}%</span>
        </div>
        <div style="background: var(--border); height: 12px; border-radius: 6px; overflow: hidden; display:flex; margin-bottom: 5px;">
            <div style="width: ${accuracy}%; background: var(--success); height: 100%;" title="Acertos"></div>
            <div style="width: ${100 - accuracy}%; background: var(--danger); height: 100%;" title="Erros"></div>
        </div>
    `;

    html += `<h3 class="stat-section-title">Desempenho por Disciplina</h3>`;
    // ✅ CORREÇÃO: Sem spread operator
    const discArray = Object.keys(discMap).map(key => {
        const discData = discMap[key];
        return {
            name: key,
            correct: discData.correct,
            wrong: discData.wrong,
            total: discData.correct + discData.wrong
        };
    }).sort((a, b) => b.total - a.total);

    if (discArray.length === 0) {
        html += `<p style="text-align:center; color:var(--text-muted); padding: 20px;">Nenhuma questão respondida ainda.</p>`;
    } else {
        html += `<div class="stat-table-container"><table class="stat-table">
            <thead>
                <tr>
                    <th>Disciplina</th>
                    <th>Resoluções</th>
                    <th>C / E</th>
                    <th>% Acerto</th>
                </tr>
            </thead>
            <tbody>`;
        discArray.forEach(d => {
            const discAcc = ((d.correct / d.total) * 100).toFixed(0);
            const colorBar = discAcc >= 70 ? 'var(--success)' : (discAcc >= 40 ? 'var(--warning)' : 'var(--danger)');
            html += `<tr>
                    <td>${escapeHtml(d.name)}</td>
                    <td style="text-align:center;">${d.total}</td>
                    <td><span style="color:var(--success); font-weight:bold;">${d.correct}</span> / <span style="color:var(--danger); font-weight:bold;">${d.wrong}</span></td>
                    <td>
                        <div style="display:flex; align-items:center;">
                            <div class="mini-progress-track">
                                <div class="mini-progress-fill" style="width:${discAcc}%; background: ${colorBar};"></div>
                            </div>
                            <span>${discAcc}%</span>
                        </div>
                    </td>
                </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    const statsBody = document.getElementById('statsBody');
    if (statsBody) statsBody.innerHTML = html;
}

/* ---------------------------
   Export/Import
----------------------------*/
function exportDB() {
    const backup = {
        questoes: BD,
        flashcards: BD_FC
    };
    const dataStr = JSON.stringify(backup, null, 2);
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    link.download = `backup_completo_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    localStorage.setItem('LAST_BACKUP_DATE', new Date().toLocaleDateString('pt-BR'));
    showToast('Backup exportado com sucesso!', 'success');
}

function importDB() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

function clearDB() {
    if (confirm('ATENÇÃO: Isso apagará TODAS as questões e flashcards. Confirmar?')) {
        BD = [];
        BD_FC = [];
        saveBD();
        saveBD_FC();
        updateFilterOptions();
        updateFCFilters();
        renderQuestions();
        renderFlashcardsList();
        showToast('Todos os dados foram limpos!', 'info');
    }
}

/* ---------------------------
   CRONOGRAMA (Funções Principais)
----------------------------*/
function initCronograma() {
    console.log("Inicializando cronograma...");

    // Configura data mínima como hoje
    const hoje = new Date().toISOString().split('T')[0];
    const dataProvaInput = document.getElementById('dataProva');
    if (dataProvaInput) {
        dataProvaInput.min = hoje;
        console.log("Data mínima configurada:", hoje);
    }

    // Carrega matérias salvas
    renderizarMateriasCronograma();

    // Tenta carregar cronograma existente
    try {
        const cronogramaSalvo = localStorage.getItem('BD_CRONOGRAMA');
        console.log("Cronograma salvo encontrado:", cronogramaSalvo);

        if (cronogramaSalvo && cronogramaSalvo !== 'null' && cronogramaSalvo !== 'undefined') {
            const parsed = JSON.parse(cronogramaSalvo);
            if (parsed && parsed.dataProva) {
                CRONOGRAMA_DATA = parsed;
                console.log("Cronograma carregado:", CRONOGRAMA_DATA);
                exibirCronograma(CRONOGRAMA_DATA);
                return;
            }
        }
        // Se não há cronograma, mostra o setup
        mostrarSetupCronograma();
    } catch (e) {
        console.error('Erro ao carregar cronograma:', e);
        mostrarSetupCronograma();
    }

    // Toggle do cronograma
    const btnToggle = document.getElementById('btnToggleCronograma');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleCronograma);
    }
}

function mostrarSetupCronograma() {
    const setup = document.getElementById('cronogramaSetup');
    const view = document.getElementById('cronogramaView');
    console.log("Mostrando setup do cronograma");

    if (setup) setup.style.display = 'block';
    if (view) view.style.display = 'none';
}

function toggleCronograma() {
    const content = document.getElementById('cronogramaContent');
    const btn = document.getElementById('btnToggleCronograma');

    if (!content) {
        console.error("Elemento cronogramaContent não encontrado");
        return;
    }

    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (btn) btn.textContent = '▼';
    } else {
        content.style.display = 'none';
        if (btn) btn.textContent = '▶';
    }
}

function reiniciarCronograma() {
    if (!confirm('Isso irá apagar o cronograma atual. Continuar?')) return;

    CRONOGRAMA_DATA = null;
    localStorage.removeItem('BD_CRONOGRAMA');

    mostrarSetupCronograma();
    document.getElementById('listaMateriasCronograma').innerHTML = '';
    MATERIAS_CRONOGRAMA = [];
    localStorage.setItem('BD_MATERIAS', JSON.stringify(MATERIAS_CRONOGRAMA));
    atualizarContadorMaterias();

    showToast('Cronograma reiniciado!', 'info');
}

function initNavegacaoCronograma() {
    console.log("Navegação do cronograma inicializada");
}

function atualizarContadorMaterias() {
    const countElement = document.getElementById('materiasCount');
    if (countElement) {
        countElement.textContent = `${MATERIAS_CRONOGRAMA.length} matérias`;
    }
}

function renderizarMateriasCronograma() {
    const container = document.getElementById('listaMateriasCronograma');
    if (!container) return;

    if (MATERIAS_CRONOGRAMA.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 30px; color: var(--text-muted);">📚 Nenhuma matéria adicionada</div>';
    } else {
        container.innerHTML = MATERIAS_CRONOGRAMA.map((materia, index) => `
            <div class="materia-item" id="materia-${index}">
                <span>📚 ${escapeHtml(materia)}</span>
                <button onclick="removerMateria(${index})" class="btn-icon" style="color: var(--danger); background: none; border: none; font-size: 1.2rem; cursor: pointer;" title="Remover matéria">×</button>
            </div>
        `).join('');
    }

    atualizarContadorMaterias();
}

function importarMaterias() {
    // Extrai disciplinas únicas do banco de questões
    const disciplinas = [...new Set(BD.map(q => q.disciplina).filter(d => d && d.trim() !== ''))];

    if (disciplinas.length === 0) {
        showToast('Nenhuma disciplina encontrada no banco de questões!', 'error');
        return;
    }

    // Cria modal para seleção de disciplinas
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.id = 'importarMateriasModal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>📥 Importar Disciplinas do Banco</h3>
                <button onclick="this.closest('dialog').close()" class="btn secondary">×</button>
            </div>
            <p style="margin-bottom: 15px; color: var(--text-muted);">
                Selecione as disciplinas que deseja importar do banco de questões:
            </p>
            <div class="disciplinas-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
                ${disciplinas.map((disciplina, index) => `
                    <label class="disciplina-checkbox" style="display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px; cursor: pointer; transition: background 0.2s;">
                        <input type="checkbox" value="${escapeHtml(disciplina)}" ${MATERIAS_CRONOGRAMA.includes(disciplina) ? 'disabled' : ''} 
                               style="margin: 0;" onchange="toggleDisciplinaSelection(this)">
                        <span style="flex: 1; ${MATERIAS_CRONOGRAMA.includes(disciplina) ? 'opacity: 0.6;' : ''}">
                            📚 ${escapeHtml(disciplina)}
                        </span>
                        ${MATERIAS_CRONOGRAMA.includes(disciplina) ? 
                          '<span style="color: var(--text-muted); font-size: 0.8rem;">(já adicionada)</span>' : ''}
                    </label>
                `).join('')}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span id="contadorSelecionadas" style="font-size: 0.9rem; color: var(--text-muted);">
                    0 disciplinas selecionadas
                </span>
                <button type="button" onclick="selecionarTodasDisciplinas()" class="btn secondary" style="padding: 5px 10px; font-size: 0.8rem;">
                    Selecionar Todas
                </button>
            </div>
            <div class="modal-actions">
                <button onclick="processarDisciplinasImportadas()" class="btn primary" id="btnImportarDisciplinas" disabled>
                    Importar Selecionadas
                </button>
                <button onclick="this.closest('dialog').close()" class="btn secondary">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    // Atualiza contador inicial
    atualizarContadorSelecionadas();
}

function toggleDisciplinaSelection(checkbox) {
    const label = checkbox.closest('.disciplina-checkbox');
    if (checkbox.checked) {
        label.style.background = 'var(--accent-light)';
        label.style.borderColor = 'var(--accent)';
    } else {
        label.style.background = '';
        label.style.borderColor = 'var(--border)';
    }
    atualizarContadorSelecionadas();
}

function selecionarTodasDisciplinas() {
    const checkboxes = document.querySelectorAll('#importarMateriasModal input[type="checkbox"]:not(:disabled)');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        toggleDisciplinaSelection(checkbox);
    });
}

function atualizarContadorSelecionadas() {
    const checkboxes = document.querySelectorAll('#importarMateriasModal input[type="checkbox"]:not(:disabled)');
    const selecionadas = Array.from(checkboxes).filter(cb => cb.checked).length;
    const total = checkboxes.length;

    const contador = document.getElementById('contadorSelecionadas');
    const btnImportar = document.getElementById('btnImportarDisciplinas');

    if (contador) {
        contador.textContent = `${selecionadas} de ${total} disciplinas selecionadas`;
    }

    if (btnImportar) {
        btnImportar.disabled = selecionadas === 0;
    }
}

function processarDisciplinasImportadas() {
    const modal = document.getElementById('importarMateriasModal');
    const checkboxes = document.querySelectorAll('#importarMateriasModal input[type="checkbox"]:checked');

    if (checkboxes.length === 0) {
        showToast('Selecione pelo menos uma disciplina!', 'error');
        return;
    }

    const novasDisciplinas = Array.from(checkboxes).map(cb => cb.value);
    let adicionadas = 0;

    novasDisciplinas.forEach(disciplina => {
        if (!MATERIAS_CRONOGRAMA.includes(disciplina)) {
            MATERIAS_CRONOGRAMA.push(disciplina);
            adicionadas++;
        }
    });

    if (adicionadas > 0) {
        localStorage.setItem('BD_MATERIAS', JSON.stringify(MATERIAS_CRONOGRAMA));
        renderizarMateriasCronograma();
        showToast(`${adicionadas} disciplina(s) importada(s) com sucesso!`, 'success');
    } else {
        showToast('Todas as disciplinas selecionadas já estão no cronograma!', 'info');
    }

    if (modal) {
        modal.close();
        modal.remove();
    }
}

function adicionarMateriaCronograma() {
    const input = document.getElementById('novaMateria');
    const materia = input.value.trim();

    if (!materia) {
        showToast('Digite o nome da matéria!', 'error');
        return;
    }

    if (MATERIAS_CRONOGRAMA.includes(materia)) {
        showToast('Matéria já adicionada!', 'error');
        return;
    }

    MATERIAS_CRONOGRAMA.push(materia);
    localStorage.setItem('BD_MATERIAS', JSON.stringify(MATERIAS_CRONOGRAMA));
    renderizarMateriasCronograma();

    input.value = '';
    showToast(`Matéria "${materia}" adicionada!`, 'success');
}

function removerMateria(index) {
    MATERIAS_CRONOGRAMA.splice(index, 1);
    localStorage.setItem('BD_MATERIAS', JSON.stringify(MATERIAS_CRONOGRAMA));
    renderizarMateriasCronograma();
}

function gerarCronograma() {
    const dataProva = document.getElementById('dataProva').value;
    const diasSemana = parseInt(document.getElementById('diasSemana').value);
    const horasDia = parseInt(document.getElementById('horasDia').value);

    if (!dataProva) {
        showToast('Selecione a data da prova!', 'error');
        return;
    }

    if (MATERIAS_CRONOGRAMA.length === 0) {
        showToast('Adicione pelo menos uma matéria!', 'error');
        return;
    }

    // Calcula dias até a prova
    const hoje = new Date();
    const provaDate = new Date(dataProva);
    const diffTime = provaDate - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        showToast('Data da prova deve ser futura!', 'error');
        return;
    }

    // Calcula totais
    const totalDiasEstudo = Math.floor((diffDays - 7) * (diasSemana / 7));
    const totalHoras = totalDiasEstudo * horasDia;
    const horasPorMateria = Math.floor(totalHoras / MATERIAS_CRONOGRAMA.length);

    // Gera estrutura do cronograma
    const cronograma = {
        dataGeracao: new Date().toISOString(),
        dataProva: dataProva,
        diasSemana: diasSemana,
        horasDia: horasDia,
        totalDias: diffDays,
        totalDiasEstudo: totalDiasEstudo,
        totalHoras: totalHoras,
        semanas: [],
        materias: MATERIAS_CRONOGRAMA.map(materia => ({
            nome: materia,
            horasAlocadas: horasPorMateria,
            horasEstudadas: 0,
            concluida: false
        }))
    };

    // Distribui as matérias pelas semanas
    distribuirMateriasPorSemana(cronograma);

    // Salva e exibe
    CRONOGRAMA_DATA = cronograma;
    localStorage.setItem('BD_CRONOGRAMA', JSON.stringify(cronograma));
    exibirCronograma(cronograma);
    showToast('Cronograma gerado e salvo com sucesso! 🎯', 'success');
}

function distribuirMateriasPorSemana(cronograma) {
    const {
        totalDiasEstudo,
        diasSemana,
        materias
    } = cronograma;
    const totalSemanas = Math.ceil(totalDiasEstudo / diasSemana);

    cronograma.semanas = [];

    for (let semana = 1; semana <= totalSemanas; semana++) {
        const semanaData = {
            numero: semana,
            dias: []
        };

        // Distribui matérias igualmente (round-robin)
        for (let dia = 1; dia <= diasSemana; dia++) {
            const materiaIndex = (dia + semana) % materias.length;
            const materia = materias[materiaIndex];

            semanaData.dias.push({
                dia: dia,
                materia: materia.nome,
                concluido: false,
                horasEstudadas: 0
            });
        }

        cronograma.semanas.push(semanaData);
    }

    // Última semana é revisão geral
    if (totalSemanas > 1) {
        const revisaoSemana = {
            numero: totalSemanas,
            dias: [],
            isRevisao: true
        };

        for (let dia = 1; dia <= diasSemana; dia++) {
            revisaoSemana.dias.push({
                dia: dia,
                materia: "REVISÃO GERAL",
                concluido: false,
                horasEstudadas: 0,
                isRevisao: true
            });
        }

        cronograma.semanas[cronograma.semanas.length - 1] = revisaoSemana;
    }
}

function exibirCronograma(cronograma) {
    const setup = document.getElementById('cronogramaSetup');
    const view = document.getElementById('cronogramaView');

    if (!setup || !view) return;

    setup.style.display = 'none';
    view.style.display = 'block';

    const resumo = document.getElementById('resumoCronograma');
    const tabs = document.getElementById('tabsSemanas');
    const conteudo = document.getElementById('conteudoCronograma');

    // Atualiza resumo
    if (resumo && cronograma.dataProva) {
        const progresso = calcularProgressoCronograma(cronograma);
        resumo.innerHTML = `
            <strong>🎯 Meta:</strong> ${cronograma.dataProva} 
            | <strong>📅 Dias:</strong> ${cronograma.totalDiasEstudo} dias de estudo 
            | <strong>⏱️ Total:</strong> ${cronograma.totalHoras}h
            | <strong>📊 Progresso:</strong> ${progresso}%
        `;
    }

    // Gera tabs das semanas
    if (tabs && cronograma.semanas) {
        tabs.innerHTML = cronograma.semanas.map(semana => `
            <button class="btn secondary tab-semana ${semana.numero === 1 ? 'active' : ''}" 
                    onclick="mostrarSemana(${semana.numero})">
                Semana ${semana.numero}
            </button>
        `).join('');
    }

    // Gera conteúdo das semanas
    if (conteudo && cronograma.semanas) {
        conteudo.innerHTML = cronograma.semanas.map(semana => `
            <div id="semana-${semana.numero}" class="semana-conteudo" style="display: ${semana.numero === 1 ? 'block' : 'none'};">
                <h5 style="margin: 15px 0 10px 0; color: var(--accent);">
                    ${semana.isRevisao ? '🔄 REVISÃO GERAL' : '📚 Estudos'} - Semana ${semana.numero}
                </h5>
                <div class="dias-semana">
                    ${semana.dias.map(dia => `
                        <div class="dia-cronograma ${dia.concluido ? 'concluido' : ''}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span><strong>Dia ${dia.dia}:</strong> ${escapeHtml(dia.materia)}</span>
                                <button onclick="marcarDiaConcluido(${semana.numero}, ${dia.dia})" 
                                        class="btn secondary" 
                                        style="padding: 5px 10px; font-size: 0.8rem; min-width: 80px;">
                                    ${dia.concluido ? '✅ Concluído' : '⏳ Em andamento'}
                                </button>
                            </div>
                            <div class="meta" style="display: flex; align-items: center; gap: 10px;">
                                <span>Horas estudadas:</span>
                                <input type="number" 
                                       min="0" 
                                       max="12" 
                                       step="0.5"
                                       value="${dia.horasEstudadas}" 
                                       onchange="atualizarHorasDia(${semana.numero}, ${dia.dia}, this.value)"
                                       onfocus="event.stopPropagation()"
                                       onclick="event.stopPropagation()"
                                       style="width: 70px; padding: 5px; border-radius: 4px; border: 1px solid var(--border);">
                                <span>h</span>
                                <small style="color: var(--text-muted); margin-left: auto;">
                                    ${dia.horasEstudadas > 0 ? `${dia.horasEstudadas}h registradas` : 'Sem horas registradas'}
                                </small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
}

function calcularProgressoCronograma(cronograma) {
    if (!cronograma.semanas.length) return 0;

    let totalDias = 0;
    let diasConcluidos = 0;

    cronograma.semanas.forEach(semana => {
        semana.dias.forEach(dia => {
            totalDias++;
            if (dia.concluido) diasConcluidos++;
        });
    });

    return Math.round((diasConcluidos / totalDias) * 100);
}

function mostrarSemana(numeroSemana) {
    // Esconde todas as semanas
    document.querySelectorAll('.semana-conteudo').forEach(semana => {
        semana.style.display = 'none';
    });

    // Remove active de todas as tabs
    document.querySelectorAll('.tab-semana').forEach(tab => {
        tab.classList.remove('active');
    });

    // Mostra semana selecionada
    const semanaEl = document.getElementById(`semana-${numeroSemana}`);
    if (semanaEl) {
        semanaEl.style.display = 'block';
    }

    // Ativa tab selecionada
    const tabEl = document.querySelector(`.tab-semana:nth-child(${numeroSemana})`);
    if (tabEl) {
        tabEl.classList.add('active');
    }
}

function marcarDiaConcluido(numeroSemana, numeroDia) {
    if (!CRONOGRAMA_DATA) return;

    const semana = CRONOGRAMA_DATA.semanas.find(s => s.numero === numeroSemana);
    if (!semana) return;

    const dia = semana.dias.find(d => d.dia === numeroDia);
    if (!dia) return;

    dia.concluido = !dia.concluido;
    localStorage.setItem('BD_CRONOGRAMA', JSON.stringify(CRONOGRAMA_DATA));

    // Atualiza a exibição
    exibirCronograma(CRONOGRAMA_DATA);
    showToast(dia.concluido ? 'Dia marcado como concluído! ✅' : 'Dia reaberto para estudo', 'success');
}

function atualizarHorasDia(numeroSemana, numeroDia, horas) {
    if (!CRONOGRAMA_DATA) return;

    const semana = CRONOGRAMA_DATA.semanas.find(s => s.numero === numeroSemana);
    if (!semana) return;

    const dia = semana.dias.find(d => d.dia === numeroDia);
    if (!dia) return;

    dia.horasEstudadas = parseInt(horas) || 0;
    localStorage.setItem('BD_CRONOGRAMA', JSON.stringify(CRONOGRAMA_DATA));
}

/* ---------------------------
   Inicialização Principal
----------------------------*/
function init() {
	console.log('🔍 Iniciando MindForge...');
	console.log('📍 Path:', window.location.pathname);
	console.log('🔍 Verificando ambiente PWA...');
	console.log('URL atual:', window.location.href);
	console.log('Display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser');
    
	// Verifica PWA primeiro
	checkPWAStatus();
	loadTheme(); // 1. Tema
    initConnectivity(); // 2. Conectividade (NOVO)
    
    // 4. Sistema existente
    initDailyGoal();
    populateSavedFilters();
    migrateOldQuestions();
    updateFilterOptions();

    // Inicializa menu mobile
    initMobileMenu();

    // Inicializa dashboard
    initDashboard();

    // Inicializa cronograma
    setTimeout(() => {
        initCronograma();
    }, 100);

    // ADICIONAR: Inicializa filtros de flashcards se for o módulo atual
    const lastModule = localStorage.getItem('LAST_MODULE') || 'dashboard';
    if (lastModule === 'flashcards') {
        setTimeout(() => {
            updateFCFilters();
        }, 200);
    }

    // Carrega o último módulo visitado ou o dashboard
    switchModule(lastModule);

    // Event Listeners para navegação
    document.querySelectorAll('.nav-item[data-module]').forEach(item => {
        item.addEventListener('click', function() {
            switchModule(this.dataset.module);
        });
    });

    // Event Listener para tema na sidebar
    const themeToggleSidebar = document.getElementById('themeToggleSidebar');
    if (themeToggleSidebar) {
        themeToggleSidebar.addEventListener('click', toggleTheme);
    }

    // Configura event listeners existentes
    setupNavigation();
	setupEventListeners();

    // Ajusta visibilidade do toggle mobile baseado no tamanho da tela
    function checkMobileMenu() {
        const mobileToggle = document.getElementById('mobileMenuToggle');
        if (mobileToggle) {
            mobileToggle.style.display = window.innerWidth <= 1024 ? 'block' : 'none';
        }
    }

    window.addEventListener('resize', checkMobileMenu);
    checkMobileMenu();

    console.log('🧠 MindForge inicializado com suporte offline');
}

function setupNavigation() {
  // Event Listeners para navegação
  document.querySelectorAll('.nav-item[data-module]').forEach(item => {
    item.addEventListener('click', function() {
      switchModule(this.dataset.module);
    });
  });

  // Tema na sidebar
  const themeToggleSidebar = document.getElementById('themeToggleSidebar');
  if (themeToggleSidebar) {
    themeToggleSidebar.addEventListener('click', toggleTheme);
  }
}

function setupEventListeners() {
    // Questões
    const btnNovoQuestao = document.getElementById('btnNovoQuestao');
    const btnQuizQuestao = document.getElementById('btnQuizQuestao');
    const btnExportQuestao = document.getElementById('btnExportQuestao');
    const btnImportQuestao = document.getElementById('btnImportQuestao');

    if (btnNovoQuestao) btnNovoQuestao.addEventListener('click', abrirFormulario);
    if (btnQuizQuestao) btnQuizQuestao.addEventListener('click', initQuiz);
    if (btnExportQuestao) btnExportQuestao.addEventListener('click', exportDB);
    if (btnImportQuestao) btnImportQuestao.addEventListener('click', importDB);

    // Flashcards
    const btnNovoFC = document.getElementById('btnNovoFC');
    const btnQuizFC = document.getElementById('btnQuizFC');

    if (btnNovoFC) btnNovoFC.addEventListener('click', openFCForm);
    if (btnQuizFC) btnQuizFC.addEventListener('click', startFlashcardStudy);

    // Formulários
    const form = document.getElementById('form');
    const formFC = document.getElementById('formFC');
    const btnSalvar = document.getElementById('btnSalvar');
    const btnCancelar = document.getElementById('btnCancelar');
    const btnCancelarFC = document.getElementById('btnCancelarFC');

    if (form) form.addEventListener('submit', saveQuestion);
    if (formFC) formFC.addEventListener('submit', saveFC);
    if (btnSalvar) btnSalvar.addEventListener('click', saveQuestion);
    if (btnCancelar) btnCancelar.addEventListener('click', fecharFormulario);
    if (btnCancelarFC) btnCancelarFC.addEventListener('click', () => {
        const formCardFC = document.getElementById('formCardFC');
        if (formCardFC) formCardFC.style.display = 'none';
    });

    // Filtros
    const fSearch = document.getElementById('fSearch');
    const fDificuldade = document.getElementById('fDificuldade');
    const fQtdTreino = document.getElementById('fQtdTreino');
    const fcSearch = document.getElementById('fcSearch');
    const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');

    if (fSearch) fSearch.addEventListener('input', () => {
        currentPage = 1;
        renderQuestions();
    });
    if (fDificuldade) fDificuldade.addEventListener('change', onFilterChange);
    if (fQtdTreino) fQtdTreino.addEventListener('change', onFilterChange);
    if (fcSearch) fcSearch.addEventListener('input', renderFlashcardsList);
    if (fcDisciplinaFilter) {
        fcDisciplinaFilter.addEventListener('change', () => {
            console.log("Disciplina filter changed:", fcDisciplinaFilter.value);
            updateFCAssuntoOptions();
            renderFlashcardsList();
        });
    }

    if (fcAssuntoFilter) {
        fcAssuntoFilter.addEventListener('change', () => {
            console.log("Assunto filter changed:", fcAssuntoFilter.value);
            renderFlashcardsList();
        });
    }

    // Paginação
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');

    if (btnPrevPage) btnPrevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderQuestions();
            const lista = document.getElementById('lista');
            if (lista) lista.scrollTop = 0;
        }
    });

    if (btnNextPage) btnNextPage.addEventListener('click', () => {
        currentPage++;
        renderQuestions();
        const lista = document.getElementById('lista');
        if (lista) lista.scrollTop = 0;
    });

    // Cadernos
    const btnSaveFilter = document.getElementById('btnSaveFilter');
    const savedFiltersSelect = document.getElementById('savedFilters');
    const btnDeleteFilter = document.getElementById('btnDeleteFilter');

    if (btnSaveFilter) btnSaveFilter.addEventListener('click', saveCurrentFilter);
    if (savedFiltersSelect) savedFiltersSelect.addEventListener('change', loadSavedFilter);
    if (btnDeleteFilter) btnDeleteFilter.addEventListener('click', deleteFilter);

    // Flashcard player
    const fcCardElement = document.getElementById('fcCardElement');
    const btnFcFlip = document.getElementById('btnFcFlip');
    const btnFcNext = document.getElementById('btnFcNext');
    const btnFcPrev = document.getElementById('btnFcPrev');
    const btnFcExit = document.getElementById('btnFcExit');

    if (fcCardElement) fcCardElement.addEventListener('click', flipCard);
    if (btnFcFlip) btnFcFlip.addEventListener('click', flipCard);
    if (btnFcNext) btnFcNext.addEventListener('click', (e) => {
        e.stopPropagation();
        nextCard();
    });
    if (btnFcPrev) btnFcPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        prevCard();
    });
    if (btnFcExit) btnFcExit.addEventListener('click', exitFlashcardStudy);

    // Filtros cascata para questões
    questionFiltersConfig.forEach(cfg => {
        if (cfg.el) {
            cfg.el.onchange = () => {
                updateFilterOptions();
                currentPage = 1;
                renderQuestions();
            };
        }
    });

    // Checkbox de revisão
    const fRevisao = document.getElementById('fRevisao');
    if (fRevisao) {
        fRevisao.addEventListener('change', () => {
            updateFilterOptions();
            currentPage = 1;
            renderQuestions();
        });
    }

    // Filtros flashcards
    // const fcDisciplinaFilter = document.getElementById('fcDisciplinaFilter');
    //  const fcAssuntoFilter = document.getElementById('fcAssuntoFilter');

    if (fcDisciplinaFilter) fcDisciplinaFilter.addEventListener('change', () => {
        updateFCAssuntoOptions();
        renderFlashcardsList();
    });

    if (fcAssuntoFilter) fcAssuntoFilter.addEventListener('change', renderFlashcardsList);

    // Imagem
    const inpImagem = document.getElementById('inpImagem');
    const btnRemoverImg = document.getElementById('btnRemoverImg');
    const btnInsertImgTag = document.getElementById('btnInsertImgTag');
    const txtEnunciado = document.getElementById('enunciado');

    if (inpImagem) {
        inpImagem.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width,
                        height = img.height;
                    const MAX = 800;
                    if (width > height && width > MAX) {
                        height *= MAX / width;
                        width = MAX;
                    } else if (height > MAX) {
                        width *= MAX / height;
                        height = MAX;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    const imgPreview = document.getElementById('imgPreview');
                    if (imgPreview) imgPreview.src = canvas.toDataURL('image/jpeg', 0.7);
                    if (imgPreview) imgPreview.style.display = 'block';
                    const btnRemoverImg = document.getElementById('btnRemoverImg');
                    if (btnRemoverImg) btnRemoverImg.style.display = 'inline-block';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (btnRemoverImg) btnRemoverImg.addEventListener('click', () => {
        const inpImagem = document.getElementById('inpImagem');
        const imgPreview = document.getElementById('imgPreview');
        const btnRemoverImg = document.getElementById('btnRemoverImg');
        if (inpImagem) inpImagem.value = '';
        if (imgPreview) imgPreview.style.display = 'none';
        if (btnRemoverImg) btnRemoverImg.style.display = 'none';
    });

    if (btnInsertImgTag && txtEnunciado) {
        btnInsertImgTag.addEventListener('click', () => {
            txtEnunciado.value += " [IMAGEM] ";
        });
    }

    // File input para import
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const json = JSON.parse(event.target.result);

                    if (Array.isArray(json)) {
                        BD = json;
                        saveBD();
                        showToast('Questões Importadas (Formato Antigo)!', 'success');
                    } else if (json.questoes && json.flashcards) {
                        BD = json.questoes || [];
                        BD_FC = json.flashcards || [];
                        saveBD();
                        saveBD_FC();
                        showToast('Backup Completo Restaurado!', 'success');
                    } else {
                        alert("Formato desconhecido.");
                        return;
                    }

                    updateFilterOptions();
                    updateFCFilters();
                    renderQuestions();
                    renderFlashcardsList();
                } catch (e) {
                    alert("Erro ao importar JSON.");
                }
            };
            reader.readAsText(file);
        });
    }
}

// Verificar se o PWA está instalado e funcionando
function checkPWAStatus() {
    if (!navigator.onLine) {
        console.log('Modo offline ativo');
        showToast('Modo offline ativo - usando dados locais', 'info');
    }

    // Verificar service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            console.log('Service Worker pronto:', registration);
        });
    }
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.className = theme + '-mode';
}

function toggleTheme() {
    const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    document.body.className = newTheme + '-mode';
    localStorage.setItem('theme', newTheme);
}

function migrateOldQuestions() {
    let count = 0;
    BD.forEach(q => {
        if (!q.dificuldade || q.dificuldade === "") {
            q.dificuldade = 'Média';
            count++;
        }
        if (!q.stats) q.stats = {
            correct: 0,
            wrong: 0
        };
    });
    if (count > 0) saveBD();
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
window.editFC = window.editFC;
window.delFC = window.delFC;
window.exportDB = exportDB;
window.importDB = importDB;
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
window.processarDisciplinasImportadas = processarDisciplinasImportadas;
window.abrirFormularioQuestaoRapido = abrirFormularioQuestaoRapido;
window.abrirFormularioFlashcardRapido = abrirFormularioFlashcardRapido;
window.iniciarTreinoRapido = iniciarTreinoRapido;
window.verCronogramaRapido = verCronogramaRapido;