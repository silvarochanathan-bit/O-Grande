/**
 * GLOBAL.JS
 * Gerenciamento de estado e persistência.
 * VERSÃO: CORREÇÃO DE BUG (ANTI-WIPE) + CARTEIRA ROBUSTA
 */

const STORAGE_KEY = 'SITE_C_MASTER_DATA';

const DEFAULT_STATE = {
    xp: { current: 0, total: 0, level: 1, history: [] },
    // Nova estrutura de carteira (Wallet)
    wallet: {
        daily: { current: 0, gainedToday: 0, max: 9 },
        weekend: { current: 0, max: 30 },
        crystals: { current: 0 },
        consumption: {
            movies:    { label: 'Filme',     used: 0, limit: 1 },
            series:    { label: 'Série',     used: 0, limit: 3 },
            youtube:   { label: 'YouTube',   used: 0, limit: 2 },
            instagram: { label: 'Instagram', used: 0, limit: 1 },
            books:     { label: 'Leitura',   used: 0, limit: 99 },
            general:   { label: 'Outros',    used: 0, limit: 5 }
        }
    },
    habits: [], 
    habitGroups: [],
    tasks: [],
    chests: [],
    linkedLevelUpChestId: null,
    rewards: [],
    executedTasks: [],
    settings: {
        backupUrl: "",
        sounds: {
            click: { url: null, volume: 50 },
            xp: { url: null, volume: 50 },
            levelup: { url: null, volume: 50 },
            chest: { url: null, volume: 50 }
        }
    },
    lastLogin: null
};

// --- SISTEMA DE MODAIS (Mantido igual) ---
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
    isSafeToSave: false, // Trava de segurança

    loadData: function() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // Merge cuidadoso
                this.data = this.mergeDeep(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
                console.log("Site C: Dados carregados.");
            } else {
                this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
                console.log("Site C: Novo save criado.");
            }
            
            // Garante estrutura ANTES de liberar o save
            this.ensureIntegrity();
            this.isSafeToSave = true; // Só libera salvar se passou por aqui sem erro

            this.processDailyRollover();
            
        } catch (e) {
            console.error("Site C: ERRO CRÍTICO NO LOAD.", e);
            alert("⚠️ ERRO AO CARREGAR DADOS!\nO sistema entrou em modo de segurança para não sobrescrever seu progresso.\nVerifique o console ou tente recarregar.");
            // Carrega estado padrão na memória para UI não quebrar, mas NÃO libera isSafeToSave
            this.data = JSON.parse(JSON.stringify(DEFAULT_STATE));
            this.ensureIntegrity();
        }
    },

    ensureIntegrity: function() {
        if (!this.data) return;
        ['habits', 'habitGroups', 'tasks', 'chests', 'rewards', 'executedTasks'].forEach(arr => {
            if (!Array.isArray(this.data[arr])) this.data[arr] = [];
        });

        // REPARO DA CARTEIRA: Se faltar qualquer pedaço, recria
        if (!this.data.wallet) this.data.wallet = {};
        
        // Garante sub-objetos da carteira mesclando com o padrão
        this.data.wallet = this.mergeDeep(
            JSON.parse(JSON.stringify(DEFAULT_STATE.wallet)), 
            this.data.wallet
        );

        if (!this.data.settings) this.data.settings = {};
    },

    saveData: function() {
        if (!this.isSafeToSave) {
            console.warn("Site C: Salvamento bloqueado por segurança (Erro no Load).");
            return;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.error("Site C: Erro ao salvar.", e);
            if (e.name === 'QuotaExceededError') {
                alert("⚠️ MEMÓRIA CHEIA! Não foi possível salvar. Remova sons pesados.");
            }
        }
    },

    processDailyRollover: function() {
        if (!this.isSafeToSave) return; // Não processa economia se dados estiverem corrompidos

        const now = new Date();
        const todayStr = this.formatDate(now);
        
        if (!this.data.lastLogin) {
            this.data.lastLogin = todayStr;
            this.saveData();
            return;
        }

        if (this.data.lastLogin !== todayStr) {
            console.log(`Rollover: ${this.data.lastLogin} -> ${todayStr}`);
            
            // Reset Diário
            this.data.wallet.daily.gainedToday = 0;
            for (const key in this.data.wallet.consumption) {
                if(this.data.wallet.consumption[key]) this.data.wallet.consumption[key].used = 0;
            }

            const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg

            // Lógica Segunda-Feira
            if (dayOfWeek === 1) { 
                const needed = 2;
                const available = this.data.wallet.weekend.current;
                
                if (available >= needed) {
                    this.data.wallet.weekend.current -= needed;
                    this.data.wallet.daily.current = needed;
                } else {
                    this.data.wallet.daily.current = available;
                    this.data.wallet.weekend.current = 0;
                }
            } else {
                // Outros dias: Mantém 2 no diário, resto pro FDS
                const current = this.data.wallet.daily.current;
                if (current > 2) {
                    const overflow = current - 2;
                    this.data.wallet.daily.current = 2;
                    this.data.wallet.weekend.current += overflow;
                }
            }

            // Cristais
            const wMax = 30;
            if (this.data.wallet.weekend.current > wMax) {
                const excess = this.data.wallet.weekend.current - wMax;
                const crystals = Math.floor(excess / 3);
                // Ajuste: O que não virou cristal fica somado no teto? 
                // Assumindo: Teto fixo 30 + resto
                const remainder = excess % 3;
                
                if (crystals > 0) {
                    this.data.wallet.crystals.current += crystals;
                    this.data.wallet.weekend.current = wMax + remainder;
                    alert(`💎 Rollover: Você ganhou ${crystals} Cristais pelo excedente do fim de semana!`);
                }
            }

            this.data.lastLogin = todayStr;
            this.saveData();
            
            if (window.HabitModel && window.HabitModel.dailyResetCheck) {
                window.HabitModel.dailyResetCheck();
            }
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
    
    // --- IMPORT/EXPORT (Simplificado) ---
    exportData: function() {
        const json = JSON.stringify(this.data, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Backup_SiteC_${this.formatDate(new Date())}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
                    this.ensureIntegrity(); // Garante carteira no import também
                    this.isSafeToSave = true;
                    this.saveData();
                    window.location.reload();
                }
            } catch(err) { alert("Arquivo inválido."); }
        };
        reader.readAsText(file);
    },
    configureBackupUrl: async function() {
        const url = await prompt("Link de Backup:", this.data.settings?.backupUrl || "");
        if(url !== null) { this.data.settings.backupUrl = url; this.saveData(); }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.GlobalApp.loadData();
    // Navegação
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.tab-content');
    navBtns.forEach(btn => btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target'))?.classList.add('active');
    }));
    document.getElementById('file-import-input')?.addEventListener('change', (e) => window.GlobalApp.handleFileImport(e));
    document.dispatchEvent(new Event('SiteC_DataReady'));
});