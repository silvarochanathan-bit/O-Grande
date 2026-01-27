/**
 * CHESTS.JS
 * Gerenciamento de Economia de Slots (Tokenomics), Overlay Global e Categorias Dinâmicas.
 * VERSÃO: V15 - NO CHESTS, ONLY WALLET & DYNAMIC CATEGORIES
 */

window.ChestManager = {
    
    // Estado Interno
    rewardsContainer: null,
    overlay: null,

    init: function() {
        this.rewardsContainer = document.getElementById('rewards-list');

        // Cria o overlay global assim que inicia
        this.createGlobalOverlay();

        document.addEventListener('SiteC_DataReady', () => {
            this.ensureConsumptionData();
            this.renderWalletDashboard(); 
            this.renderRewardsHistory();
        });
    },

    // =========================================================================
    // OVERLAY GLOBAL DINÂMICO (FEEDBACK VISUAL)
    // =========================================================================
    createGlobalOverlay: function() {
        if (document.getElementById('overlay-loot-feedback')) return;

        const div = document.createElement('div');
        div.id = 'overlay-loot-feedback';
        div.innerHTML = `
            <div class="phantom-vault vault-card daily">
                <div class="vault-header">
                    <span id="phantom-title">☀️ Cofre Diário</span>
                    <span class="vault-value" id="phantom-value">0 <small>slots</small></span>
                </div>
                <div class="vault-bar-bg" id="phantom-bar-container">
                    <div class="vault-bar-fill" id="phantom-bar" style="width:0%"></div>
                </div>
                <div class="vault-sub" id="phantom-sub">
                    Ganho Hoje: <span id="phantom-gained">0</span> / 9
                </div>
                <div class="overlay-gain-text" id="phantom-gain-text">+1 SLOT</div>
            </div>
        `;
        document.body.appendChild(div);
        this.overlay = div;
    },

    updatePhantomVault: function(type) {
        const w = window.GlobalApp.data.wallet;
        const vaultEl = this.overlay.querySelector('.phantom-vault');
        
        const elTitle = document.getElementById('phantom-title');
        const elValue = document.getElementById('phantom-value');
        const elBarContainer = document.getElementById('phantom-bar-container');
        const elBar = document.getElementById('phantom-bar');
        const elSub = document.getElementById('phantom-sub');

        // Reset de classes
        vaultEl.classList.remove('daily', 'weekend', 'crystal');

        if (type === 'daily') {
            vaultEl.classList.add('daily');
            elTitle.textContent = "☀️ Cofre Diário";
            const pct = Math.min(100, (w.daily.current / w.daily.max) * 100);
            elValue.innerHTML = `${w.daily.current} <small>slots</small>`;
            elBarContainer.style.visibility = 'visible';
            elBar.style.width = `${pct}%`;
            elSub.innerHTML = `Ganho Hoje: <span>${w.daily.gainedToday}</span> / ${w.daily.max}`;
        
        } else if (type === 'weekend') {
            vaultEl.classList.add('weekend');
            elTitle.textContent = "📅 Fim de Semana";
            const pct = Math.min(100, (w.weekend.current / w.weekend.max) * 100);
            elValue.innerHTML = `${w.weekend.current} <small>/ ${w.weekend.max}</small>`;
            elBarContainer.style.visibility = 'visible';
            elBar.style.width = `${pct}%`;
            elSub.innerHTML = "Reserva para Sábado e Domingo";

        } else if (type === 'crystal') {
            vaultEl.classList.add('crystal');
            elTitle.textContent = "💎 Cristais";
            elValue.innerHTML = `${w.crystals.current}`;
            elBarContainer.style.visibility = 'hidden';
            elSub.innerHTML = "Moeda Premium (Excedente Convertido)";
        }
    },

    triggerLootOverlay: function(detailText, type) {
        const overlay = document.getElementById('overlay-loot-feedback');
        if (!overlay) return;

        this.updatePhantomVault(type);
        
        const gainText = document.getElementById('phantom-gain-text');
        if (gainText) gainText.textContent = detailText;
        gainText.style.opacity = '0';

        overlay.classList.add('active');
        overlay.style.display = 'flex';

        const coin = document.createElement('div');
        coin.className = 'anim-coin-overlay';
        coin.textContent = type === 'crystal' ? '💎' : '🪙';
        overlay.appendChild(coin);

        void coin.offsetWidth;

        requestAnimationFrame(() => {
            coin.classList.add('flying');
        });

        setTimeout(() => {
            const vault = overlay.querySelector('.phantom-vault');
            if (vault) {
                vault.classList.remove('pulse-gain');
                void vault.offsetWidth;
                vault.classList.add('pulse-gain');
            }
            
            if (coin.parentNode) coin.parentNode.removeChild(coin);
            if (window.SoundManager) window.SoundManager.play('xp');
            if (gainText) gainText.style.opacity = '1';

            setTimeout(() => {
                overlay.classList.remove('active');
                setTimeout(() => { overlay.style.display = 'none'; }, 300);
            }, 1200);

        }, 600);
    },

    // =========================================================================
    // LÓGICA DE TRANSAÇÃO (TOKENOMICS)
    // =========================================================================

    addSlotToWallet: function(originName) {
        const w = window.GlobalApp.data.wallet;
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Dom, 6=Sab
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        let resultDetail = "";
        let targetType = ""; 

        if (isWeekend) {
            // FDS: Direto pro cofre de FDS
            w.weekend.current++;
            
            if (w.weekend.current > w.weekend.max) {
                const excess = w.weekend.current - w.weekend.max;
                if (excess >= 3) {
                    const newCrystals = Math.floor(excess / 3);
                    w.weekend.current -= (newCrystals * 3);
                    w.crystals.current += newCrystals;
                    
                    resultDetail = `💎 +${newCrystals} CRISTAL!`;
                    targetType = 'crystal';
                } else {
                    resultDetail = "+1 Slot (FDS - Excedente)";
                    targetType = 'weekend';
                }
            } else {
                resultDetail = "+1 Slot (FDS)";
                targetType = 'weekend';
            }

        } else {
            // Dias Úteis: Diário -> FDS -> Cristais
            if (w.daily.gainedToday < w.daily.max) {
                w.daily.current++;
                w.daily.gainedToday++;
                resultDetail = "+1 Slot (Diário)";
                targetType = 'daily';
            } else {
                w.weekend.current++;
                
                if (w.weekend.current > w.weekend.max) {
                    const excess = w.weekend.current - w.weekend.max;
                    if (excess >= 3) {
                        const newCrystals = Math.floor(excess / 3);
                        w.weekend.current -= (newCrystals * 3);
                        w.crystals.current += newCrystals;

                        resultDetail = `💎 +${newCrystals} CRISTAL!`;
                        targetType = 'crystal';
                    } else {
                        resultDetail = "+1 Slot (FDS - Transbordo)";
                        targetType = 'weekend';
                    }
                } else {
                    resultDetail = "+1 Slot (FDS - Transbordo)";
                    targetType = 'weekend';
                }
            }
        }

        this.addRewardToHistory("Ganho", `${resultDetail} - ${originName}`, 'gain');
        window.GlobalApp.saveData();
        this.renderWalletDashboard();
        this.triggerLootOverlay(resultDetail, targetType);
    },

    consumeSlot: function(catKey) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const w = window.GlobalApp.data.wallet;
        const category = w.consumption[catKey];
        const today = new Date();
        const dayOfWeek = today.getDay(); 
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        if (category.used >= category.limit) {
            alert(`🚫 Limite diário de "${category.label}" atingido!`);
            return;
        }

        let sourceName = '';

        if (isWeekend) {
            if (w.weekend.current > 0) {
                w.weekend.current--;
                sourceName = 'Cofre FDS';
            } else {
                alert("📉 Sem slots no Cofre de Fim de Semana!");
                return;
            }
        } else {
            if (w.daily.current > 0) {
                w.daily.current--;
                sourceName = 'Cofre Diário';
            } else {
                alert("📉 Sem slots no Cofre Diário!");
                return;
            }
        }

        category.used++;
        this.addRewardToHistory(
            `Consumo: ${category.label}`, 
            `-1 Slot (${sourceName}) | Hoje: ${category.used}/${category.limit}`,
            'consume'
        );
        window.GlobalApp.saveData();
        this.renderWalletDashboard(); 
    },

    // =========================================================================
    // RENDERIZAÇÃO
    // =========================================================================

    renderWalletDashboard: function() {
        if (!window.GlobalApp.data || !window.GlobalApp.data.wallet || !window.GlobalApp.data.wallet.daily) return;

        let dashboard = document.getElementById('wallet-dashboard');
        // Se não existir, tenta criar onde o container antigo estava, ou logo no início do main content se possível
        if (!dashboard) {
            dashboard = document.createElement('div');
            dashboard.id = 'wallet-dashboard';
            dashboard.className = 'wallet-dashboard';
            // Tenta inserir antes do container de histórico se possível, ou no container principal
            const mainContainer = document.getElementById('chests-container'); 
            // Como removemos a lista de baús, usamos o container principal como referência ou inserimos no topo da seção
            if (mainContainer && mainContainer.parentNode) {
                mainContainer.parentNode.insertBefore(dashboard, mainContainer);
            }
        }

        const w = window.GlobalApp.data.wallet;
        const dailyPct = Math.min(100, (w.daily.current / w.daily.max) * 100);
        const gainedPct = Math.min(100, (w.daily.gainedToday / w.daily.max) * 100);
        const weekendPct = Math.min(100, (w.weekend.current / w.weekend.max) * 100);

        let html = `
            <div class="vaults-grid">
                <div class="vault-card daily">
                    <div class="vault-header">
                        <span>☀️ Cofre Diário</span>
                        <span class="vault-value">${w.daily.current} <small>slots</small></span>
                    </div>
                    <div class="vault-bar-bg"><div class="vault-bar-fill" style="width:${dailyPct}%"></div></div>
                    <div class="vault-sub">
                        Ganho Hoje: ${w.daily.gainedToday} / ${w.daily.max}
                        <div class="vault-bar-bg small"><div class="vault-bar-fill gain" style="width:${gainedPct}%"></div></div>
                    </div>
                </div>

                <div class="vault-card weekend">
                    <div class="vault-header">
                        <span>📅 Fim de Semana</span>
                        <span class="vault-value">${w.weekend.current} <small>/ ${w.weekend.max}</small></span>
                    </div>
                    <div class="vault-bar-bg"><div class="vault-bar-fill weekend-fill" style="width:${weekendPct}%"></div></div>
                    <div class="vault-sub">Excedente vira Cristal (3:1)</div>
                </div>

                <div class="vault-card crystal">
                    <div class="vault-header">
                        <span>💎 Cristais</span>
                        <span class="vault-value crystal-text">${w.crystals.current || 0}</span>
                    </div>
                    <div class="vault-sub" style="margin-top:25px;">
                        Moeda Premium (Infinito)
                    </div>
                </div>
            </div>

            <div class="consumption-area">
                <h3>
                    <span>Usar Slot (Consumo)</span>
                    <button class="btn-config-limits" onclick="window.ChestManager.openLimitsConfig()" title="Configurar Limites">⚙️ Configurar</button>
                </h3>
                <div class="consumption-grid">
        `;

        const cats = w.consumption;
        for (const [key, data] of Object.entries(cats)) {
            const isLimitReached = data.used >= data.limit;
            const disabledClass = isLimitReached ? 'disabled' : '';
            const limitText = isLimitReached ? 'LIMITE' : `${data.used}/${data.limit}`;
            
            html += `
                <button class="btn-consume ${disabledClass}" onclick="window.ChestManager.consumeSlot('${key}')" ${isLimitReached ? 'disabled' : ''}>
                    <span class="cat-label">${data.label}</span>
                    <span class="cat-limit">${limitText}</span>
                </button>
            `;
        }
        html += `</div></div>`;
        dashboard.innerHTML = html;
    },

    // --- CONFIGURAÇÃO & CATEGORIAS DINÂMICAS ---
    openLimitsConfig: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        const { overlay, content } = window.SysModal._createContainer();
        const cats = window.GlobalApp.data.wallet.consumption;

        const renderRows = () => {
            let rowsHtml = '';
            for (const [key, data] of Object.entries(cats)) {
                rowsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">
                        <label style="color:#fff; font-weight:bold;">${data.label}</label>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:0.8rem; color:#888;">Máx:</span>
                            <input type="number" id="limit-input-${key}" value="${data.limit}" min="0" style="width:50px; padding:5px; border-radius:4px; border:1px solid #555; background:#000; color:#fff; text-align:center;">
                        </div>
                    </div>
                `;
            }
            return rowsHtml;
        };

        content.innerHTML = `
            <h3 style="color:#fff; margin-bottom:15px; text-align:center;">Configurar Limites</h3>
            
            <div id="limits-list-container" style="max-height:200px; overflow-y:auto; margin-bottom:20px; text-align:left; border:1px solid #333; padding:10px; border-radius:4px;">
                ${renderRows()}
            </div>

            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; margin-bottom:20px;">
                <h4 style="font-size:0.9rem; color:#aaa; margin-bottom:8px;">➕ Criar Nova Categoria</h4>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="new-cat-name" placeholder="Nome (ex: Piano)" style="flex:1; padding:6px; border-radius:4px; border:1px solid #555; background:#111; color:#fff;">
                    <input type="number" id="new-cat-limit" placeholder="Limite" value="1" min="0" style="width:60px; padding:6px; border-radius:4px; border:1px solid #555; background:#111; color:#fff; text-align:center;">
                    <button id="btn-add-cat" class="primary-btn" style="padding:0 12px;">Add</button>
                </div>
            </div>

            <div class="sys-modal-actions">
                <button class="secondary-btn" id="btn-limits-cancel">Cancelar</button>
                <button class="primary-btn" id="btn-limits-save">Salvar Tudo</button>
            </div>
        `;

        // Lógica de Adicionar Categoria
        const btnAdd = content.querySelector('#btn-add-cat');
        btnAdd.onclick = () => {
            const name = content.querySelector('#new-cat-name').value.trim();
            const limit = parseInt(content.querySelector('#new-cat-limit').value);
            
            if (!name) { alert("Digite um nome para a categoria."); return; }
            if (isNaN(limit) || limit < 0) { alert("Limite inválido."); return; }

            // Gera chave segura
            const key = 'cat_' + Date.now();
            cats[key] = { label: name, used: 0, limit: limit };
            
            // Atualiza visual do modal
            content.querySelector('#limits-list-container').innerHTML = renderRows();
            content.querySelector('#new-cat-name').value = '';
            
            if (window.SoundManager) window.SoundManager.play('click');
        };

        content.querySelector('#btn-limits-cancel').onclick = () => window.SysModal._close(overlay);
        
        content.querySelector('#btn-limits-save').onclick = () => {
            if (window.SoundManager) window.SoundManager.play('click');
            
            // Salva valores editados dos existentes
            for (const key of Object.keys(cats)) {
                const inp = content.querySelector(`#limit-input-${key}`);
                if (inp) {
                    const val = parseInt(inp.value);
                    if (!isNaN(val) && val >= 0) cats[key].limit = val;
                }
            }
            
            window.GlobalApp.saveData();
            this.renderWalletDashboard();
            window.SysModal._close(overlay);
        };
    },

    // --- Histórico ---
    addRewardToHistory: function(name, path, type = 'gain') {
        if (!window.GlobalApp.data.rewards) window.GlobalApp.data.rewards = [];
        window.GlobalApp.data.rewards.push({ 
            name, 
            path, 
            type, 
            date: new Date().toLocaleString() 
        });
        
        if (window.GlobalApp.data.rewards.length > 50) window.GlobalApp.data.rewards.shift();
        this.renderRewardsHistory();
    },

    renderRewardsHistory: function() {
        if (!this.rewardsContainer) return;
        
        const rewards = window.GlobalApp.data.rewards || [];
        const reversed = [...rewards].reverse();

        const gains = reversed.filter(r => r.type === 'gain' || !r.type);
        const consumes = reversed.filter(r => r.type === 'consume');

        this.rewardsContainer.innerHTML = `
            <div class="history-container">
                <div class="history-split">
                    <div class="history-col">
                        <h4>📥 Entradas</h4>
                        <div id="history-gains-list"></div>
                    </div>
                    <div class="history-col">
                        <h4>📤 Saídas</h4>
                        <div id="history-consumes-list"></div>
                    </div>
                </div>
            </div>
        `;

        const gainList = this.rewardsContainer.querySelector('#history-gains-list');
        const consumeList = this.rewardsContainer.querySelector('#history-consumes-list');

        const createItem = (r, originalIndex) => `
            <div class="reward-log-item ${r.type || 'gain'}">
                <div>
                    <span class="reward-name">${r.name}</span>
                    <span class="reward-path">${r.path || ''}</span>
                    <small style="color:#555; font-size:0.7em;">${r.date}</small>
                </div>
                <button class="btn-delete-reward" onclick="window.ChestManager.deleteReward(${originalIndex})">×</button>
            </div>
        `;

        gains.forEach(r => {
            const idx = rewards.indexOf(r);
            gainList.insertAdjacentHTML('beforeend', createItem(r, idx));
        });

        consumes.forEach(r => {
            const idx = rewards.indexOf(r);
            consumeList.insertAdjacentHTML('beforeend', createItem(r, idx));
        });
        
        if (gains.length === 0) gainList.innerHTML = '<div style="padding:10px; color:#555; font-style:italic;">Nada aqui.</div>';
        if (consumes.length === 0) consumeList.innerHTML = '<div style="padding:10px; color:#555; font-style:italic;">Nada aqui.</div>';
    },

    deleteReward: function(index) {
        if (confirm("Remover do histórico?")) {
            window.GlobalApp.data.rewards.splice(index, 1);
            window.GlobalApp.saveData();
            this.renderRewardsHistory();
        }
    },

    ensureConsumptionData: function() {
        const w = window.GlobalApp.data.wallet;
        if (!w) return;
        
        // Garante pelo menos as padrões se estiver vazio
        const defaults = {
            movies:    { label: 'Filme',     used: 0, limit: 1 },
            series:    { label: 'Série',     used: 0, limit: 3 },
            youtube:   { label: 'YouTube',   used: 0, limit: 2 },
            general:   { label: 'Outros',    used: 0, limit: 5 }
        };

        if (!w.consumption) w.consumption = {};
        
        // Mescla defaults apenas se as chaves não existirem
        for (const [key, def] of Object.entries(defaults)) {
            if (!w.consumption[key]) {
                w.consumption[key] = def;
            }
        }
    },

    // --- PONTO DE ENTRADA EXTERNO (Level Up / Scripts) ---
    // Substitui o antigo openLinkedChest para ganho direto
    openLinkedChest: function() {
        // Ignora verificação de ID e dá o slot direto
        this.addSlotToWallet('Level Up / Bônus');
    }
};

window.ChestManager.init();