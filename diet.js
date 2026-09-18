/**
 * DIET.JS
 * Gerenciador de Nutrição, Banco de Alimentos e Controle de Peso.
 * VERSÃO: V7.0 - LEAN EDITION (SEM XP)
 * Alterações: Removida toda a gamificação — cálculo de XP, streaks de precisão
 * (refeição/dia/semana), bloqueio de XP por pesagem atrasada, e o histórico de
 * XP com "Nota Fiscal". "Registrar Refeição" agora apenas marca a refeição como
 * concluída (sem pontuação) e "Fechar o Dia" apenas arquiva o resumo do dia,
 * permitindo começar o dia seguinte do zero.
 * Mantido: peso (início/atual/meta), metas de macro (totais e por refeição),
 * fase (cut/main/bulk, informativa), pesagem semanal (lembrete simples, sem
 * bloqueio), banco de alimentos (CRUD com edição), registro de refeições e água.
 */

window.DietManager = {
    
    // Estado Interno temporário
    currentLogMealIndex: null,
    editingFoodIndex: null,
    expandedFoodCategories: {}, // { "Frutas": true, ... } — controla árvore aberta/fechada
    logSelectedFoodIdx: null, // índice do foodDb selecionado no modal de registro de refeição
    logPickerExpandedCategories: {}, // árvore de seleção do modal de registro (independente da do banco)
    
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
                phase: 'main', // cut, bulk, main (informativo)
                weights: { start: 70, current: 70, goal: 70 },
                targets: { kcal: 2000, p: 150, c: 200 },
                mealsCount: 4,
                mealTargets: {}, // Metas individuais por refeição
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

        if (!d.diet.lastWeighInDate) {
            d.diet.lastWeighInDate = null;
        }

        // Banco de Alimentos Padrão (Exemplos)
        if (!d.diet.foodDb || !Array.isArray(d.diet.foodDb)) {
            d.diet.foodDb = [
                { id: 'f1', name: 'Arroz Branco (Cozido)', kcal: 130, p: 2.7, c: 28, category: 'Carboidratos' },
                { id: 'f2', name: 'Peito de Frango (Grelhado)', kcal: 165, p: 31, c: 0, category: 'Proteínas' },
                { id: 'f3', name: 'Ovo Inteiro (Cozido)', kcal: 155, p: 13, c: 1.1, category: 'Proteínas' },
                { id: 'f4', name: 'Banana Prata', kcal: 98, p: 1.3, c: 26, category: 'Frutas' },
                { id: 'f5', name: 'Aveia em Flocos', kcal: 368, p: 14, c: 60, category: 'Carboidratos' },
                { id: 'f6', name: 'Whey Protein (Padrão)', kcal: 400, p: 80, c: 10, category: 'Suplementos' } // ~100g de pó
            ];
        }

        // Migração: garante categoria em alimentos já existentes
        if (d.diet.foodDb && Array.isArray(d.diet.foodDb)) {
            d.diet.foodDb.forEach(f => {
                if (!f.category || typeof f.category !== 'string' || !f.category.trim()) {
                    f.category = 'Sem Categoria';
                }
            });
        }

        // Categorias criadas manualmente (podem existir sem nenhum alimento ainda)
        if (!d.diet.foodCategories || !Array.isArray(d.diet.foodCategories)) {
            d.diet.foodCategories = [];
        }

        // Logs de Refeições: { "DD/MM/AAAA": { 0: [...foods], 1: [...foods] } }
        if (!d.diet.logs) {
            d.diet.logs = {};
        }

        // Histórico de dias fechados (arquivo simples, sem XP)
        if (!d.diet.dayHistory) {
            d.diet.dayHistory = [];
        }
    },

    bindEvents: function() {
        // Botões de Abertura de Modal
        const btnSettings = document.getElementById('btn-diet-settings');
        if (btnSettings) btnSettings.onclick = () => this.openSettings();

        const btnFoodDb = document.getElementById('btn-diet-food-db');
        if (btnFoodDb) btnFoodDb.onclick = () => this.openFoodDb();

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

        const btnNewCategory = document.getElementById('btn-new-food-category');
        if (btnNewCategory) btnNewCategory.onclick = () => this.createCategoryOnly();

        const formLog = document.getElementById('form-diet-log');
        if (formLog) {
            document.getElementById('log-food-grams').oninput = () => this.updateLogPreview();

            formLog.onsubmit = (e) => {
                e.preventDefault();
                this.saveFoodLog();
            };
            document.getElementById('btn-cancel-diet-log').onclick = () => {
                document.getElementById('modal-diet-log').classList.add('hidden');
            };
        }

        const btnOpenLogPicker = document.getElementById('btn-open-log-food-picker');
        if (btnOpenLogPicker) btnOpenLogPicker.onclick = () => this.openLogFoodPicker();

        const btnCloseLogPicker = document.getElementById('btn-close-log-food-picker');
        if (btnCloseLogPicker) btnCloseLogPicker.onclick = () => {
            document.getElementById('modal-diet-log-picker').classList.add('hidden');
        };

        // Fechar Histórico
        const btnCloseHistory = document.getElementById('btn-close-diet-history');
        if (btnCloseHistory) {
            btnCloseHistory.onclick = () => {
                document.getElementById('modal-diet-history').classList.add('hidden');
            };
        }
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

        // 1.5. Verifica lembrete de pesagem (sem bloqueio)
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
            });
        }

        // 3. Renderiza Resumo de Macros (com botão Fechar Dia / Reabrir Dia)
        const isClosed = todayLog.closed === true;
        this.renderDailySummary(total, settings.targets, isClosed);

        // 4. Renderiza Lista de Refeições
        this.renderMealsList(settings, todayLog, isClosed);

        // 5. Sincroniza Água (Legacy Support)
        if (window.DietManagerLegacy && window.DietManagerLegacy.updateWaterDisplay) {
            window.DietManagerLegacy.updateWaterDisplay();
        }
    },

    // --- Lógica de Pesagem (Lembrete simples, sem bloqueio) ---
    checkWeighInStatus: function() {
        const d = window.GlobalApp.data;
        const s = d.diet.settings;
        const weighDay = s.weighInDay; // 0-6 (Dom-Sab)
        const gameDateStr = window.GlobalApp.getGameDate();
        const todayParts = gameDateStr.split('-');
        const today = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
        const currentDay = today.getDay(); // 0-6
        const lastWeighStr = d.diet.lastWeighInDate; // "YYYY-MM-DD"

        // Encontra a data da última ocorrência do dia de pesagem (alvo)
        let diff = currentDay - weighDay;
        if (diff < 0) diff += 7;
        
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - diff);
        const targetDateStr = window.GlobalApp.formatDate(targetDate);

        // Se já pesamos na data alvo ou depois, está ok.
        let status = "OK";
        
        if (lastWeighStr && lastWeighStr >= targetDateStr) {
            status = "DONE";
        } else {
            if (diff === 0) status = "DUE"; // É hoje
            else if (diff === 1) status = "LATE_1"; // 1 dia atrasado
            else if (diff >= 2) status = "LATE_2"; // Mais atrasado
        }

        // Renderiza Botão de Lembrete no Gráfico
        const container = document.getElementById('diet-weight-chart');
        if (!container) return;

        // Remove botão anterior se existir
        const oldBtn = document.getElementById('btn-diet-weigh-action');
        if (oldBtn) oldBtn.remove();

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
                btn.textContent = "⚖️ REGISTRE SEU PESO HOJE";
            } else {
                btn.className = "btn-weigh-pulse-red";
                btn.textContent = "⚠️ PESAGEM ATRASADA — REGISTRE AGORA";
            }
            btn.onclick = () => this.registerWeighInAction();
            
            container.appendChild(btn);
        }
    },

    registerWeighInAction: async function() {
        const d = window.GlobalApp.data.diet;
        const s = d.settings;
        const currentW = s.weights.current;
        
        const newValStr = await prompt("Registre seu peso atual (kg):", currentW);
        if (!newValStr) return;

        const newVal = parseFloat(newValStr.replace(',', '.'));
        if (isNaN(newVal) || newVal <= 0) {
            alert("Valor inválido.");
            return;
        }

        // Atualização Direta de Dados
        s.weights.current = newVal;
        
        // Atualiza Input do Modal se existir (Sincronia visual caso o usuário abra depois)
        const inputEl = document.getElementById('diet-weight-current');
        if (inputEl) inputEl.value = newVal;

        // Atualiza Data da Última Pesagem
        d.lastWeighInDate = window.GlobalApp.getGameDate();

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

    renderDailySummary: function(total, target, isClosed) {
        const container = document.getElementById('diet-daily-summary');
        if (!container) return;

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

        let actionBtnHtml;
        if (isClosed) {
            actionBtnHtml = `
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:15px; padding:12px; border-radius:12px; background:rgba(255,255,255,0.05); color:var(--diet-text-sub); font-weight:bold; text-transform:uppercase; font-size:0.85rem;">
                    🔒 Dia Fechado
                </div>
                <button onclick="window.DietManager.reopenDay()" 
                        style="width:100%; margin-top:8px; background:transparent; border:1px solid var(--diet-border); padding:10px; border-radius:12px; font-weight:bold; color:var(--diet-text-sub); text-transform:uppercase; font-size:0.8rem; cursor:pointer;">
                    🔓 Reabrir Dia
                </button>
            `;
        } else {
            actionBtnHtml = `
                <button onclick="window.DietManager.closeDay()" 
                        style="width:100%; margin-top:15px; background:var(--grad-kcal); border:none; padding:12px; border-radius:12px; font-weight:bold; color:#000; text-transform:uppercase; cursor:pointer; box-shadow:0 4px 15px rgba(86,171,47,0.4);">
                    ✅ FECHAR DIA
                </button>
            `;
        }

        container.innerHTML = `
            ${mkBar('kcal', 'Kcal', total.kcal, target.kcal, '⚡')}
            ${mkBar('prot', 'Prot', total.p, target.p, 'P')}
            ${mkBar('carb', 'Carb', total.c, target.c, 'C')}
            ${actionBtnHtml}
        `;
    },

    renderMealsList: function(settings, todayLog, isClosed) {
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

                // Botão de remover só aparece se não estiver registrado nem o dia fechado
                const removeBtn = (isRegistered || isClosed)
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
            
            if (isClosed) {
                actionButtons = `
                    <div style="padding:15px; text-align:center; background:rgba(255,255,255,0.03); border-top:1px solid var(--diet-border); color:var(--diet-text-sub); font-weight:bold; font-size:0.8rem; text-transform:uppercase;">
                        🔒 Dia Encerrado
                    </div>
                `;
            } else if (isRegistered) {
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
    // AÇÕES PRINCIPAIS (SEM GAMIFICAÇÃO)
    // =========================================================================

    // Marca a refeição como concluída (sem pontuação)
    registerMeal: function(mealIndex) {
        const d = window.GlobalApp.data.diet;
        const todayStr = window.GlobalApp.getGameDate();
        
        // Garante estrutura
        if (!d.logs[todayStr]) d.logs[todayStr] = {};
        if (d.logs[todayStr].closed) {
            alert("O dia já foi fechado. Reabra o dia para editar os registros.");
            return;
        }
        if (!d.logs[todayStr].mealStatus) d.logs[todayStr].mealStatus = {};
        
        // Verificação dupla
        if (d.logs[todayStr].mealStatus[mealIndex]) {
            alert("Esta refeição já foi registrada!");
            return;
        }

        const foods = d.logs[todayStr][mealIndex] || [];
        if (foods.length === 0) return;

        // Marca como registrada
        d.logs[todayStr].mealStatus[mealIndex] = true;

        window.GlobalApp.saveData();
        this.render();
    },

    // Arquiva o resumo do dia e trava novos registros
    closeDay: async function() {
        if (!await confirm("Tem certeza que deseja fechar o dia? Isso arquivará o resumo de hoje e travará novos registros.")) return;

        const d = window.GlobalApp.data.diet;
        const settings = d.settings;
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = d.logs[todayStr] || {};

        // Calcula Total do Dia (para o arquivo de histórico)
        let total = { kcal: 0, p: 0, c: 0 };
        for (let key in todayLog) {
            if (Array.isArray(todayLog[key])) {
                todayLog[key].forEach(f => {
                    total.kcal += f.kcal;
                    total.p += f.p;
                    total.c += f.c;
                });
            }
        }

        // Arquiva no histórico de dias (somente leitura, sem XP)
        if (!d.dayHistory) d.dayHistory = [];
        d.dayHistory.push({
            date: todayStr,
            totalKcal: Math.round(total.kcal),
            totalP: Math.round(total.p),
            totalC: Math.round(total.c),
            targetKcal: settings.targets.kcal
        });

        // Marca o dia como fechado (preserva os alimentos registrados, só trava edição)
        todayLog.closed = true;
        d.logs[todayStr] = todayLog;

        window.GlobalApp.saveData();
        alert("Dia fechado e arquivado no histórico.");
        this.render();
    },

    // Reabre o dia fechado: remove o resumo correspondente do histórico e destrava edição
    reopenDay: async function() {
        if (!await confirm("Reabrir o dia? Isso removerá o resumo de hoje do histórico até você fechar novamente.")) return;

        const d = window.GlobalApp.data.diet;
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = d.logs[todayStr];
        if (!todayLog || !todayLog.closed) return;

        // Remove a última entrada do histórico correspondente a hoje
        if (d.dayHistory && d.dayHistory.length > 0) {
            const lastIdx = d.dayHistory.length - 1;
            if (d.dayHistory[lastIdx].date === todayStr) {
                d.dayHistory.splice(lastIdx, 1);
            }
        }

        // Destrava o dia
        todayLog.closed = false;

        window.GlobalApp.saveData();
        this.render();
    },


    // =========================================================================
    // HISTÓRICO (SOMENTE LEITURA)
    // =========================================================================

    openHistory: function() {
        this.renderHistory();
        document.getElementById('modal-diet-history').classList.remove('hidden');
    },

    renderHistory: function() {
        const list = window.GlobalApp.data.diet.dayHistory || [];
        const container = document.getElementById('diet-history-list');
        container.innerHTML = '';

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;">Sem histórico recente.</div>';
            return;
        }

        // Renderiza reverso (mais novo primeiro)
        [...list].reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = 'diet-history-item';
            div.innerHTML = `
                <div class="history-info">
                    <div class="history-icon">📅</div>
                    <div class="history-details">
                        <span class="history-title">${item.date}</span>
                        <span class="history-detail" style="font-size:0.7rem; color:#aaa;">${item.totalKcal} / ${item.targetKcal} kcal • P:${item.totalP} C:${item.totalC}</span>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    },

    // =========================================================================
    // CONFIGURAÇÕES (PESAGEM SEMANAL SEM XP)
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
            
            const valKcal = saved ? saved.kcal : (count > 0 ? Math.round(totalKcal / count) : 0);
            const valP = saved ? saved.p : (count > 0 ? Math.round(totalP / count) : 0);
            const valC = saved ? saved.c : (count > 0 ? Math.round(totalC / count) : 0);

            const row = document.createElement('div');
            row.style.cssText = "background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.1);";
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

    saveSettings: function() {
        const d = window.GlobalApp.data.diet;
        const s = d.settings;

        s.phase = document.getElementById('diet-phase').value;
        s.weights.start = parseFloat(document.getElementById('diet-weight-start').value);
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

        const newWeight = parseFloat(document.getElementById('diet-weight-current').value);
        const oldWeight = s.weights.current;
        s.weights.current = newWeight;

        // SINCRONIA COM GYM (fase é só anotação em ambos os módulos)
        if (window.GlobalApp.data.gym && window.GlobalApp.data.gym.settings) {
            window.GlobalApp.data.gym.settings.currentPhase = s.phase;
        }

        // Atualiza data da última pesagem se o peso mudou
        if (oldWeight !== newWeight) {
            d.lastWeighInDate = window.GlobalApp.getGameDate();
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
        this.renderFoodCategoryOptions();
        document.getElementById('modal-diet-food-db').classList.remove('hidden');
    },

    // Constrói uma árvore de categorias aninhada a partir de caminhos "Pai/Filho/Neto".
    // Cada nó: { name, path, children: {nome: nó}, items: [{food, idx}] }
    _buildCategoryTree: function() {
        const list = window.GlobalApp.data.diet.foodDb;
        const manualCats = window.GlobalApp.data.diet.foodCategories || [];

        const root = { name: '', path: '', children: {}, items: [] };

        const ensurePath = (pathParts) => {
            let node = root;
            let acc = '';
            pathParts.forEach(part => {
                acc = acc ? `${acc}/${part}` : part;
                if (!node.children[part]) {
                    node.children[part] = { name: part, path: acc, children: {}, items: [] };
                }
                node = node.children[part];
            });
            return node;
        };

        // Categorias criadas manualmente (podem estar vazias)
        manualCats.forEach(catPath => {
            const parts = catPath.split('/').map(p => p.trim()).filter(Boolean);
            if (parts.length) ensurePath(parts);
        });

        // Alimentos: "Sem Categoria" fica sempre na raiz
        list.forEach((f, idx) => {
            const raw = (f.category && f.category.trim()) || 'Sem Categoria';
            if (raw === 'Sem Categoria') {
                root.items.push({ food: f, idx });
                return;
            }
            const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
            const node = ensurePath(parts.length ? parts : ['Sem Categoria']);
            node.items.push({ food: f, idx });
        });

        return root;
    },

    // Conta recursivamente quantos alimentos existem num nó (incluindo subcategorias)
    _countNodeItems: function(node) {
        let count = node.items.length;
        Object.values(node.children).forEach(child => {
            count += this._countNodeItems(child);
        });
        return count;
    },

    // Lista de caminhos completos de categoria existentes (com ou sem alimentos), ordenada
    _getAllCategoryNames: function() {
        const root = this._buildCategoryTree();
        const names = [];
        const walk = (node) => {
            Object.values(node.children)
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                .forEach(child => {
                    names.push(child.path);
                    walk(child);
                });
        };
        walk(root);
        return names;
    },

    renderFoodCategoryOptions: function() {
        const datalist = document.getElementById('diet-food-category-options');
        if (!datalist) return;
        datalist.innerHTML = this._getAllCategoryNames()
            .map(cat => `<option value="${cat}"></option>`)
            .join('');
    },

    createCategoryOnly: async function() {
        const raw = await prompt('Nome da categoria (use "Pai/Filho" para criar uma subcategoria):', '');
        const name = raw?.trim();
        if (!name) return;

        const parts = name.split('/').map(p => p.trim()).filter(Boolean);
        if (!parts.length) return;
        const fullPath = parts.join('/');

        const exists = this._getAllCategoryNames().some(c => c.toLowerCase() === fullPath.toLowerCase());
        if (exists) { alert('Essa categoria já existe.'); return; }

        const d = window.GlobalApp.data.diet;
        d.foodCategories.push(fullPath);
        this.expandedFoodCategories[fullPath] = true;
        // Expande também os pais no caminho, para a nova categoria já aparecer visível
        let acc = '';
        parts.slice(0, -1).forEach(part => {
            acc = acc ? `${acc}/${part}` : part;
            this.expandedFoodCategories[acc] = true;
        });

        window.GlobalApp.saveData();
        this.renderFoodDbList();
        this.renderFoodCategoryOptions();
    },

    // Troca o prefixo `oldPath` por `newPath` numa string de categoria, se ela for
    // exatamente oldPath ou começar com "oldPath/" (ou seja, for uma subcategoria dele).
    _remapCategoryPath: function(catValue, oldPath, newPath) {
        if (catValue === oldPath) return newPath;
        if (catValue.startsWith(oldPath + '/')) {
            return newPath + catValue.slice(oldPath.length);
        }
        return catValue;
    },

    renameCategory: async function(path) {
        const currentName = path.split('/').pop();
        const raw = await prompt(`Novo nome para "${currentName}":`, currentName);
        const newName = raw?.trim();
        if (!newName || newName === currentName) return;

        const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        const exists = this._getAllCategoryNames().some(c => c.toLowerCase() === newPath.toLowerCase());
        if (exists) { alert('Já existe uma categoria com esse nome nesse mesmo nível.'); return; }

        const d = window.GlobalApp.data.diet;

        // Atualiza a lista manual de categorias (o próprio path e todos os descendentes)
        d.foodCategories = d.foodCategories.map(c => this._remapCategoryPath(c, path, newPath));

        // Atualiza a categoria de cada alimento afetado (o próprio path e descendentes)
        d.foodDb.forEach(f => {
            if (f.category) {
                f.category = this._remapCategoryPath(f.category, path, newPath);
            }
        });

        // Migra o estado de expansão para o novo path
        if (this.expandedFoodCategories[path] !== undefined) {
            this.expandedFoodCategories[newPath] = this.expandedFoodCategories[path];
            delete this.expandedFoodCategories[path];
        }

        window.GlobalApp.saveData();
        this.renderFoodDbList();
        this.renderFoodCategoryOptions();
    },

    deleteCategory: async function(path) {
        const d = window.GlobalApp.data.diet;
        const affectedCount = d.foodDb.filter(f => {
            const cat = f.category || '';
            return cat === path || cat.startsWith(path + '/');
        }).length;

        const msg = affectedCount > 0
            ? `Apagar a categoria "${path}"?\n\n${affectedCount} alimento(s) desta categoria (e subcategorias) serão movidos para "Sem Categoria". Os alimentos NÃO serão apagados.`
            : `Apagar a categoria "${path}"?`;

        if (!(await confirm(msg))) return;

        // Remove o path e todos os descendentes da lista manual de categorias
        d.foodCategories = d.foodCategories.filter(c => c !== path && !c.startsWith(path + '/'));

        // Move os alimentos afetados para "Sem Categoria" (não apaga nenhum alimento)
        d.foodDb.forEach(f => {
            const cat = f.category || '';
            if (cat === path || cat.startsWith(path + '/')) {
                f.category = 'Sem Categoria';
            }
        });

        delete this.expandedFoodCategories[path];

        window.GlobalApp.saveData();
        this.renderFoodDbList();
        this.renderFoodCategoryOptions();
    },

    // Renderiza recursivamente um nível da árvore de categorias dentro de um container.
    // depth controla a indentação visual; showCategoryActions exibe os botões de
    // renomear/apagar categoria (usado só no Banco de Alimentos, não no seletor do log).
    _renderCategoryNode: function(node, container, depth, expandedState, onToggle, onPick, showCategoryActions) {
        const sortedChildren = Object.values(node.children)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        sortedChildren.forEach(child => {
            const isExpanded = !!expandedState[child.path];
            const totalCount = this._countNodeItems(child);

            const catDiv = document.createElement('div');
            catDiv.className = 'diet-food-category' + (isExpanded ? ' expanded' : '');
            catDiv.style.setProperty('--diet-cat-depth', depth);

            const header = document.createElement('div');
            header.className = 'diet-food-category-header';
            header.style.paddingLeft = (12 + depth * 18) + 'px';

            const pathJs = child.path.replace(/'/g, "\\'");
            const actionsHtml = showCategoryActions ? `
                <div class="db-item-actions diet-category-actions">
                    <button class="btn-edit-db-item" onclick="event.stopPropagation(); window.DietManager.renameCategory('${pathJs}')">✏️</button>
                    <button class="btn-delete-db-item" onclick="event.stopPropagation(); window.DietManager.deleteCategory('${pathJs}')">🗑️</button>
                </div>
            ` : '';

            header.innerHTML = `
                <span class="diet-food-category-arrow">▶</span>
                <span class="diet-food-category-name">${child.name}</span>
                <span class="diet-food-category-count">${totalCount}</span>
                ${actionsHtml}
            `;
            header.onclick = () => onToggle(child.path);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'diet-food-category-items';

            // Subcategorias primeiro (recursão), depois alimentos diretos deste nível
            this._renderCategoryNode(child, itemsDiv, depth + 1, expandedState, onToggle, onPick, showCategoryActions);

            child.items.forEach(({ food: f, idx }) => {
                itemsDiv.appendChild(onPick.renderItem(f, idx, depth + 1));
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });

        // "Sem Categoria" e alimentos soltos na raiz aparecem por último, só no nível raiz
        // (não tem botões de editar/apagar — é uma categoria implícita, não removível)
        if (depth === 0 && node.items.length) {
            const isExpanded = !!expandedState['Sem Categoria'];
            const catDiv = document.createElement('div');
            catDiv.className = 'diet-food-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'diet-food-category-header';
            header.style.paddingLeft = '12px';
            header.innerHTML = `
                <span class="diet-food-category-arrow">▶</span>
                <span class="diet-food-category-name">Sem Categoria</span>
                <span class="diet-food-category-count">${node.items.length}</span>
            `;
            header.onclick = () => onToggle('Sem Categoria');
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'diet-food-category-items';
            node.items.forEach(({ food: f, idx }) => {
                itemsDiv.appendChild(onPick.renderItem(f, idx, 1));
            });
            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        }
    },

    renderFoodDbList: function() {
        const container = document.getElementById('diet-foods-list');
        container.innerHTML = '';
        const root = this._buildCategoryTree();

        this._renderCategoryNode(root, container, 0, this.expandedFoodCategories,
            (path) => this.toggleFoodCategory(path),
            {
                renderItem: (f, idx, depth) => {
                    const div = document.createElement('div');
                    div.className = 'diet-food-db-item';
                    div.style.paddingLeft = (12 + depth * 18) + 'px';
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
                    return div;
                }
            },
            true // showCategoryActions: no Banco de Alimentos, categorias são editáveis
        );
    },

    toggleFoodCategory: function(path) {
        this.expandedFoodCategories[path] = !this.expandedFoodCategories[path];
        this.renderFoodDbList();
    },

    addFoodToDb: function() {
        const category = document.getElementById('new-food-category').value.trim() || 'Sem Categoria';
        const name = document.getElementById('new-food-name').value;
        const kcal = parseFloat(document.getElementById('new-food-kcal').value);
        const p = parseFloat(document.getElementById('new-food-p').value);
        const c = parseFloat(document.getElementById('new-food-c').value);

        if (!name || isNaN(kcal)) { alert('Preencha nome e calorias!'); return; }

        const newItem = {
            id: 'f_' + Date.now(),
            name, kcal, p, c, category
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
        }

        // Registra a categoria (e seus pais no caminho) na lista manual, caso seja nova
        if (category !== 'Sem Categoria') {
            const d = window.GlobalApp.data.diet;
            const parts = category.split('/').map(p => p.trim()).filter(Boolean);
            let acc = '';
            parts.forEach(part => {
                acc = acc ? `${acc}/${part}` : part;
                const exists = d.foodCategories.some(c => c.toLowerCase() === acc.toLowerCase());
                if (!exists) d.foodCategories.push(acc);
                this.expandedFoodCategories[acc] = true;
            });
        }

        window.GlobalApp.saveData();
        this.resetFoodForm();
        this.renderFoodDbList();
        this.renderFoodCategoryOptions();
    },

    editFoodFromDb: function(idx) {
        const food = window.GlobalApp.data.diet.foodDb[idx];
        if (!food) return;

        document.getElementById('new-food-category').value = (food.category && food.category !== 'Sem Categoria') ? food.category : '';
        document.getElementById('new-food-name').value = food.name;
        document.getElementById('new-food-kcal').value = food.kcal;
        document.getElementById('new-food-p').value = food.p;
        document.getElementById('new-food-c').value = food.c;

        this.editingFoodIndex = idx;
        
        // Altera texto do botão
        const btn = document.querySelector('#form-diet-add-food button[type="submit"]');
        if(btn) btn.textContent = "💾 Salvar Edição";
    },

    deleteFoodFromDb: async function(idx) {
        if (await confirm('Apagar este alimento?')) {
            window.GlobalApp.data.diet.foodDb.splice(idx, 1);
            window.GlobalApp.saveData();
            
            // Se estava editando este item, cancela
            if (this.editingFoodIndex === idx) {
                this.editingFoodIndex = null;
                this.resetFoodForm();
            }
            
            this.renderFoodDbList();
            this.renderFoodCategoryOptions();
        }
    },

    resetFoodForm: function() {
        document.getElementById('new-food-category').value = '';
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
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = window.GlobalApp.data.diet.logs[todayStr];
        if (todayLog && todayLog.closed) {
            alert("O dia já foi fechado. Reabra o dia para editar os registros.");
            return;
        }

        this.currentLogMealIndex = mealIndex;
        this.logSelectedFoodIdx = null;

        this.renderLogSelectedFood();
        document.getElementById('log-food-grams').value = 100;
        this.updateLogPreview();
        
        document.getElementById('modal-diet-log').classList.remove('hidden');
    },

    // Abre a tela fullscreen (mesma árvore de categorias do Banco de Alimentos)
    // para escolher qual alimento será registrado na refeição.
    openLogFoodPicker: function() {
        this.renderLogFoodPickerTree();
        document.getElementById('modal-diet-log-picker').classList.remove('hidden');
    },

    renderLogFoodPickerTree: function() {
        const container = document.getElementById('log-food-picker-list');
        container.innerHTML = '';
        const root = this._buildCategoryTree();

        this._renderCategoryNode(root, container, 0, this.logPickerExpandedCategories,
            (path) => this.toggleLogPickerCategory(path),
            {
                renderItem: (f, idx, depth) => {
                    const div = document.createElement('div');
                    div.className = 'diet-food-db-item diet-food-db-item-pickable';
                    div.style.paddingLeft = (12 + depth * 18) + 'px';
                    div.innerHTML = `
                        <div>
                            <span class="db-food-name">${f.name}</span>
                            <div class="db-food-macros">
                                <span class="kcal-val">${f.kcal}kcal</span>
                                <span class="p-val">P:${f.p}</span>
                                <span class="c-val">C:${f.c}</span>
                            </div>
                        </div>
                    `;
                    div.onclick = () => this.selectFoodForLog(idx);
                    return div;
                }
            },
            false // showCategoryActions: no seletor de log não faz sentido editar categorias
        );
    },

    toggleLogPickerCategory: function(path) {
        this.logPickerExpandedCategories[path] = !this.logPickerExpandedCategories[path];
        this.renderLogFoodPickerTree();
    },

    selectFoodForLog: function(idx) {
        this.logSelectedFoodIdx = idx;
        this.renderLogSelectedFood();
        this.updateLogPreview();
        document.getElementById('modal-diet-log-picker').classList.add('hidden');
    },

    renderLogSelectedFood: function() {
        const el = document.getElementById('log-selected-food-name');
        if (!el) return;
        const food = window.GlobalApp.data.diet.foodDb[this.logSelectedFoodIdx];
        el.textContent = food ? food.name : 'Nenhum alimento selecionado';
    },

    updateLogPreview: function() {
        const grams = parseFloat(document.getElementById('log-food-grams').value) || 0;
        
        const food = window.GlobalApp.data.diet.foodDb[this.logSelectedFoodIdx];
        if (!food) {
            document.getElementById('log-preview').innerHTML = 'Selecione um alimento para ver a prévia.';
            return;
        }

        const ratio = grams / 100;
        const k = Math.round(food.kcal * ratio);
        const p = Math.round(food.p * ratio);
        const c = Math.round(food.c * ratio);

        document.getElementById('log-preview').innerHTML = 
            `Prévia (${grams}g): <strong>${k} Kcal</strong> | P: ${p}g | C: ${c}g`;
    },

    saveFoodLog: function() {
        const dbIdx = this.logSelectedFoodIdx;
        const grams = parseFloat(document.getElementById('log-food-grams').value) || 0;
        const mealIndex = this.currentLogMealIndex;

        const baseFood = window.GlobalApp.data.diet.foodDb[dbIdx];
        if (!baseFood) { alert('Selecione um alimento!'); return; }
        if (grams <= 0) return;

        const ratio = grams / 100;

        // Cria o registro calculado
        const entry = {
            id: baseFood.id,
            name: baseFood.name,
            grams: grams,
            kcal: baseFood.kcal * ratio,
            p: baseFood.p * ratio,
            c: baseFood.c * ratio
        };

        const todayStr = window.GlobalApp.getGameDate();
        
        if (!window.GlobalApp.data.diet.logs[todayStr]) {
            window.GlobalApp.data.diet.logs[todayStr] = {};
        }
        if (!window.GlobalApp.data.diet.logs[todayStr][mealIndex]) {
            window.GlobalApp.data.diet.logs[todayStr][mealIndex] = [];
        }

        window.GlobalApp.data.diet.logs[todayStr][mealIndex].push(entry);

        window.GlobalApp.saveData();
        this.render();
        this.logSelectedFoodIdx = null;
        document.getElementById('modal-diet-log').classList.add('hidden');
    },

    removeFoodLog: async function(mealIndex, foodIdx) {
        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = window.GlobalApp.data.diet.logs[todayStr];
        if (todayLog && todayLog.closed) {
            alert("O dia já foi fechado. Reabra o dia para editar os registros.");
            return;
        }

        if (await confirm('Remover este alimento da refeição?')) {
            window.GlobalApp.data.diet.logs[todayStr][mealIndex].splice(foodIdx, 1);
            window.GlobalApp.saveData();
            this.render();
        }
    }
};

window.DietManager.init();
