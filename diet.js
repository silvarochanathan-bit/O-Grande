/**
 * DIET.JS (V6.1 - NUTRITION OS)
 * Gerenciador de Nutrição, Banco de Alimentos e Controle de Peso.
 * Integrado ao Sistema Global.
 */

window.DietManager = {
    
    // Estado Interno temporário
    currentLogMealIndex: null,
    editingFoodIndex: null, // Novo: Controle de Edição
    
    init: function() {
        this.bindEvents();
        
        // 1. Observer para detectar navegação de forma segura (sem quebrar o GlobalApp)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-current-app') {
                    const currentApp = document.body.getAttribute('data-current-app');
                    if (currentApp === 'diet') {
                        // Pequeno delay para garantir que dados estejam prontos
                        setTimeout(() => {
                            this.ensureData();
                            this.render();
                        }, 50);
                    }
                }
            });
        });

        observer.observe(document.body, { attributes: true });

        // 2. Renderização inicial se já estiver na dieta (F5 na página)
        document.addEventListener('SiteC_DataReady', () => {
            if (document.body.getAttribute('data-current-app') === 'diet') {
                this.ensureData();
                this.render();
            }
        });
    },

    ensureData: function() {
        // Blindagem contra carregamento prematuro
        if (!window.GlobalApp || !window.GlobalApp.data) return;

        const d = window.GlobalApp.data;
        if (!d.diet) d.diet = {};
        
        // Configurações Padrão
        if (!d.diet.settings) {
            d.diet.settings = {
                phase: 'main', // cut, bulk, main
                weights: { start: 70, current: 70, goal: 70 },
                // Removido gordura (f) dos targets padrão
                targets: { kcal: 2000, p: 150, c: 200 },
                mealsCount: 4,
                mealTargets: {}, // Novo: Metas individuais por refeição
                weighInDay: 1 // Default: Segunda-feira (0=Dom, 1=Seg, etc)
            };
        }
        
        // Garante que mealTargets exista (migração)
        if (!d.diet.settings.mealTargets) {
            d.diet.settings.mealTargets = {};
        }

        // Garante que weighInDay exista (migração)
        if (d.diet.settings.weighInDay === undefined) {
            d.diet.settings.weighInDay = 1;
        }

        // --- BIO-REACTOR VARIABLES (GAMIFICATION) ---
        if (!d.diet.streaks) {
            d.diet.streaks = { meal: 0, day: 0, week: 0 };
        }
        if (!d.diet.startDate) {
            d.diet.startDate = Date.now();
        }
        if (!d.diet.lastWeighInDate) {
            d.diet.lastWeighInDate = null;
        }

        // --- HISTÓRICO DE XP (UNDO SYSTEM) ---
        if (!d.diet.xpHistory) {
            d.diet.xpHistory = [];
        }

        // Banco de Alimentos Padrão (Exemplos) - Removido Gordura
        if (!d.diet.foodDb || !Array.isArray(d.diet.foodDb)) {
            d.diet.foodDb = [
                { id: 'f1', name: 'Arroz Branco (Cozido)', kcal: 130, p: 2.7, c: 28 },
                { id: 'f2', name: 'Peito de Frango (Grelhado)', kcal: 165, p: 31, c: 0 },
                { id: 'f3', name: 'Ovo Inteiro (Cozido)', kcal: 155, p: 13, c: 1.1 },
                { id: 'f4', name: 'Banana Prata', kcal: 98, p: 1.3, c: 26 },
                { id: 'f5', name: 'Aveia em Flocos', kcal: 368, p: 14, c: 60 },
                { id: 'f6', name: 'Whey Protein (Padrão)', kcal: 400, p: 80, c: 10 } // ~100g de pó
            ];
        }

        // Logs de Refeições: { "DD/MM/AAAA": { 0: [...foods], 1: [...foods] } }
        if (!d.diet.logs) {
            d.diet.logs = {};
        }
    },

    bindEvents: function() {
        // Botões de Abertura de Modal
        const btnSettings = document.getElementById('btn-diet-settings');
        if (btnSettings) btnSettings.onclick = () => this.openSettings();

        const btnFoodDb = document.getElementById('btn-diet-food-db');
        if (btnFoodDb) btnFoodDb.onclick = () => this.openFoodDb();

        // Novo: Botão de Histórico
        const btnHistory = document.getElementById('btn-diet-history');
        if (btnHistory) btnHistory.onclick = () => this.openHistory();

        // Listener para atualizar campos dinâmicos de metas ao mudar nº de refeições
        const inputMealsCount = document.getElementById('diet-meals-count');
        if (inputMealsCount) {
            inputMealsCount.onchange = () => this.renderMealTargetsConfigInputs();
            inputMealsCount.oninput = () => this.renderMealTargetsConfigInputs();
        }

        // Forms
        const formSettings = document.getElementById('form-diet-settings');
        if (formSettings) {
            formSettings.onsubmit = (e) => {
                e.preventDefault();
                this.saveSettings();
            };
            document.getElementById('btn-cancel-diet-settings').onclick = () => {
                document.getElementById('modal-diet-settings').classList.add('hidden');
            };
        }

        const formAddFood = document.getElementById('form-diet-add-food');
        if (formAddFood) {
            formAddFood.onsubmit = (e) => {
                e.preventDefault();
                this.addFoodToDb();
            };
            document.getElementById('btn-close-food-db').onclick = () => {
                document.getElementById('modal-diet-food-db').classList.add('hidden');
                // Limpa estado de edição ao fechar
                this.editingFoodIndex = null;
                this.resetFoodForm();
            };
        }

        const formLog = document.getElementById('form-diet-log');
        if (formLog) {
            // Atualiza preview ao mudar select ou input
            document.getElementById('log-food-select').onchange = () => this.updateLogPreview();
            document.getElementById('log-food-grams').oninput = () => this.updateLogPreview();

            formLog.onsubmit = (e) => {
                e.preventDefault();
                this.saveFoodLog();
            };
            document.getElementById('btn-cancel-diet-log').onclick = () => {
                document.getElementById('modal-diet-log').classList.add('hidden');
            };
        }

        // Fechar Histórico
        const btnCloseHistory = document.getElementById('btn-close-diet-history');
        if (btnCloseHistory) {
            btnCloseHistory.onclick = () => {
                document.getElementById('modal-diet-history').classList.add('hidden');
            };
        }
    },

    // =========================================================================
    // BIO-REACTOR MATH ENGINES (HELPER FUNCTIONS)
    // =========================================================================

    getUserLevel: function() {
        // Correção de segurança: Verifica se objeto xp existe antes de acessar level
        if (window.GlobalApp && window.GlobalApp.data && window.GlobalApp.data.xp) {
            return window.GlobalApp.data.xp.level || 1;
        }
        return 1; // Retorno padrão seguro se user não estiver carregado
    },

    getPhaseMultiplier: function() {
        const phase = window.GlobalApp.data.diet.settings.phase || 'main';
        const map = {
            'cut': 1.6, // Dificuldade Suprema
            'bulk': 1.4, // Dificuldade Alta
            'main': 1.1  // Manutenção
        };
        return map[phase] || 1.1;
    },

    getAdaptationMultiplier: function() {
        const start = window.GlobalApp.data.diet.startDate;
        if (!start) return 1.0;
        
        const diffTime = Math.abs(Date.now() - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        // M_adapt = Max(1.0, 2.0 - ((DiaAtual - 1) * 0.05))
        const mult = Math.max(1.0, 2.0 - ((diffDays - 1) * 0.05));
        return parseFloat(mult.toFixed(2));
    },

    calculateAccuracy: function(target, actual) {
        if (!target || target === 0) return 0.5; // Sem meta = Safe Zone
        const diff = Math.abs(target - actual);
        const errorPct = diff / target;

        if (errorPct <= 0.05) return 1.0; // Bullseye (< 5%)
        if (errorPct <= 0.15) return 0.5; // Safe Zone (< 15%)
        return 0.0;                       // Miss (> 15%)
    },

    // =========================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // =========================================================================

    render: function() {
        // Verificação de Segurança (Dados e Contexto)
        if (!window.GlobalApp || !window.GlobalApp.data) return;
        if (document.body.getAttribute('data-current-app') !== 'diet') return;

        this.ensureData();
        
        // Se ainda assim não tiver dados de dieta, aborta
        if (!window.GlobalApp.data.diet) return;

        const settings = window.GlobalApp.data.diet.settings;

        // 1. Renderiza Gráfico de Peso
        this.renderWeightChart(settings.weights);

        // 1.5. Verifica Status de Pesagem (Castigo/Bônus)
        this.checkWeighInStatus();

        // 2. Calcula Totais de Hoje
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = window.GlobalApp.data.diet.logs[todayStr] || {};
        
        let total = { kcal: 0, p: 0, c: 0 };
        
        // Itera sobre as refeições configuradas
        for (let i = 0; i < settings.mealsCount; i++) {
            const foods = todayLog[i] || [];
            foods.forEach(f => {
                total.kcal += f.kcal;
                total.p += f.p;
                total.c += f.c;
                // Fat removido do cálculo
            });
        }

        // 3. Renderiza Resumo de Macros (com botão Fechar Dia)
        this.renderDailySummary(total, settings.targets);

        // 4. Renderiza Lista de Refeições
        this.renderMealsList(settings, todayLog);

        // 5. Sincroniza Água (Legacy Support)
        if (window.DietManagerLegacy && window.DietManagerLegacy.updateWaterDisplay) {
            window.DietManagerLegacy.updateWaterDisplay();
        }

        // 6. Atualiza Streak no HUD
        const streakEl = document.getElementById('diet-streak-val');
        if (streakEl) {
            streakEl.textContent = window.GlobalApp.data.diet.streaks.day || 0;
        }

        // 7. Atualiza Auditor (Widget de XP)
        this.updateAuditorWithDiet();
    },

    // --- Lógica de Pesagem e Bloqueio ---
    checkWeighInStatus: function() {
        const d = window.GlobalApp.data;
        const s = d.diet.settings;
        const weighDay = s.weighInDay; // 0-6 (Dom-Sab)
        const today = new Date();
        const currentDay = today.getDay(); // 0-6
        const lastWeighStr = d.diet.lastWeighInDate; // "YYYY-MM-DD"

        // Encontra a data da última ocorrência do dia de pesagem (alvo)
        // Se hoje for o dia, target = hoje. Se não, volta pro passado.
        let diff = currentDay - weighDay;
        if (diff < 0) diff += 7;
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - diff);
        const targetDateStr = window.GlobalApp.formatDate(targetDate);

        // Se já pesamos na data alvo ou depois (ex: adiantado, se fosse permitido), está ok.
        // Verificamos se lastWeighStr >= targetDateStr
        let status = "OK";
        
        if (lastWeighStr && lastWeighStr >= targetDateStr) {
            status = "DONE";
        } else {
            // Não pesou referente a data alvo mais recente
            if (diff === 0) status = "DUE"; // É hoje
            else if (diff === 1) status = "LATE_1"; // 1 dia atrasado
            else if (diff >= 2) status = "LOCKED"; // Castigo
        }

        // Aplica Bloqueio Global
        if (status === "LOCKED") {
            if (!d.xp.blocked) {
                d.xp.blocked = true;
                window.GlobalApp.saveData();
                console.log("XP BLOQUEADO POR FALTA DE PESAGEM");
            }
        } else {
            if (d.xp.blocked) {
                d.xp.blocked = false;
                window.GlobalApp.saveData();
            }
        }

        // Renderiza Botão de Ação no Gráfico
        const container = document.getElementById('diet-weight-chart');
        if (!container) return;

        // Remove botão anterior se existir
        const oldBtn = document.getElementById('btn-diet-weigh-action');
        if (oldBtn) oldBtn.remove();
        
        // Remove aviso de bloqueio anterior
        container.classList.remove('weigh-lockdown-mode');

        if (status !== "DONE") {
            const btn = document.createElement('button');
            btn.id = 'btn-diet-weigh-action';
            btn.style.width = "100%";
            btn.style.marginTop = "10px";
            btn.style.padding = "10px";
            btn.style.borderRadius = "8px";
            btn.style.cursor = "pointer";
            btn.style.fontSize = "0.9rem";
            btn.style.textTransform = "uppercase";

            if (status === "DUE") {
                btn.className = "btn-weigh-pulse-green";
                btn.textContent = "⚖️ REGISTRE SEU PESO (BÔNUS ATIVO)";
                btn.onclick = () => this.registerWeighInAction(false);
            } else if (status === "LATE_1") {
                btn.className = "btn-weigh-pulse-red";
                btn.textContent = "⚠️ REGISTRE AGORA (ÚLTIMA CHANCE)";
                btn.onclick = () => this.registerWeighInAction(false);
            } else if (status === "LOCKED") {
                btn.className = "btn-weigh-pulse-red";
                btn.textContent = "⛔ DESBLOQUEAR XP (REGISTRE O PESO)";
                btn.onclick = () => this.registerWeighInAction(true);
                container.classList.add('weigh-lockdown-mode');
            }
            
            container.appendChild(btn);
        }
    },

    registerWeighInAction: function(isPunishment) {
        const d = window.GlobalApp.data.diet;
        const s = d.settings;
        const currentW = s.weights.current;
        
        const newValStr = prompt("Registre seu peso atual (kg):", currentW);
        if (!newValStr) return;

        const newVal = parseFloat(newValStr.replace(',', '.'));
        if (isNaN(newVal) || newVal <= 0) {
            alert("Valor inválido.");
            return;
        }

        // 1. Atualização Direta de Dados
        const oldWeight = s.weights.current;
        s.weights.current = newVal;
        
        // Atualiza Input do Modal se existir (Sincronia visual caso o usuário abra depois)
        const inputEl = document.getElementById('diet-weight-current');
        if (inputEl) inputEl.value = newVal;

        // Atualiza Data da Última Pesagem
        d.lastWeighInDate = window.GlobalApp.getGameDate();

        // 2. Lógica de Castigo e Desbloqueio
        if (isPunishment) {
             if (window.GlobalApp.data.xp) window.GlobalApp.data.xp.blocked = false;
             alert("Peso registrado. XP Desbloqueado! (Sem ganho de XP por atraso)");
        } else {
            // 3. Lógica de XP (Autônoma/Cópia)
            const level = this.getUserLevel();
            
            const baseXP = Math.ceil(level * 10); // 10% do Nível*100 simplificado
            const phaseMult = this.getPhaseMultiplier();
            
            const delta = newVal - oldWeight;
            const isCut = s.phase === 'cut';
            const targetDelta = isCut ? -0.25 : 0.25; 
            
            const dist = Math.abs(delta - targetDelta);
            let tablePct = 0;

            if (dist <= 0.1) tablePct = 1.0; 
            else if (dist <= 0.2) tablePct = 0.7; 
            else if (dist <= 0.3) tablePct = 0.3; 
            else tablePct = 0.1; // Mínimo por pesar

            let streakIncrement = 0;
            // Atualiza Streak Semana
            if (tablePct >= 0.3) {
                streakIncrement = 1;
                d.streaks.week = (d.streaks.week || 0) + 1;
            } else {
                d.streaks.week = 0;
            }

            const streakMult = 1 + (d.streaks.week * 0.1);
            
            const finalXP = Math.round(baseXP * phaseMult * tablePct * streakMult);
            
            const todayStr = window.GlobalApp.getGameDate();

            let receipt = null;
            if (finalXP > 0) {
                 receipt = {
                    title: "Pesagem Semanal",
                    total: finalXP,
                    sections: [
                        { title: "[1] CÁLCULO", rows: [{label:`Base (Level*10)`, value:baseXP}, {label:`Tabela (${(tablePct*100).toFixed(0)}%)`, value:`x ${tablePct}`}] },
                        { title: "[2] MULTIPLICADORES", rows: [{label:`Streak Semanal (${d.streaks.week})`, value:`x ${streakMult.toFixed(1)}`}] }
                    ]
                };
            }

            const historyItem = {
                id: Date.now(),
                type: 'weigh',
                xp: finalXP,
                streakIncrement: streakIncrement,
                date: todayStr,
                receipt: receipt
            };
            d.xpHistory.push(historyItem);

            if (finalXP > 0 && receipt) {
                if (window.XPManager) {
                    window.XPManager.gainXP(finalXP, 'Pesagem', { type: 'diet', receipt: receipt });
                }
                alert(`Pesagem Registrada! +${finalXP} XP`);
            }
        }

        // Salvar e Renderizar
        window.GlobalApp.saveData();
        this.render();
    },

    renderWeightChart: function(weights) {
        const container = document.getElementById('diet-weight-chart');
        const progressText = document.getElementById('diet-weight-progress');
        if (!container) return;

        const start = parseFloat(weights.start) || 0;
        const current = parseFloat(weights.current) || 0;
        const goal = parseFloat(weights.goal) || 0;

        // Cálculo de Progresso
        let progress = 0;
        const totalDiff = Math.abs(goal - start);
        const currentDiff = Math.abs(current - start);
        
        if (totalDiff > 0) {
            progress = (currentDiff / totalDiff) * 100;
        }
        // Se já passou da meta
        if ((goal > start && current >= goal) || (goal < start && current <= goal)) {
            progress = 100;
        }

        // Normalização visual para as barras (Escala relativa)
        const vals = [start, current, goal];
        const minVal = Math.min(...vals) * 0.9;
        const maxVal = Math.max(...vals) * 1.1; // 10% de margem
        const range = maxVal - minVal || 1;

        const getH = (v) => ((v - minVal) / range) * 100;

        container.innerHTML = `
            <div class="weight-bar-container">
                <div class="weight-bar-col">
                    <span class="weight-value">${start}kg</span>
                    <div class="weight-bar" style="height: ${getH(start)}%"></div>
                    <span class="weight-label">Início</span>
                </div>
                <div class="weight-bar-col">
                    <span class="weight-value" style="color:#00c6ff; font-size:1.1rem;">${current}kg</span>
                    <div class="weight-bar current" style="height: ${getH(current)}%"></div>
                    <span class="weight-label" style="color:#fff; font-weight:bold;">Atual</span>
                </div>
                <div class="weight-bar-col">
                    <span class="weight-value">${goal}kg</span>
                    <div class="weight-bar" style="height: ${getH(goal)}%"></div>
                    <span class="weight-label">Meta</span>
                </div>
            </div>
        `;

        progressText.innerHTML = `Progresso da Meta: <strong style="color:${progress >= 100 ? '#56ab2f' : '#fff'}">${progress.toFixed(1)}%</strong>`;
    },

    renderDailySummary: function(total, target) {
        const container = document.getElementById('diet-daily-summary');
        if (!container) return;

        // Novo layout V6.1 - Nutrition OS (Fat Removed)
        const mkBar = (type, label, val, max, iconChar) => {
            const pct = Math.min(100, (val / max) * 100);
            return `
                <div class="macro-row">
                    <div class="macro-info-group">
                        <div class="macro-icon icon-${type}">${iconChar}</div>
                        <span class="macro-label">${label}</span>
                    </div>
                    <div class="macro-bar-bg">
                        <div class="macro-bar-fill ${type}" style="width:${pct}%"></div>
                    </div>
                    <div class="macro-value">
                        <strong>${Math.round(val)}</strong>/${max}
                    </div>
                </div>
            `;
        };

        const closeBtnHtml = `
            <button onclick="window.DietManager.closeDay()" 
                    style="width:100%; margin-top:15px; background:var(--grad-kcal); border:none; padding:12px; border-radius:12px; font-weight:bold; color:#000; text-transform:uppercase; cursor:pointer; box-shadow:0 4px 15px rgba(86,171,47,0.4);">
                ✅ FECHAR DIA (AUDITORIA)
            </button>
        `;

        // Removed Fat Bar
        container.innerHTML = `
            ${mkBar('kcal', 'Kcal', total.kcal, target.kcal, '⚡')}
            ${mkBar('prot', 'Prot', total.p, target.p, 'P')}
            ${mkBar('carb', 'Carb', total.c, target.c, 'C')}
            ${closeBtnHtml}
        `;
    },

    renderMealsList: function(settings, todayLog) {
        const container = document.getElementById('diet-meals-list');
        if (!container) return;

        container.innerHTML = '';

        // Calcula metas sugeridas (Divisão Igualitária padrão)
        const defaultPerMeal = {
            kcal: Math.round(settings.targets.kcal / settings.mealsCount),
            p: Math.round(settings.targets.p / settings.mealsCount),
            c: Math.round(settings.targets.c / settings.mealsCount)
        };

        const mealStatus = todayLog.mealStatus || {};

        for (let i = 0; i < settings.mealsCount; i++) {
            const foods = todayLog[i] || [];
            
            // Verifica se existe meta individual salva
            const mealTarget = (settings.mealTargets && settings.mealTargets[i]) 
                ? settings.mealTargets[i] 
                : defaultPerMeal;

            // Totais desta refeição
            let mTotal = { kcal: 0, p: 0, c: 0 };
            let foodsHTML = '';
            const isRegistered = mealStatus[i] === true;

            foods.forEach((f, idx) => {
                mTotal.kcal += f.kcal;
                mTotal.p += f.p;
                mTotal.c += f.c;

                // Novo design de item de comida V6.1 - Fat Removed
                // Botão de remover só aparece se não estiver registrado
                const removeBtn = isRegistered 
                    ? '' 
                    : `<button class="btn-remove-food" onclick="window.DietManager.removeFoodLog(${i}, ${idx})">×</button>`;

                foodsHTML += `
                    <div class="food-entry-item">
                        <div class="food-info">
                            <strong>${f.name}</strong>
                            <span>${f.grams}g • <span style="color:#fff">${Math.round(f.kcal)}</span> kcal • P:${Math.round(f.p)} C:${Math.round(f.c)}</span>
                        </div>
                        ${removeBtn}
                    </div>
                `;
            });

            if (foods.length === 0) {
                foodsHTML = `<div style="padding:20px; text-align:center; font-size:0.8rem; color:var(--diet-text-sub); opacity:0.6;">Toque em adicionar para registrar.</div>`;
            }

            // Cores de status dinâmico
            const kPct = Math.min(100, (mTotal.kcal / mealTarget.kcal) * 100);
            let kColor = '#666'; 
            if (kPct > 110) kColor = '#ff453a'; // Passou muito
            else if (kPct > 80) kColor = '#56ab2f'; // Na meta

            // Lógica dos Botões de Ação
            let actionButtons = '';
            
            if (isRegistered) {
                actionButtons = `
                    <div style="padding:15px; text-align:center; background:rgba(86,171,47,0.1); border-top:1px solid rgba(86,171,47,0.3); color:#56ab2f; font-weight:bold; font-size:0.8rem; text-transform:uppercase;">
                        ✅ Refeição Registrada
                    </div>
                `;
            } else {
                const addBtn = `
                    <button class="btn-add-food-meal" onclick="window.DietManager.openLogModal(${i})">
                        + Adicionar Alimento
                    </button>
                `;
                
                let registerBtn = '';
                if (foods.length > 0) {
                    registerBtn = `
                        <button onclick="window.DietManager.registerMeal(${i})" 
                                class="btn-register-meal">
                            ✅ Registrar Refeição
                        </button>
                    `;
                }
                
                actionButtons = addBtn + registerBtn;
            }

            const div = document.createElement('div');
            div.className = 'meal-card';
            div.innerHTML = `
                <div class="meal-header">
                    <span class="meal-title">Refeição ${i + 1}</span>
                    <div class="meal-macros-mini">
                        <span style="color:${kColor}">${Math.round(mTotal.kcal)}/${mealTarget.kcal}</span>
                        <span>P: ${Math.round(mTotal.p)}/${mealTarget.p}</span>
                        <span>C: ${Math.round(mTotal.c)}/${mealTarget.c}</span>
                    </div>
                </div>
                <div class="meal-foods-list">
                    ${foodsHTML}
                </div>
                ${actionButtons}
            `;
            container.appendChild(div);
        }
    },

    // =========================================================================
    // BIO-REACTOR CORE ACTIONS
    // =========================================================================

    // Nova Função: Registrar Refeição Completa (Commit)
    registerMeal: function(mealIndex) {
        const d = window.GlobalApp.data.diet;
        const todayStr = window.GlobalApp.getGameDate();
        
        // Garante estrutura
        if (!d.logs[todayStr]) d.logs[todayStr] = {};
        if (!d.logs[todayStr].mealStatus) d.logs[todayStr].mealStatus = {};
        
        // Verificação dupla
        if (d.logs[todayStr].mealStatus[mealIndex]) {
            alert("Esta refeição já foi registrada!");
            return;
        }

        const foods = d.logs[todayStr][mealIndex] || [];
        if (foods.length === 0) return;

        // Calcula Totais da Refeição
        let totalKcal = 0;
        foods.forEach(f => totalKcal += f.kcal);

        // Busca Meta
        const settings = d.settings;
        const defaultPerMeal = Math.round(settings.targets.kcal / settings.mealsCount);
        const mealTarget = (settings.mealTargets && settings.mealTargets[mealIndex]) 
            ? settings.mealTargets[mealIndex].kcal 
            : defaultPerMeal;

        // MATH: Bio-Reactor Logic
        const accuracy = this.calculateAccuracy(mealTarget, totalKcal);
        
        let streakIncrement = 0;
        // Atualiza Streak
        if (accuracy >= 0.5) {
            streakIncrement = 1;
            d.streaks.meal = (d.streaks.meal || 0) + 1;
        } else {
            // Miss: Reseta streak de refeição
            d.streaks.meal = 0;
        }

        const streakMult = 1 + (d.streaks.meal * 0.1);
        const level = this.getUserLevel();
        
        // Fórmula de XP da Refeição
        const baseXP = level * 10;
        const finalXP = Math.round(baseXP * accuracy * streakMult);

        // Marca como registrada
        d.logs[todayStr].mealStatus[mealIndex] = true;

        let receipt = null;
        if (finalXP > 0) {
            receipt = {
                title: `Refeição ${mealIndex + 1}`,
                total: finalXP,
                sections: [
                    { title: "[1] BASE", rows: [{ label: `Nível (${level}) x 10`, value: baseXP }] },
                    { title: "[2] MULTIPLICADORES", rows: [
                        { label: `Precisão (${(accuracy*100).toFixed(0)}%)`, value: `x ${accuracy}` },
                        { label: `Streak Meal (${d.streaks.meal})`, value: `x ${streakMult.toFixed(1)}` }
                    ]}
                ]
            };
        }

        // Salvar Histórico (Para Desfazer)
        const historyItem = {
            id: Date.now(),
            type: 'meal',
            mealIndex: mealIndex,
            xp: finalXP,
            streakIncrement: streakIncrement, // Guarda se incrementou pra poder desfazer
            date: todayStr,
            receipt: receipt
        };
        d.xpHistory.push(historyItem);

        if (finalXP > 0 && receipt) {
            if (window.XPManager) {
                window.XPManager.gainXP(finalXP, 'Refeição Registrada', { type: 'diet', receipt: receipt });
            }
        } else {
            alert("Refeição registrada fora da precisão mínima. XP Gerado: 0.");
        }

        window.GlobalApp.saveData();
        this.render();
    },

    closeDay: function() {
        if (!confirm("Tem certeza que deseja fechar o dia? Isso irá gerar a Auditoria final.")) return;

        const d = window.GlobalApp.data.diet;
        const settings = d.settings;
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = d.logs[todayStr] || {};

        // 1. Calcula Total do Dia
        let totalKcal = 0;
        for (let key in todayLog) {
            if (Array.isArray(todayLog[key])) {
                todayLog[key].forEach(f => totalKcal += f.kcal);
            }
        }

        // 2. Calcula Precisão do Dia
        const accuracy = this.calculateAccuracy(settings.targets.kcal, totalKcal);
        
        let streakIncrement = 0;
        // 3. Atualiza Streak Diário
        if (accuracy > 0) {
            streakIncrement = 1;
            d.streaks.day = (d.streaks.day || 0) + 1;
        } else {
            d.streaks.day = 0;
        }

        // 4. Multiplicadores
        const level = this.getUserLevel();
        const phaseMult = this.getPhaseMultiplier();
        const adaptMult = this.getAdaptationMultiplier();
        const streakMult = 1 + (d.streaks.day * 0.1);

        // 5. Fórmula: (Nivel * 200) * Phase * Adapt * Accuracy * Streak
        const baseXP = level * 200;
        const finalXP = Math.round(baseXP * phaseMult * adaptMult * accuracy * streakMult);

        let receipt = null;
        if (finalXP > 0) {
            receipt = {
                title: "Auditoria Diária",
                total: finalXP,
                sections: [
                    {
                        title: "[1] CÁLCULO BASE",
                        rows: [
                            { label: `Nível (${level}) x 200`, value: baseXP },
                            { label: `Precisão (${accuracy === 1 ? 'Bullseye' : accuracy === 0.5 ? 'Safe' : 'Miss'})`, value: `x ${accuracy.toFixed(2)}` }
                        ]
                    },
                    {
                        title: "[2] MULTIPLICADORES",
                        rows: [
                            { label: `Fase (${settings.phase.toUpperCase()})`, value: `x ${phaseMult}` },
                            { label: `Adaptação`, value: `x ${adaptMult}` },
                            { label: `Streak Dia (${d.streaks.day})`, value: `x ${streakMult.toFixed(1)}` }
                        ]
                    }
                ]
            };
        }

        // Salvar Histórico (Para Desfazer)
        const historyItem = {
            id: Date.now(),
            type: 'day',
            xp: finalXP,
            streakIncrement: streakIncrement,
            date: todayStr,
            receipt: receipt
        };
        d.xpHistory.push(historyItem);

        // 6. Recibo (Receipt)
        if (finalXP > 0 && receipt) {
            if (window.XPManager) {
                window.XPManager.gainXP(finalXP, 'Fechamento do Dia', { type: 'diet', receipt: receipt });
            }
        } else {
             alert("Dia fechado com precisão insuficiente. XP Gerado: 0.");
        }

        window.GlobalApp.saveData();
        alert(`Dia Fechado! +${finalXP} XP gerados.`);
        this.render();
    },

    // =========================================================================
    // HISTÓRICO E DESFAZER
    // =========================================================================

    openHistory: function() {
        this.renderHistory();
        document.getElementById('modal-diet-history').classList.remove('hidden');
    },

    renderHistory: function() {
        const list = window.GlobalApp.data.diet.xpHistory || [];
        const container = document.getElementById('diet-history-list');
        container.innerHTML = '';

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Sem histórico recente.</div>';
            return;
        }

        // Renderiza reverso (mais novo primeiro)
        [...list].reverse().forEach(item => {
            const date = new Date(item.id).toLocaleTimeString();
            let icon = '❓';
            let title = 'Evento';
            
            if (item.type === 'meal') {
                icon = '🍲';
                title = `Refeição ${item.mealIndex + 1}`;
            } else if (item.type === 'day') {
                icon = '📅';
                title = 'Fechamento do Dia';
            } else if (item.type === 'weigh') {
                icon = '⚖️';
                title = 'Pesagem';
            }

            const div = document.createElement('div');
            div.className = 'diet-history-item';
            div.innerHTML = `
                <div class="history-info">
                    <div class="history-icon">${icon}</div>
                    <div class="history-details">
                        <span class="history-title">${title}</span>
                        <span class="history-xp" style="font-size:0.7rem; color:#aaa;">${date} • <strong style="color:var(--grad-kcal)">+${item.xp} XP</strong></span>
                    </div>
                </div>
                <button class="btn-undo-history" onclick="window.DietManager.undoHistory(${item.id})">↩️</button>
            `;
            container.appendChild(div);
        });
    },

    undoHistory: function(id) {
        if (!confirm("Desfazer este ganho de XP e destravar o registro?")) return;

        const d = window.GlobalApp.data.diet;
        const idx = d.xpHistory.findIndex(x => x.id === id);
        if (idx === -1) return;

        const item = d.xpHistory[idx];

        // 1. Remove XP Global
        if (window.XPManager) {
            window.XPManager.gainXP(-item.xp, 'Desfazer: ' + item.type, { type: 'diet', forceFlat: true });
        }

        // 2. Reverte Estado Específico
        if (item.type === 'meal') {
            // Destrava refeição
            if (d.logs[item.date] && d.logs[item.date].mealStatus) {
                d.logs[item.date].mealStatus[item.mealIndex] = false;
            }
            // Decrementa streak se foi incrementado
            if (item.streakIncrement > 0) {
                d.streaks.meal = Math.max(0, (d.streaks.meal || 0) - item.streakIncrement);
            }
        } else if (item.type === 'day') {
            // Decrementa streak dia
            if (item.streakIncrement > 0) {
                d.streaks.day = Math.max(0, (d.streaks.day || 0) - item.streakIncrement);
            }
        } else if (item.type === 'weigh') {
             // Decrementa streak semana
             if (item.streakIncrement > 0) {
                d.streaks.week = Math.max(0, (d.streaks.week || 0) - item.streakIncrement);
            }
        }

        // 3. Remove do Histórico
        d.xpHistory.splice(idx, 1);
        
        window.GlobalApp.saveData();
        this.renderHistory();
        this.render(); // Atualiza a tela principal (destrava botões)
    },

    // =========================================================================
    // CONFIGURAÇÕES (AGORA COM PESAGEM SEMANAL)
    // =========================================================================

    openSettings: function() {
        const modal = document.getElementById('modal-diet-settings');
        const s = window.GlobalApp.data.diet.settings;

        document.getElementById('diet-phase').value = s.phase;
        document.getElementById('diet-weight-start').value = s.weights.start;
        document.getElementById('diet-weight-current').value = s.weights.current;
        document.getElementById('diet-weight-goal').value = s.weights.goal;
        document.getElementById('diet-meals-count').value = s.mealsCount;

        document.getElementById('diet-target-kcal').value = s.targets.kcal;
        document.getElementById('diet-target-prot').value = s.targets.p;
        document.getElementById('diet-target-carb').value = s.targets.c;
        // Removed diet-target-fat loading

        // Injeta Seletor de Dia da Pesagem se não existir
        let weighContainer = document.getElementById('diet-weigh-day-container');
        if (!weighContainer) {
            const phaseSelect = document.getElementById('diet-phase');
            if (phaseSelect && phaseSelect.parentNode) {
                weighContainer = document.createElement('div');
                weighContainer.id = 'diet-weigh-day-container';
                weighContainer.style.marginTop = '10px';
                weighContainer.innerHTML = `
                    <label class="gym-form-label">Dia da Pesagem</label>
                    <select id="diet-weigh-day" class="gym-form-input">
                        <option value="0">Domingo</option>
                        <option value="1">Segunda-feira</option>
                        <option value="2">Terça-feira</option>
                        <option value="3">Quarta-feira</option>
                        <option value="4">Quinta-feira</option>
                        <option value="5">Sexta-feira</option>
                        <option value="6">Sábado</option>
                    </select>
                `;
                phaseSelect.parentNode.insertBefore(weighContainer, phaseSelect.nextSibling);
            }
        }

        // Define valor do seletor
        const weighSelect = document.getElementById('diet-weigh-day');
        if (weighSelect) {
            weighSelect.value = s.weighInDay !== undefined ? s.weighInDay : 1;
        }

        // Gera inputs dinâmicos
        this.renderMealTargetsConfigInputs();

        modal.classList.remove('hidden');
    },

    // Gera os campos de meta por refeição dentro do modal
    renderMealTargetsConfigInputs: function() {
        const container = document.getElementById('diet-meal-targets-config');
        if (!container) return;

        const count = parseInt(document.getElementById('diet-meals-count').value) || 4;
        const s = window.GlobalApp.data.diet.settings;
        const totalKcal = parseFloat(document.getElementById('diet-target-kcal').value) || 2000;
        const totalP = parseFloat(document.getElementById('diet-target-prot').value) || 150;
        const totalC = parseFloat(document.getElementById('diet-target-carb').value) || 200;

        container.innerHTML = '';

        for (let i = 0; i < count; i++) {
            // Se já existe valor salvo, usa. Senão, usa média.
            const saved = (s.mealTargets && s.mealTargets[i]) ? s.mealTargets[i] : null;
            
            // CORREÇÃO CRÍTICA DE INTERPOLAÇÃO E VALORES PADRÃO (NaN FIX)
            const valKcal = saved ? saved.kcal : (count > 0 ? Math.round(totalKcal / count) : 0);
            const valP = saved ? saved.p : (count > 0 ? Math.round(totalP / count) : 0);
            const valC = saved ? saved.c : (count > 0 ? Math.round(totalC / count) : 0);

            const row = document.createElement('div');
            row.style.cssText = "background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.1);";
            // Inputs com step="0.1" e interpolação segura
            row.innerHTML = `
                <div style="font-size:0.8rem; color:#aaa; margin-bottom:5px; font-weight:bold;">Refeição ${i+1}</div>
                <div style="display:flex; gap:5px;">
                    <input type="number" id="mt-kcal-${i}" class="gym-form-input" value="${valKcal}" placeholder="Kcal" style="padding:8px; font-size:0.9rem;" step="0.1">
                    <input type="number" id="mt-p-${i}" class="gym-form-input" value="${valP}" placeholder="Prot" style="padding:8px; font-size:0.9rem;" step="0.1">
                    <input type="number" id="mt-c-${i}" class="gym-form-input" value="${valC}" placeholder="Carb" style="padding:8px; font-size:0.9rem;" step="0.1">
                </div>
            `;
            container.appendChild(row);
        }
    },

    saveSettings: function(forceSave = false, isPunishment = false) {
        const d = window.GlobalApp.data.diet;
        const s = d.settings;

        // Se for forceSave (vinda do botão de pesar), não lê inputs de texto, apenas lógica
        if (!forceSave) {
            s.phase = document.getElementById('diet-phase').value;
            s.weights.start = parseFloat(document.getElementById('diet-weight-start').value);
            // newWeight é lido abaixo
            s.weights.goal = parseFloat(document.getElementById('diet-weight-goal').value);
            s.mealsCount = parseInt(document.getElementById('diet-meals-count').value);

            s.targets.kcal = parseFloat(document.getElementById('diet-target-kcal').value);
            s.targets.p = parseFloat(document.getElementById('diet-target-prot').value);
            s.targets.c = parseFloat(document.getElementById('diet-target-carb').value);

            const weighSelect = document.getElementById('diet-weigh-day');
            if (weighSelect) {
                s.weighInDay = parseInt(weighSelect.value);
            }

            // Salvar Metas Individuais
            if (!s.mealTargets) s.mealTargets = {};
            for (let i = 0; i < s.mealsCount; i++) {
                s.mealTargets[i] = {
                    kcal: parseFloat(document.getElementById(`mt-kcal-${i}`).value) || 0,
                    p: parseFloat(document.getElementById(`mt-p-${i}`).value) || 0,
                    c: parseFloat(document.getElementById(`mt-c-${i}`).value) || 0
                };
            }
        }

        const oldWeight = s.weights.current;
        // Tenta pegar do input se não for forceSave, ou pega do input de qualquer jeito
        // (No caso do registro direto, o valor já foi injetado no input hidden/modal antes)
        const newWeight = parseFloat(document.getElementById('diet-weight-current').value);
        s.weights.current = newWeight;

        // SINCRONIA COM GYM
        if (window.GlobalApp.data.gym && window.GlobalApp.data.gym.settings) {
            window.GlobalApp.data.gym.settings.currentPhase = s.phase;
        }

        // === BIO-REACTOR: PESAGEM SEMANAL ===
        if (oldWeight !== newWeight || forceSave) {
            // Atualiza data da última pesagem
            d.lastWeighInDate = window.GlobalApp.getGameDate();

            // Se for punição, desbloqueia XP mas não dá pontos
            if (isPunishment) {
                 if (window.GlobalApp.data.xp) window.GlobalApp.data.xp.blocked = false;
                 alert("Peso registrado. XP Desbloqueado! (Sem ganho de XP por atraso)");
            } else {
                // Cálculo Normal de XP
                const level = this.getUserLevel();
                
                // NOVA LÓGICA V6.1: Ganho de Pesagem = Level * 10 (Igual alimentos, mas + Bônus)
                // Usaremos o sistema antigo de tabela para calcular um multiplicador de precisão, mas a base é Level * 100 * 0.1
                
                const baseXP = Math.ceil(level * 10); // 10% do Nível*100 simplificado
                
                const phaseMult = this.getPhaseMultiplier();
                const delta = newWeight - oldWeight;
                const isCut = s.phase === 'cut';
                const targetDelta = isCut ? -0.25 : 0.25; 
                
                const dist = Math.abs(delta - targetDelta);
                let tablePct = 0;

                if (dist <= 0.1) tablePct = 1.0; 
                else if (dist <= 0.2) tablePct = 0.7; 
                else if (dist <= 0.3) tablePct = 0.3; 
                else tablePct = 0.1; // Mínimo por pesar

                let streakIncrement = 0;
                // Atualiza Streak Semana
                if (tablePct >= 0.3) {
                    streakIncrement = 1;
                    d.streaks.week = (d.streaks.week || 0) + 1;
                } else {
                    d.streaks.week = 0;
                }

                const streakMult = 1 + (d.streaks.week * 0.1);
                
                const finalXP = Math.round(baseXP * phaseMult * tablePct * streakMult);
                
                const todayStr = window.GlobalApp.getGameDate();

                let receipt = null;
                if (finalXP > 0) {
                     receipt = {
                        title: "Pesagem Semanal",
                        total: finalXP,
                        sections: [
                            { title: "[1] CÁLCULO", rows: [{label:`Base (Level*10)`, value:baseXP}, {label:`Tabela (${(tablePct*100).toFixed(0)}%)`, value:`x ${tablePct}`}] },
                            { title: "[2] MULTIPLICADORES", rows: [{label:`Streak Semanal (${d.streaks.week})`, value:`x ${streakMult.toFixed(1)}`}] }
                        ]
                    };
                }

                const historyItem = {
                    id: Date.now(),
                    type: 'weigh',
                    xp: finalXP,
                    streakIncrement: streakIncrement,
                    date: todayStr,
                    receipt: receipt
                };
                d.xpHistory.push(historyItem);

                if (finalXP > 0 && receipt) {
                    if (window.XPManager) {
                        window.XPManager.gainXP(finalXP, 'Pesagem', { type: 'diet', receipt: receipt });
                    }
                    alert(`Pesagem Registrada! +${finalXP} XP`);
                }
            }
        }

        window.GlobalApp.saveData();
        this.render();
        document.getElementById('modal-diet-settings').classList.add('hidden');
    },

    // =========================================================================
    // BANCO DE ALIMENTOS (CRUD COM EDIÇÃO)
    // =========================================================================

    openFoodDb: function() {
        this.editingFoodIndex = null;
        this.resetFoodForm();
        this.renderFoodDbList();
        document.getElementById('modal-diet-food-db').classList.remove('hidden');
    },

    renderFoodDbList: function() {
        const container = document.getElementById('diet-foods-list');
        const list = window.GlobalApp.data.diet.foodDb;
        container.innerHTML = '';

        list.forEach((f, idx) => {
            const div = document.createElement('div');
            div.className = 'diet-food-db-item';
            div.innerHTML = `
                <div>
                    <span class="db-food-name">${f.name}</span>
                    <div class="db-food-macros">
                        <span class="kcal-val">${f.kcal}kcal</span>
                        <span class="p-val">P:${f.p}</span>
                        <span class="c-val">C:${f.c}</span>
                    </div>
                </div>
                <div class="db-item-actions">
                    <button class="btn-edit-db-item" onclick="event.stopPropagation(); window.DietManager.editFoodFromDb(${idx})">✏️</button>
                    <button class="btn-delete-db-item" onclick="event.stopPropagation(); window.DietManager.deleteFoodFromDb(${idx})">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    addFoodToDb: function() {
        const name = document.getElementById('new-food-name').value;
        const kcal = parseFloat(document.getElementById('new-food-kcal').value);
        const p = parseFloat(document.getElementById('new-food-p').value);
        const c = parseFloat(document.getElementById('new-food-c').value);

        if (!name || isNaN(kcal)) { alert('Preencha nome e calorias!'); return; }

        const newItem = {
            id: 'f_' + Date.now(),
            name, kcal, p, c
        };

        if (this.editingFoodIndex !== null) {
            // Update
            window.GlobalApp.data.diet.foodDb[this.editingFoodIndex] = newItem;
            this.editingFoodIndex = null;
            // Reset visual do botão para Adicionar
            const btn = document.querySelector('#form-diet-add-food button[type="submit"]');
            if(btn) btn.textContent = "+ Adicionar";
        } else {
            // Create
            window.GlobalApp.data.diet.foodDb.push(newItem);
            
            // NOVO: Ganho de XP por adicionar novo alimento (10% do Nível * 100 = Level * 10)
            const level = this.getUserLevel();
            const xpGain = Math.ceil(level * 10);
            
            if (window.XPManager) {
                window.XPManager.gainXP(xpGain, `Novo Alimento: ${name}`, { type: 'diet' });
            }
        }

        window.GlobalApp.saveData();
        this.resetFoodForm();
        this.renderFoodDbList();
    },

    editFoodFromDb: function(idx) {
        const food = window.GlobalApp.data.diet.foodDb[idx];
        if (!food) return;

        document.getElementById('new-food-name').value = food.name;
        document.getElementById('new-food-kcal').value = food.kcal;
        document.getElementById('new-food-p').value = food.p;
        document.getElementById('new-food-c').value = food.c;

        this.editingFoodIndex = idx;
        
        // Altera texto do botão
        const btn = document.querySelector('#form-diet-add-food button[type="submit"]');
        if(btn) btn.textContent = "💾 Salvar Edição";
    },

    deleteFoodFromDb: function(idx) {
        if (confirm('Apagar este alimento?')) {
            window.GlobalApp.data.diet.foodDb.splice(idx, 1);
            window.GlobalApp.saveData();
            
            // Se estava editando este item, cancela
            if (this.editingFoodIndex === idx) {
                this.editingFoodIndex = null;
                this.resetFoodForm();
            }
            
            this.renderFoodDbList();
        }
    },

    resetFoodForm: function() {
        document.getElementById('new-food-name').value = '';
        document.getElementById('new-food-kcal').value = '';
        document.getElementById('new-food-p').value = '';
        document.getElementById('new-food-c').value = '';
        
        const btn = document.querySelector('#form-diet-add-food button[type="submit"]');
        if(btn) btn.textContent = "+ Adicionar";
    },

    // =========================================================================
    // LOG (REGISTRO DE REFEIÇÕES)
    // =========================================================================

    openLogModal: function(mealIndex) {
        this.currentLogMealIndex = mealIndex;
        
        const select = document.getElementById('log-food-select');
        select.innerHTML = '';
        
        const db = window.GlobalApp.data.diet.foodDb;
        db.forEach((f, idx) => {
            const opt = document.createElement('option');
            opt.value = idx; // Usamos o index do array
            opt.textContent = f.name;
            select.appendChild(opt);
        });

        document.getElementById('log-food-grams').value = 100;
        this.updateLogPreview();
        
        document.getElementById('modal-diet-log').classList.remove('hidden');
    },

    updateLogPreview: function() {
        const dbIdx = document.getElementById('log-food-select').value;
        const grams = parseFloat(document.getElementById('log-food-grams').value) || 0;
        
        const food = window.GlobalApp.data.diet.foodDb[dbIdx];
        if (!food) return;

        const ratio = grams / 100;
        const k = Math.round(food.kcal * ratio);
        const p = Math.round(food.p * ratio);
        const c = Math.round(food.c * ratio);

        document.getElementById('log-preview').innerHTML = 
            `Prévia (${grams}g): <strong>${k} Kcal</strong> | P: ${p}g | C: ${c}g`;
    },

    saveFoodLog: function() {
        const dbIdx = document.getElementById('log-food-select').value;
        const grams = parseFloat(document.getElementById('log-food-grams').value) || 0;
        const mealIndex = this.currentLogMealIndex;

        if (grams <= 0) return;

        const baseFood = window.GlobalApp.data.diet.foodDb[dbIdx];
        const ratio = grams / 100;

        // Cria o registro calculado
        const entry = {
            id: baseFood.id,
            name: baseFood.name,
            grams: grams,
            kcal: baseFood.kcal * ratio,
            p: baseFood.p * ratio,
            c: baseFood.c * ratio
            // f (fat) removed
        };

        const todayStr = window.GlobalApp.getGameDate();
        
        if (!window.GlobalApp.data.diet.logs[todayStr]) {
            window.GlobalApp.data.diet.logs[todayStr] = {};
        }
        if (!window.GlobalApp.data.diet.logs[todayStr][mealIndex]) {
            window.GlobalApp.data.diet.logs[todayStr][mealIndex] = [];
        }

        window.GlobalApp.data.diet.logs[todayStr][mealIndex].push(entry);
        
        // REMOVIDO CÁLCULO DE XP IMEDIATO.
        // O XP agora é dado apenas ao clicar em "Registrar Refeição"

        window.GlobalApp.saveData();
        this.render();
        document.getElementById('modal-diet-log').classList.add('hidden');
    },

    removeFoodLog: function(mealIndex, foodIdx) {
        if (confirm('Remover este alimento da refeição?')) {
            const todayStr = window.GlobalApp.getGameDate();
            window.GlobalApp.data.diet.logs[todayStr][mealIndex].splice(foodIdx, 1);
            window.GlobalApp.saveData();
            this.render();
        }
    },

    updateAuditorWithDiet: function() {
        const widget = document.getElementById('xp-audit-widget');
        if (!widget) return;

        const d = window.GlobalApp.data.diet;
        const history = d.xpHistory || [];
        const todayStr = window.GlobalApp.getGameDate();

        // Filter today's logs
        const todayLogs = history.filter(h => h.date === todayStr);
        const totalXP = todayLogs.reduce((acc, curr) => acc + (curr.xp || 0), 0);

        // Get latest log for receipt
        const latestLog = todayLogs.length > 0 ? todayLogs[todayLogs.length - 1] : null;

        let dietRow = widget.querySelector('.audit-row.diet-info');
        if (!dietRow) {
            dietRow = document.createElement('div');
            dietRow.className = 'audit-row diet-info';
            dietRow.style.flexDirection = 'column';
            widget.appendChild(dietRow);
        }

        if (totalXP > 0) {
            dietRow.style.display = 'flex';
            let html = `<div style="display:flex; justify-content:space-between; width:100%; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:5px;"><span>🍎 Dieta Hoje:</span> <span style="color:var(--grad-kcal)">+${totalXP} XP</span></div>`;

            if (latestLog && latestLog.receipt) {
                 const r = latestLog.receipt;
                 html += `<div class="diet-receipt-box">`;
                 html += `<div style="text-align:center; font-weight:bold; margin-bottom:5px; border-bottom:1px dashed #555; padding-bottom:3px;">🧾 NOTA FISCAL: ${r.title}</div>`;
                 if (r.sections) {
                     r.sections.forEach(sec => {
                         html += `<div style="margin-top:4px; color:#888; font-size:0.65rem; border-bottom:1px dotted #444;">${sec.title}</div>`;
                         if (sec.rows) {
                             sec.rows.forEach(row => {
                                 html += `<div style="display:flex; justify-content:space-between;"><span>• ${row.label}</span> <span>${row.value}</span></div>`;
                             });
                         }
                     });
                 }
                 html += `<div style="margin-top:5px; border-top:1px dashed #555; padding-top:3px; display:flex; justify-content:space-between; font-weight:bold; color:#a8e063;"><span>TOTAL:</span> <span>${r.total} XP</span></div>`;
                 html += `</div>`;
            }

            dietRow.innerHTML = html;
        } else {
            dietRow.style.display = 'none';
        }
    }
};

window.DietManager.init();
