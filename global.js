/**
 * GLOBAL.JS
 * Gerenciamento de estado, persistência e Roteamento do Super App.
 * VERSÃO: V8.1 - LEAN EDITION (SEM XP / SEM RECOMPENSAS)
 * Alterações: Removida toda a lógica de XP, Nível, Carteira (Wallet) e Baús.
 * Mantido o conceito de "Dia do Jogo" vs "Dia Real" para Hábitos, Dieta e Academia.
 * O dia só vira automaticamente após 12:00 (meio-dia). Antes disso, é necessário
 * ação manual do usuário ("Virar o Dia") para consolidar os dados.
 * V8.1: Restaurados os helpers renderSortPicker/applySortPreference, usados pelo
 * módulo Academia (rotinas e exercícios) e ausentes deste arquivo — a ausência
 * deles causava um erro fatal (TypeError) sempre que a tela de Treinos era
 * desenhada, interrompendo a renderização no meio e deixando a lista de rotinas
 * "sumida" mesmo com os dados salvos corretamente.
 */

const STORAGE_KEY = 'SITE_C_MASTER_DATA';

const DEFAULT_STATE = {
    // Controle de Navegação
    navigation: {
        currentApp: 'hub' // 'hub', 'productivity', 'gym', 'diet', 'finance'
    },

    // Módulo 1: Produtividade
    habits: [],
    habitGroups: [],
    tasks: [],
    tasksHistory: [],
    activeTimer: null, // Campo adicionado para persistência do cronômetro

    // Módulo 2: Academia
    gym: {
        routines: [], // Treinos montados (A, B, C...)
        history: [],  // Logs de treino
        userExercises: [], // Banco de exercícios do usuário
        prs: {},       // Recordes pessoais
        activeSession: null
    },

    // Módulo 3: Dieta
    diet: {
        meals: [],    // Refeições planejadas
        history: [],  // Logs de alimentação
        dayHistory: [], // Arquivo de resumos diários (sem XP)
        water: { current: 0, target: 3000 }
    },

    // Módulo 4: Controle Financeiro
    finance: {
        transactions: [],
        pendingDebts: []
    },

    // Configurações Globais
    settings: {
        backupUrl: "",
        sounds: {
            click: { url: null, volume: 50 }
        },
        // Preferência de ordenação por lista (ex: 'routines', 'exercises'),
        // usada por renderSortPicker/applySortPreference abaixo.
        sortPreferences: {}
    },

    // Metadados (Controle de reset e backup)
    meta: {
        lastActiveDate: null,
        backupUrl: "" // Link do Google Drive
    },
    lastLogin: null,
    lastGameDate: null // Controla a data "lógica" do jogo
};

// --- SISTEMA DE MODAIS ---
window.SysModal = {
    _createContainer: function() {
        const overlay = document.createElement('div');
        overlay.className = 'sys-modal-overlay';
        const content = document.createElement('div');
        content.className = 'sys-modal-content';
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        return { overlay, content };
    },
    _close: function(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    },
    alert: function(message) {
        return new Promise((resolve) => {
            const { overlay, content } = this._createContainer();
            content.innerHTML = `<div class="sys-modal-message">${message}</div><div class="sys-modal-actions"><button class="primary-btn" id="sys-btn-ok">OK</button></div>`;
            const btn = content.querySelector('#sys-btn-ok');
            if(btn) { btn.focus(); btn.onclick = () => { this._close(overlay); resolve(true); }; }
        });
    },
    confirm: function(message) {
        return new Promise((resolve) => {
            const { overlay, content } = this._createContainer();
            content.innerHTML = `<div class="sys-modal-message">${message}</div><div class="sys-modal-actions"><button class="secondary-btn" id="sys-btn-cancel">Cancelar</button><button class="primary-btn" id="sys-btn-confirm">Confirmar</button></div>`;
            content.querySelector('#sys-btn-confirm').onclick = () => { this._close(overlay); resolve(true); };
            content.querySelector('#sys-btn-cancel').onclick = () => { this._close(overlay); resolve(false); };
        });
    },
    prompt: function(message, defaultValue = '') {
        return new Promise((resolve) => {
            const { overlay, content } = this._createContainer();
            content.innerHTML = `<div class="sys-modal-message">${message}</div><input type="text" class="sys-modal-input" id="sys-input-prompt" value="${defaultValue}"><div class="sys-modal-actions"><button class="secondary-btn" id="sys-btn-cancel">Cancelar</button><button class="primary-btn" id="sys-btn-confirm">OK</button></div>`;
            const input = content.querySelector('#sys-input-prompt');
            if(input) input.focus();
            content.querySelector('#sys-btn-confirm').onclick = () => { const v = input.value; this._close(overlay); resolve(v); };
            content.querySelector('#sys-btn-cancel').onclick = () => { this._close(overlay); resolve(null); };
        });
    }
};
window.alert = window.SysModal.alert.bind(window.SysModal);
window.confirm = window.SysModal.confirm.bind(window.SysModal);
window.prompt = window.SysModal.prompt.bind(window.SysModal);

// --- APP GLOBAL ---
window.GlobalApp = {
    data: null,
    isSafeToSave: false,

    loadData: function() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.data = this.mergeDeep(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
                console.log("Site C: Dados carregados.");
            } else {
                this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
                // Primeira vez: Define data de hoje
                const todayStr = this.formatDate(new Date());
                if (!this.data.meta) this.data.meta = {};
                this.data.meta.lastActiveDate = todayStr;
                this.data.lastLogin = todayStr;
                this.data.lastGameDate = todayStr; // Inicializa lastGameDate
                console.log("Site C: Novo save criado.");
            }

            // Inicializa lastGameDate se não existir em saves antigos
            if (!this.data.lastGameDate) {
                this.data.lastGameDate = this.formatDate(new Date());
            }

            this.ensureIntegrity();
            this.isSafeToSave = true;
            this.checkForDailyReset();
            this.renderTurnDayButton(); // Injeta botão de virada manual

            // Listener de Visibilidade (Reset Automático Anti-Insônia)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    console.log("Site C: Aba ativa novamente. Verificando virada do dia...");
                    this.checkForDailyReset();
                }
            });

            this.navigate('hub');

        } catch (e) {
            console.error("Site C: ERRO CRÍTICO NO LOAD.", e);
            alert("⚠️ ERRO AO CARREGAR DADOS!\nModo de segurança ativado.");
            this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
            this.ensureIntegrity();
        }
    },

    ensureIntegrity: function() {
        if (!this.data) return;

        // Arrays básicos
        ['habits', 'habitGroups', 'tasks', 'tasksHistory'].forEach(arr => {
            if (!Array.isArray(this.data[arr])) this.data[arr] = [];
        });

        // Módulos (Garante que existam em saves antigos)
        if (!this.data.gym) this.data.gym = JSON.parse(JSON.stringify(DEFAULT_STATE.gym));
        if (!this.data.diet) this.data.diet = JSON.parse(JSON.stringify(DEFAULT_STATE.diet));
        if (!this.data.finance) this.data.finance = JSON.parse(JSON.stringify(DEFAULT_STATE.finance));
        if (!this.data.navigation) this.data.navigation = { currentApp: 'hub' };

        // Meta (Reset e Backup)
        if (!this.data.meta) this.data.meta = JSON.parse(JSON.stringify(DEFAULT_STATE.meta));

        if (!this.data.settings) this.data.settings = {};
        if (!this.data.settings.sortPreferences || typeof this.data.settings.sortPreferences !== 'object') {
            this.data.settings.sortPreferences = {};
        }

        // Limpeza de módulos removidos (XP / Wallet / Baús) em saves antigos
        delete this.data.xp;
        delete this.data.wallet;
        delete this.data.chests;
        delete this.data.rewards;
        delete this.data.executedTasks;
    },

    saveData: function() {
        if (!this.isSafeToSave) {
            console.warn("Site C: Salvamento bloqueado por segurança.");
            return;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.error("Site C: Erro ao salvar.", e);
            if (e.name === 'QuotaExceededError') {
                alert("⚠️ MEMÓRIA CHEIA! Remova sons pesados.");
            }
        }
    },

    // --- SISTEMA DE ROTEAMENTO ---
    navigate: function(targetApp) {
        // Validação
        const validApps = ['hub', 'productivity', 'gym', 'diet', 'finance'];
        if (!validApps.includes(targetApp)) targetApp = 'hub';

        // Atualiza Estado
        this.data.navigation.currentApp = targetApp;
        this.saveData();

        // Aplica Visualmente
        this.applyNavigation(targetApp);

        // Som de transição (opcional, usa o 'click')
        if (window.SoundManager && targetApp !== 'hub') {
            window.SoundManager.play('click');
        }
    },

    applyNavigation: function(appId) {
        // Dispara evento para que a UI saiba que mudou
        const event = new CustomEvent('SiteC_NavigationChanged', { detail: { app: appId } });
        document.dispatchEvent(event);

        // Lógica de classes no Body para CSS controlar visibilidade
        document.body.setAttribute('data-current-app', appId);

        // Scroll pro topo
        window.scrollTo(0,0);
    },

    // =========================================================================
    // LÓGICA DE TEMPO E RESET (GAME DAY)
    // =========================================================================

    /**
     * Retorna a data "Lógica" do jogo.
     * Se for antes de 12:00, e o usuário não virou o dia, retorna a data salva (Ontem).
     * Se for depois de 12:00, força a data real (Hoje).
     */
    getGameDate: function() {
        const now = new Date();
        const realDateStr = this.formatDate(now);
        const savedGameDate = this.data.lastGameDate || realDateStr;

        // Se a data salva já é a real, estamos sincronizados
        if (savedGameDate === realDateStr) return realDateStr;

        const hour = now.getHours();

        // Regra das 12:00 (Meio-dia)
        if (hour < 12) {
            // Ainda é "madrugada" do dia de jogo anterior
            return savedGameDate;
        } else {
            // Passou do limite, o dia vira automaticamente
            if (this.data.lastGameDate !== realDateStr) {
                console.log("[GlobalApp] Auto-Turn: Passou de 12:00, virando dia automaticamente.");
                this.data.lastGameDate = realDateStr;
                this.saveData();
            }
            return realDateStr;
        }
    },

    /**
     * Ação manual do botão "Virar o Dia"
     */
    turnDayManual: async function() {
        if (!await confirm("Encerrar o dia anterior e iniciar um novo dia agora?")) return;

        const realDateStr = this.formatDate(new Date());
        this.data.lastGameDate = realDateStr;
        this.saveData();

        // Recarrega para processar o reset limpo
        window.location.reload();
    },

    /**
     * Renderiza o botão diretamente no Body (Overlay) se estivermos no "Limbo"
     */
    renderTurnDayButton: function() {
        // Remove botão antigo se houver
        const oldBtn = document.getElementById('btn-turn-day');
        if (oldBtn) oldBtn.remove();

        const now = new Date();
        const realDateStr = this.formatDate(now);
        const savedGameDate = this.data.lastGameDate;
        const currentHour = now.getHours();

        // Só mostra se as datas diferem E for antes de meio dia (senão vira auto)
        if (savedGameDate !== realDateStr && currentHour < 12) {
            const btn = document.createElement('button');
            btn.id = 'btn-turn-day';
            btn.innerHTML = '🌙 Virar Dia';
            // CSS definido no global.css com posição fixed
            btn.onclick = () => this.turnDayManual();

            // Injeta diretamente no Body para garantir visibilidade
            document.body.appendChild(btn);
        }
    },

    /**
     * Orquestrador de Reset Diário
     * Usa getGameDate() para respeitar a regra das 12h.
     */
    checkForDailyReset: function() {
        if (!this.isSafeToSave) return;

        const gameDate = this.getGameDate();
        const lastLogin = this.data.lastLogin; // Usa lastLogin para verificar mudança efetiva

        if (lastLogin !== gameDate) {
            console.log(`[GlobalApp] Reset Diário Detectado: ${lastLogin} -> ${gameDate}`);

            // 1. Reset de Água (Dieta)
            if (this.data.diet && this.data.diet.water) {
                this.data.diet.water.current = 0;
            }

            // 2. Orquestra Resets de Módulos Externos (Se existirem)
            // HabitModel (Reset de estados diários e faixas)
            if (window.HabitModel && typeof window.HabitModel.resetDailyState === 'function') {
                console.log("[GlobalApp] Chamando reset de Hábitos...");
                window.HabitModel.resetDailyState();
                if (window.HabitManager) window.HabitManager.render();
            }

            // GymModel (Futuro uso, ex: reset de estado diário se houver)
            if (window.GymModel && typeof window.GymModel.resetDailyState === 'function') {
                window.GymModel.resetDailyState();
            }

            // 3. Atualiza Data de Controle e Salva
            this.data.lastLogin = gameDate;
            this.data.meta.lastActiveDate = gameDate;
            this.data.lastGameDate = gameDate; // Sincroniza

            this.saveData();
            console.log("[GlobalApp] Rollover concluído com sucesso.");
        }
    },

    mergeDeep: function(target, source) {
        const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);
        if (!isObject(target) || !isObject(source)) return source;

        Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];

            if (Array.isArray(sourceValue)) {
                target[key] = sourceValue;
            } else if (isObject(targetValue) && isObject(sourceValue)) {
                target[key] = this.mergeDeep(Object.assign({}, targetValue), sourceValue);
            } else {
                target[key] = sourceValue;
            }
        });
        return target;
    },

    // --- UTILS ---
    generateUUID: function() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9); },
    formatDate: function(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },

    // =========================================================================
    // PREFERÊNCIA DE ORDENAÇÃO (usada pelo módulo Academia: rotinas, exercícios)
    // =========================================================================

    /**
     * Retorna a preferência de ordenação salva para uma lista (por 'key'), ou o
     * padrão 'name' (alfabética) se nunca foi definida.
     * Valores possíveis: 'name' (A-Z) ou 'recent' (mais recente primeiro,
     * assumindo que a própria lista já vem na ordem de criação).
     */
    getSortPreference: function(key) {
        const prefs = (this.data.settings && this.data.settings.sortPreferences) || {};
        return prefs[key] || 'name';
    },

    setSortPreference: function(key, value) {
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.settings.sortPreferences) this.data.settings.sortPreferences = {};
        this.data.settings.sortPreferences[key] = value;
        this.saveData();
    },

    /**
     * Aplica a preferência de ordenação salva a uma lista, sem mutar o array
     * original. 'getLabel' extrai o texto usado na ordenação alfabética (ex:
     * o nome da rotina ou do exercício).
     */
    applySortPreference: function(list, key, getLabel) {
        const pref = this.getSortPreference(key);
        const arr = (list || []).slice();

        if (pref === 'name') {
            arr.sort((a, b) => {
                const labelA = (getLabel ? getLabel(a) : String(a)) || '';
                const labelB = (getLabel ? getLabel(b) : String(b)) || '';
                return labelA.localeCompare(labelB, 'pt-BR');
            });
        }
        // 'recent': mantém a ordem original da lista (mais recente por último
        // na fonte de dados costuma refletir a ordem de criação; aqui apenas
        // não reordenamos).

        return arr;
    },

    /**
     * Cria e retorna o elemento DOM do seletor "A-Z / Recentes" para uma lista,
     * já com o estado visual (botão ativo) refletindo a preferência salva.
     * 'onChange' é chamado após a preferência ser trocada, para o chamador
     * re-renderizar a lista com a nova ordenação.
     */
    renderSortPicker: function(key, onChange) {
        const current = this.getSortPreference(key);

        const wrapper = document.createElement('div');
        wrapper.className = 'sort-picker';
        wrapper.style.cssText = 'display:flex; gap:6px; margin-bottom:12px;';

        const options = [
            { value: 'name', label: 'A-Z' },
            { value: 'recent', label: 'Recentes' }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.label;
            btn.className = 'secondary-btn sort-picker-btn' + (current === opt.value ? ' active' : '');
            if (current === opt.value) {
                btn.style.cssText = 'border-color: var(--accent-color); color: var(--text-primary);';
            }
            btn.onclick = () => {
                this.setSortPreference(key, opt.value);
                if (typeof onChange === 'function') onChange();
            };
            wrapper.appendChild(btn);
        });

        return wrapper;
    },

    // EXPORTAÇÃO INTELIGENTE
    exportData: function() {
        const json = JSON.stringify(this.data, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Backup_SiteC_${this.formatDate(new Date())}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);

        // Abre link de backup se existir
        if (this.data.meta && this.data.meta.backupUrl && this.data.meta.backupUrl.trim() !== "") {
            setTimeout(() => {
                window.open(this.data.meta.backupUrl, '_blank');
            }, 500);
        }
    },

    triggerImport: function() { document.getElementById('file-import-input')?.click(); },
    handleFileImport: function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                if(await confirm("Sobrescrever dados?")) {
                    this.data = this.mergeDeep(JSON.parse(JSON.stringify(DEFAULT_STATE)), json);
                    this.ensureIntegrity();
                    this.isSafeToSave = true;
                    this.saveData();
                    window.location.reload();
                }
            } catch(err) { alert("Arquivo inválido."); }
        };
        reader.readAsText(file);
    },

    // CONFIGURAÇÃO DE BACKUP
    configureBackupUrl: async function() {
        // Usa o valor em meta.backupUrl ou settings.backupUrl como fallback
        const current = (this.data.meta && this.data.meta.backupUrl) ? this.data.meta.backupUrl : (this.data.settings?.backupUrl || "");
        const url = await prompt("Link de Backup (Google Drive, etc):", current);
        if(url !== null) {
            if (!this.data.meta) this.data.meta = {};
            this.data.meta.backupUrl = url;
            // Mantém sync com settings legado por precaução
            if (this.data.settings) this.data.settings.backupUrl = url;
            this.saveData();
        }
    },

    hardReset: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        const confirmed = await confirm("⚠️ ATENÇÃO: Isso apagará TODOS os dados permanentemente. Não pode ser desfeito.\n\nDeseja continuar?");
        if (confirmed) {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.GlobalApp.loadData();

    // Listeners de Navegação interna (abas dentro de cada app)
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => btn.addEventListener('click', () => {
        // Só permite troca de aba se estiver dentro de um App, não no Hub
        if (window.GlobalApp.data.navigation.currentApp === 'hub') return;

        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target'))?.classList.add('active');
    }));

    document.getElementById('file-import-input')?.addEventListener('change', (e) => window.GlobalApp.handleFileImport(e));

    document.dispatchEvent(new Event('SiteC_DataReady'));
});
