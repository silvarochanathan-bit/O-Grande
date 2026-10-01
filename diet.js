/**
 * DIET.JS
 * Gerenciador de Nutrição, Banco de Alimentos e Controle de Peso.
 * VERSÃO: V7.2 - PACKS DE REFEIÇÃO (RECONSTRUÍDO)
 * Alterações: Reconstruída do zero a funcionalidade de "Packs de Refeição"
 * (Meus Packs), cujo JS havia sido perdido numa versão anterior (o HTML/CSS
 * de suporte já existiam, mas sem nenhuma lógica). Um pack é uma lista
 * nomeada de alimentos (do banco de alimentos) com gramas padrão cada,
 * salva em d.diet.packs. Fluxos adicionados:
 *  - CRUD de packs (criar, editar nome/itens, apagar) em modal-diet-packs,
 *    adicionando itens via modal-diet-pack-item-picker (mesma árvore de
 *    categorias do banco de alimentos).
 *  - Usar um pack ao registrar uma refeição: botão "Usar Pack de Refeição"
 *    no modal de registro abre modal-diet-log-pack-picker (lista de packs)
 *    -> modal-diet-pack-adjust (ajustar gramas de cada item ou usar padrão)
 *    -> lança todos os itens do pack de uma vez no diário do dia.
 * Nada do que já existia foi removido ou alterado: evolução semanal/mensal
 * de peso e macros (V7.1), barras de progresso, lembrete de pesagem, banco
 * de alimentos, registro manual de refeições, fechamento de dia e histórico
 * seguem exatamente como estavam.
 * Histórico anterior V7.1: Adicionado histórico datado de pesagens
 * (d.diet.weighIns) e a seção de Evolução Semanal/Mensal (peso + macros).
 * Histórico anterior V7.0: LEAN EDITION (SEM XP) — gamificação removida.
 */

window.DietManager = {

    // Estado Interno temporário
    currentLogMealIndex: null,
    editingFoodIndex: null,
    expandedFoodCategories: {}, // { "Frutas": true, ... } — controla árvore aberta/fechada
    logSelectedFoodIdx: null, // índice do foodDb selecionado no modal de registro de refeição
    logPickerExpandedCategories: {}, // árvore de seleção do modal de registro (independente da do banco)
    _weightEvoPeriodType: 'week', // V7.1: período ativo no modal de Evolução Semanal/Mensal

    // V7.2: Estado dos Packs de Refeição
    editingPackId: null, // id do pack em edição no form (null = criando novo)
    packFormItems: [], // itens do pack em edição: [{ foodId, grams }]
    packItemPickerExpandedCategories: {},
    logPackPickerSelectedPackId: null, // pack selecionado no fluxo de registro de refeição
    expandedPackCategories: {}, // não usado (packs não têm categoria), reservado

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

        // V7.1: Histórico datado de pesagens, para a Evolução Semanal/Mensal.
        // Não é possível reconstruir pesagens anteriores a esta versão (não
        // eram datadas), então o histórico começa a partir de agora.
        if (!d.diet.weighIns || !Array.isArray(d.diet.weighIns)) {
            d.diet.weighIns = [];
        }

        // V7.2: Packs de Refeição — { id, name, items: [{ foodId, grams }] }
        if (!d.diet.packs || !Array.isArray(d.diet.packs)) {
            d.diet.packs = [];
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

        // V7.1: Botão de Evolução Semanal/Mensal (Peso + Macros)
        const btnWeightEvo = document.getElementById('btn-diet-weight-evolution');
        if (btnWeightEvo) btnWeightEvo.onclick = () => this.openWeightEvolution();

        const btnCloseWeightEvo = document.getElementById('btn-close-diet-weight-evolution');
        if (btnCloseWeightEvo) {
            btnCloseWeightEvo.onclick = () => {
                document.getElementById('modal-diet-weight-evolution').classList.add('hidden');
            };
        }

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

        // V7.2: Packs de Refeição
        const btnMealPacks = document.getElementById('btn-diet-meal-packs');
        if (btnMealPacks) btnMealPacks.onclick = () => this.openMealPacks();

        const btnCloseMealPacks = document.getElementById('btn-close-meal-packs');
        if (btnCloseMealPacks) btnCloseMealPacks.onclick = () => {
            document.getElementById('modal-diet-packs').classList.add('hidden');
        };

        const btnNewPack = document.getElementById('btn-new-pack');
        if (btnNewPack) btnNewPack.onclick = () => this.openPackForm(null);

        const btnCancelPackEdit = document.getElementById('btn-cancel-pack-edit');
        if (btnCancelPackEdit) btnCancelPackEdit.onclick = () => this.closePackForm();

        const formPack = document.getElementById('form-diet-pack');
        if (formPack) {
            formPack.onsubmit = (e) => {
                e.preventDefault();
                this.savePack();
            };
        }

        const btnOpenPackItemPicker = document.getElementById('btn-open-pack-item-picker');
        if (btnOpenPackItemPicker) btnOpenPackItemPicker.onclick = () => this.openPackItemPicker();

        const btnClosePackItemPicker = document.getElementById('btn-close-pack-item-picker');
        if (btnClosePackItemPicker) btnClosePackItemPicker.onclick = () => {
            document.getElementById('modal-diet-pack-item-picker').classList.add('hidden');
        };

        const btnOpenLogPackPicker = document.getElementById('btn-open-log-pack-picker');
        if (btnOpenLogPackPicker) btnOpenLogPackPicker.onclick = () => this.openLogPackPicker();

        const btnCloseLogPackPicker = document.getElementById('btn-close-log-pack-picker');
        if (btnCloseLogPackPicker) btnCloseLogPackPicker.onclick = () => {
            document.getElementById('modal-diet-log-pack-picker').classList.add('hidden');
        };

        const btnCancelPackAdjust = document.getElementById('btn-cancel-pack-adjust');
        if (btnCancelPackAdjust) btnCancelPackAdjust.onclick = () => {
            document.getElementById('modal-diet-pack-adjust').classList.add('hidden');
        };

        const btnUseDefaultPack = document.getElementById('btn-use-default-pack');
        if (btnUseDefaultPack) btnUseDefaultPack.onclick = () => this.applyPackToMeal(false);

        const btnUseAdjustedPack = document.getElementById('btn-use-adjusted-pack');
        if (btnUseAdjustedPack) btnUseAdjustedPack.onclick = () => this.applyPackToMeal(true);

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
        const todayStr = window.GlobalApp.getGameDate();
        d.lastWeighInDate = todayStr;

        // V7.1: Registra no histórico datado de pesagens (alimenta a Evolução Semanal/Mensal)
        if (!d.weighIns || !Array.isArray(d.weighIns)) d.weighIns = [];
        d.weighIns.push({ date: todayStr, weight: newVal });

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
    // V7.1: EVOLUÇÃO SEMANAL / MENSAL (PESO + MACROS) — NOVO, ADITIVO
    // Não substitui o gráfico de barras de peso nem as barras diárias de
    // macro acima; é uma visão extra, aberta por um botão próprio.
    // =========================================================================

    // Converte uma data "YYYY-MM-DD" (formato usado em todo o app) em timestamp
    _dateStrToTs: function(dateStr) {
        const parts = dateStr.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    },

    // Chave do início da semana (Segunda-feira) que contém o timestamp
    _evoGetWeekStartKey: function(timestamp) {
        const d = new Date(timestamp);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay(); // 0=Dom..6=Sáb
        const diffToMonday = (day === 0 ? -6 : 1 - day);
        d.setDate(d.getDate() + diffToMonday);
        return d.getTime();
    },

    // Chave do mês (ano*100 + mês) que contém o timestamp
    _evoGetMonthKey: function(timestamp) {
        const d = new Date(timestamp);
        return d.getFullYear() * 100 + (d.getMonth() + 1);
    },

    // Monta a lista unificada de períodos (semana ou mês), cada um com:
    // - peso: último valor registrado no período (variação líquida vs. período anterior)
    // - kcal/p/c: soma de todos os dias fechados (dayHistory) dentro do período
    // Peso e macros podem ter históricos de tamanhos diferentes (nem toda
    // semana tem pesagem, nem todo dia é fechado) — por isso a união das
    // chaves de período, preenchendo com "—" o que não houver dado.
    getWeightMacroEvolution: function(periodType) {
        if (!window.GlobalApp || !window.GlobalApp.data || !window.GlobalApp.data.diet) return [];

        const d = window.GlobalApp.data.diet;
        const s = d.settings;
        const weighIns = d.weighIns || [];
        const dayHistory = d.dayHistory || [];

        if (weighIns.length === 0 && dayHistory.length === 0) return [];

        const keyFn = periodType === 'month'
            ? (ts) => this._evoGetMonthKey(ts)
            : (ts) => this._evoGetWeekStartKey(ts);

        // Peso: fica com o valor da pesagem mais recente dentro de cada período
        const weightBuckets = {}; // key -> { ts, weight }
        weighIns.forEach(w => {
            const ts = this._dateStrToTs(w.date);
            const key = keyFn(ts);
            if (!weightBuckets[key] || ts >= weightBuckets[key].ts) {
                weightBuckets[key] = { ts, weight: parseFloat(w.weight) };
            }
        });

        // Macros: soma de todos os dias fechados dentro de cada período
        const macroBuckets = {}; // key -> { sumKcal, sumP, sumC, startTs }
        dayHistory.forEach(h => {
            const ts = this._dateStrToTs(h.date);
            const key = keyFn(ts);
            if (!macroBuckets[key]) {
                macroBuckets[key] = { sumKcal: 0, sumP: 0, sumC: 0, startTs: ts };
            }
            const b = macroBuckets[key];
            b.sumKcal += h.totalKcal;
            b.sumP += h.totalP;
            b.sumC += h.totalC;
            if (ts < b.startTs) b.startTs = ts;
        });

        // União das chaves de período, em ordem cronológica
        const allKeysSet = new Set([
            ...Object.keys(weightBuckets),
            ...Object.keys(macroBuckets)
        ]);
        let keysArr = Array.from(allKeysSet).map(Number).sort((a, b) => a - b);

        if (keysArr.length === 0) return [];
        if (keysArr.length > 12) keysArr = keysArr.slice(keysArr.length - 12);

        // Direção da meta do usuário: só importa se ele quer SUBIR ou DESCER o peso
        const startWeight = parseFloat(s.weights.start) || 0;
        const goalWeight = parseFloat(s.weights.goal) || 0;
        const higherIsBad = goalWeight < startWeight; // meta é emagrecer -> subir é ruim

        let lastKnownWeight = null;

        return keysArr.map(key => {
            const wb = weightBuckets[key];
            const mb = macroBuckets[key];

            const weight = wb ? wb.weight : null;
            let weightDelta = null;
            if (weight !== null && lastKnownWeight !== null) {
                weightDelta = weight - lastKnownWeight;
            }
            if (weight !== null) lastKnownWeight = weight;

            return {
                key,
                startTs: wb ? wb.ts : (mb ? mb.startTs : null),
                weight,
                weightDelta,
                higherIsBad,
                kcal: mb ? Math.round(mb.sumKcal) : null,
                p: mb ? Math.round(mb.sumP) : null,
                c: mb ? Math.round(mb.sumC) : null
            };
        });
    },

    openWeightEvolution: function() {
        this._weightEvoPeriodType = 'week';
        document.querySelectorAll('#diet-weight-evo-period-tabs button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === 'week');
        });
        this.renderWeightEvoSection('week');
        document.getElementById('modal-diet-weight-evolution').classList.remove('hidden');
    },

    setWeightEvoPeriod: function(period) {
        this._weightEvoPeriodType = period;
        document.querySelectorAll('#diet-weight-evo-period-tabs button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        this.renderWeightEvoSection(period);
    },

    renderWeightEvoSection: function(period) {
        const chartContainer = document.getElementById('diet-weight-evo-chart');
        const listContainer = document.getElementById('diet-weight-evo-list');
        if (!chartContainer || !listContainer) return;

        const groups = this.getWeightMacroEvolution(period);

        if (groups.length < 2) {
            chartContainer.innerHTML = `<div class="diet-evo-empty">Dados insuficientes para montar a evolução. Continue registrando sua pesagem e fechando seus dias para ver o gráfico aqui.</div>`;
            listContainer.innerHTML = '';
            return;
        }

        const periodLabelPrefix = period === 'month' ? 'Mês ' : 'Sem ';
        chartContainer.innerHTML = this._buildWeightEvoChartSVG(groups);
        listContainer.innerHTML = this._buildWeightEvoMilestonesList(groups, periodLabelPrefix);
    },

    // Gráfico SVG: linha tracejada = peso inicial do período exibido (referência);
    // linha sólida = evolução real do peso. Só usa os períodos em que há peso
    // registrado (para não quebrar a linha por causa de semanas sem pesagem).
    _buildWeightEvoChartSVG: function(groups) {
        const weightPoints = groups.filter(g => g.weight !== null);
        if (weightPoints.length < 2) {
            return `<div class="diet-evo-empty">Registre ao menos duas pesagens em períodos diferentes para ver o gráfico.</div>`;
        }

        const width = 400, height = 170;
        const padding = { top: 15, right: 15, bottom: 28, left: 15 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const values = weightPoints.map(g => g.weight);
        const baseline = weightPoints[0].weight;
        let minV = Math.min(...values, baseline);
        let maxV = Math.max(...values, baseline);
        if (minV === maxV) { minV -= 1; maxV += 1; }
        const range = (maxV - minV) * 1.15 || 1;
        const mid = (maxV + minV) / 2;
        const lo = mid - range / 2;
        const hi = mid + range / 2;

        const xFor = (i) => padding.left + (weightPoints.length === 1 ? chartW / 2 : (i / (weightPoints.length - 1)) * chartW);
        const yFor = (v) => padding.top + chartH - ((v - lo) / (hi - lo)) * chartH;

        const baselineY = yFor(baseline);

        let gridLines = '';
        for (let i = 0; i <= 2; i++) {
            const y = padding.top + (chartH / 2) * i;
            gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="diet-evo-grid-line" />`;
        }

        const trendPoints = weightPoints.map((g, i) => `${xFor(i)},${yFor(g.weight)}`).join(' ');

        let dots = '';
        weightPoints.forEach((g, i) => {
            const isLast = i === weightPoints.length - 1;
            dots += `<circle cx="${xFor(i)}" cy="${yFor(g.weight)}" r="${isLast ? 5 : 3.5}" class="diet-evo-dot${isLast ? ' is-last' : ''}" />`;
        });

        let xLabels = '';
        weightPoints.forEach((g, i) => {
            const label = i === weightPoints.length - 1 ? 'Agora' : (i === 0 ? 'Início' : (i + 1));
            xLabels += `<text x="${xFor(i)}" y="${height - 8}" class="diet-evo-axis-text" text-anchor="middle">${label}</text>`;
        });

        return `
            <svg viewBox="0 0 ${width} ${height}" class="diet-evo-svg">
                ${gridLines}
                <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" class="diet-evo-baseline-line" />
                <polyline points="${trendPoints}" class="diet-evo-trend-line" />
                ${dots}
                ${xLabels}
            </svg>
            <div class="diet-evo-legend">
                <div class="diet-evo-legend-item"><span class="diet-evo-swatch baseline"></span> Peso Inicial (${baseline.toFixed(1)}kg)</div>
                <div class="diet-evo-legend-item"><span class="diet-evo-swatch trend"></span> Peso Real</div>
            </div>
        `;
    },

    // Lista de marcos: uma linha por período, com peso+variação (cor conforme
    // a meta do usuário) e os três macros somados (cor fixa de cada macro,
    // igual ao resto do app — nunca varia por ter subido ou descido).
    _buildWeightEvoMilestonesList: function(groups, periodLabelPrefix) {
        let rows = '';

        groups.forEach((g, i) => {
            const isCurrent = i === groups.length - 1;
            const label = isCurrent ? 'Atual' : (periodLabelPrefix + (i + 1));

            let weightHtml = '<span class="diet-evo-value diet-evo-value-empty">—</span>';
            if (g.weight !== null) {
                let deltaHtml = '';
                if (g.weightDelta !== null) {
                    const isNeutral = Math.abs(g.weightDelta) < 0.05;
                    const isGood = g.higherIsBad ? g.weightDelta < 0 : g.weightDelta > 0;
                    const deltaClass = isNeutral ? 'null' : (isGood ? 'positive' : 'negative');
                    const sign = g.weightDelta > 0 ? '+' : '';
                    deltaHtml = `<span class="diet-evo-delta ${deltaClass}">${sign}${g.weightDelta.toFixed(1)}kg</span>`;
                }
                weightHtml = `<span class="diet-evo-value">${g.weight.toFixed(1)}kg</span>${deltaHtml}`;
            }

            const kcalHtml = g.kcal !== null
                ? `<span class="diet-evo-macro-val kcal-val">${g.kcal}<small>kcal</small></span>`
                : '<span class="diet-evo-macro-val diet-evo-value-empty">—</span>';
            const pHtml = g.p !== null
                ? `<span class="diet-evo-macro-val p-val">P:${g.p}</span>`
                : '<span class="diet-evo-macro-val diet-evo-value-empty">—</span>';
            const cHtml = g.c !== null
                ? `<span class="diet-evo-macro-val c-val">C:${g.c}</span>`
                : '<span class="diet-evo-macro-val diet-evo-value-empty">—</span>';

            rows += `
                <div class="diet-evo-row${isCurrent ? ' is-current' : ''}">
                    <span class="diet-evo-date">${label}</span>
                    <div class="diet-evo-weight-col">${weightHtml}</div>
                    <div class="diet-evo-macros-col">
                        ${kcalHtml}
                        ${pHtml}
                        ${cHtml}
                    </div>
                </div>
            `;
        });

        return `<div class="diet-evo-list">${rows}</div>`;
    },

    // =========================================================================
    // V7.2: PACKS DE REFEIÇÃO (CRUD + USO AO REGISTRAR REFEIÇÃO)
    // =========================================================================

    // --- Tela "Meus Packs" (modal-diet-packs): lista de packs + form ---

    openMealPacks: function() {
        this.closePackForm();
        this.renderPacksList();
        document.getElementById('modal-diet-packs').classList.remove('hidden');
    },

    renderPacksList: function() {
        const container = document.getElementById('diet-packs-list');
        if (!container) return;

        const packs = window.GlobalApp.data.diet.packs || [];
        container.innerHTML = '';

        if (packs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px 15px; color:var(--diet-text-sub); font-size:0.85rem;">Nenhum pack criado ainda. Toque em "+ Novo Pack" para montar o primeiro.</div>';
            return;
        }

        packs.forEach(pack => {
            const itemCount = (pack.items || []).length;
            const div = document.createElement('div');
            div.className = 'diet-food-db-item';
            div.style.paddingLeft = '14px';
            div.innerHTML = `
                <div>
                    <span class="db-food-name">🍱 ${pack.name}</span>
                    <div class="db-food-macros"><span>${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span></div>
                </div>
                <div class="db-item-actions">
                    <button class="btn-edit-db-item" title="Editar Pack" onclick="event.stopPropagation(); window.DietManager.openPackForm('${pack.id}')">✏️</button>
                    <button class="btn-delete-db-item" title="Apagar Pack" onclick="event.stopPropagation(); window.DietManager.deletePack('${pack.id}')">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    openPackForm: function(packId) {
        this.editingPackId = packId;

        if (packId) {
            const pack = (window.GlobalApp.data.diet.packs || []).find(p => p.id === packId);
            if (!pack) return;
            document.getElementById('new-pack-name').value = pack.name;
            this.packFormItems = (pack.items || []).map(it => ({ foodId: it.foodId, grams: it.grams }));
        } else {
            document.getElementById('new-pack-name').value = '';
            this.packFormItems = [];
        }

        const btn = document.querySelector('#form-diet-pack button[type="submit"]');
        if (btn) btn.textContent = packId ? '💾 Salvar Edição' : '+ Salvar Pack';

        this.renderPackFormItemsList();

        const section = document.getElementById('diet-pack-form-section');
        if (section) section.classList.remove('hidden');
    },

    closePackForm: function() {
        this.editingPackId = null;
        this.packFormItems = [];
        const section = document.getElementById('diet-pack-form-section');
        if (section) section.classList.add('hidden');
        const form = document.getElementById('form-diet-pack');
        if (form) form.reset();
    },

    // Renderiza a lista de itens já adicionados ao pack em edição, com input
    // de gramas editável e botão de remover.
    renderPackFormItemsList: function() {
        const container = document.getElementById('pack-form-items-list');
        if (!container) return;

        const foodDb = window.GlobalApp.data.diet.foodDb || [];
        container.innerHTML = '';

        if (this.packFormItems.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:12px; color:var(--diet-text-sub); font-size:0.8rem;">Nenhum alimento adicionado ainda.</div>';
            return;
        }

        this.packFormItems.forEach((item, idx) => {
            const food = foodDb.find(f => f.id === item.foodId);
            const name = food ? food.name : 'Alimento removido';

            const row = document.createElement('div');
            row.className = 'diet-pack-form-item';
            row.innerHTML = `
                <span class="diet-pack-form-item-name">${name}</span>
                <input type="number" class="gym-form-input diet-pack-form-item-grams" value="${item.grams}" min="0" step="0.1"
                       onchange="window.DietManager.updatePackFormItemGrams(${idx}, this.value)">
                <span class="diet-pack-form-item-unit">g</span>
                <button type="button" class="btn-delete-db-item" title="Remover" onclick="window.DietManager.removePackFormItem(${idx})">✕</button>
            `;
            container.appendChild(row);
        });
    },

    updatePackFormItemGrams: function(idx, value) {
        const grams = parseFloat(value) || 0;
        if (this.packFormItems[idx]) this.packFormItems[idx].grams = grams;
    },

    removePackFormItem: function(idx) {
        this.packFormItems.splice(idx, 1);
        this.renderPackFormItemsList();
    },

    savePack: function() {
        const name = document.getElementById('new-pack-name').value.trim();
        if (!name) { alert('Dê um nome ao pack!'); return; }
        if (this.packFormItems.length === 0) { alert('Adicione ao menos um alimento ao pack!'); return; }

        const d = window.GlobalApp.data.diet;

        if (this.editingPackId) {
            const pack = d.packs.find(p => p.id === this.editingPackId);
            if (pack) {
                pack.name = name;
                pack.items = this.packFormItems.map(it => ({ foodId: it.foodId, grams: it.grams }));
            }
        } else {
            d.packs.push({
                id: 'pack_' + Date.now(),
                name,
                items: this.packFormItems.map(it => ({ foodId: it.foodId, grams: it.grams }))
            });
        }

        window.GlobalApp.saveData();
        this.closePackForm();
        this.renderPacksList();
    },

    deletePack: async function(packId) {
        if (!await confirm('Apagar este pack? Isso não remove os alimentos já registrados anteriormente com ele.')) return;

        const d = window.GlobalApp.data.diet;
        d.packs = d.packs.filter(p => p.id !== packId);

        if (this.editingPackId === packId) this.closePackForm();

        window.GlobalApp.saveData();
        this.renderPacksList();
    },

    // --- Picker de alimento para adicionar ao pack em edição ---
    // Reaproveita a mesma árvore de categorias do banco de alimentos.

    openPackItemPicker: function() {
        this.renderPackItemPickerTree();
        document.getElementById('modal-diet-pack-item-picker').classList.remove('hidden');
    },

    renderPackItemPickerTree: function() {
        const container = document.getElementById('pack-item-picker-list');
        if (!container) return;

        const groups = this._groupFoodsByCategory();
        container.innerHTML = '';

        const categoryNames = Object.keys(groups).sort((a, b) => {
            if (a === 'Sem Categoria') return 1;
            if (b === 'Sem Categoria') return -1;
            return a.localeCompare(b, 'pt-BR');
        });

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = !!this.packItemPickerExpandedCategories[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'diet-food-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'diet-food-category-header';
            header.innerHTML = `
                <span class="diet-food-category-arrow">▶</span>
                <span class="diet-food-category-name">${cat}</span>
                <span class="diet-food-category-count">${items.length}</span>
            `;
            header.onclick = () => this.togglePackItemPickerCategory(cat);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'diet-food-category-items';

            items.forEach(({ food: f, idx }) => {
                const div = document.createElement('div');
                div.className = 'diet-food-db-item diet-food-db-item-pickable';
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
                div.onclick = () => this.addFoodToPackForm(f.id);
                itemsDiv.appendChild(div);
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    togglePackItemPickerCategory: function(cat) {
        this.packItemPickerExpandedCategories[cat] = !this.packItemPickerExpandedCategories[cat];
        this.renderPackItemPickerTree();
    },

    addFoodToPackForm: function(foodId) {
        // Evita duplicar o mesmo alimento no pack — se já existir, só fecha o picker
        const already = this.packFormItems.some(it => it.foodId === foodId);
        if (!already) {
            this.packFormItems.push({ foodId, grams: 100 });
        }
        this.renderPackFormItemsList();
        document.getElementById('modal-diet-pack-item-picker').classList.add('hidden');
    },

    // --- Usar um Pack ao registrar uma refeição ---
    // Fluxo: modal-diet-log (botão "Usar Pack de Refeição") -> escolher pack
    // (modal-diet-log-pack-picker) -> ajustar gramas (modal-diet-pack-adjust)
    // -> lança todos os itens do pack de uma vez na refeição alvo.

    openLogPackPicker: function() {
        this.renderLogPackPickerList();
        document.getElementById('modal-diet-log-pack-picker').classList.remove('hidden');
    },

    renderLogPackPickerList: function() {
        const container = document.getElementById('log-pack-picker-list');
        if (!container) return;

        const packs = window.GlobalApp.data.diet.packs || [];
        container.innerHTML = '';

        if (packs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px 15px; color:var(--diet-text-sub); font-size:0.85rem;">Nenhum pack criado ainda. Crie um em "🍱 Meus Packs".</div>';
            return;
        }

        packs.forEach(pack => {
            const itemCount = (pack.items || []).length;
            const div = document.createElement('div');
            div.className = 'diet-food-db-item diet-food-db-item-pickable';
            div.innerHTML = `
                <div>
                    <span class="db-food-name">🍱 ${pack.name}</span>
                    <div class="db-food-macros"><span>${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span></div>
                </div>
            `;
            div.onclick = () => this.selectPackForLog(pack.id);
            container.appendChild(div);
        });
    },

    selectPackForLog: function(packId) {
        this.logPackPickerSelectedPackId = packId;
        document.getElementById('modal-diet-log-pack-picker').classList.add('hidden');
        this.openPackAdjust(packId);
    },

    openPackAdjust: function(packId) {
        const pack = (window.GlobalApp.data.diet.packs || []).find(p => p.id === packId);
        if (!pack) return;

        const title = document.getElementById('pack-adjust-title');
        if (title) title.textContent = `Ajustar: ${pack.name}`;

        // Cópia de trabalho das gramas (editável sem alterar o pack salvo)
        this._packAdjustWorkingItems = (pack.items || []).map(it => ({ foodId: it.foodId, grams: it.grams }));

        this.renderPackAdjustItemsList();
        document.getElementById('modal-diet-pack-adjust').classList.remove('hidden');
    },

    renderPackAdjustItemsList: function() {
        const container = document.getElementById('pack-adjust-items-list');
        if (!container) return;

        const foodDb = window.GlobalApp.data.diet.foodDb || [];
        container.innerHTML = '';

        (this._packAdjustWorkingItems || []).forEach((item, idx) => {
            const food = foodDb.find(f => f.id === item.foodId);
            const name = food ? food.name : 'Alimento removido';

            const row = document.createElement('div');
            row.className = 'diet-pack-form-item';
            row.innerHTML = `
                <span class="diet-pack-form-item-name">${name}</span>
                <input type="number" class="gym-form-input diet-pack-form-item-grams" value="${item.grams}" min="0" step="0.1"
                       onchange="window.DietManager.updatePackAdjustItemGrams(${idx}, this.value)">
                <span class="diet-pack-form-item-unit">g</span>
            `;
            container.appendChild(row);
        });
    },

    updatePackAdjustItemGrams: function(idx, value) {
        const grams = parseFloat(value) || 0;
        if (this._packAdjustWorkingItems && this._packAdjustWorkingItems[idx]) {
            this._packAdjustWorkingItems[idx].grams = grams;
        }
    },

    // Lança todos os itens do pack na refeição que estava aberta no modal de
    // registro (this.currentLogMealIndex). useAdjusted=true usa as gramas
    // editadas em tela; false usa as gramas padrão salvas no pack.
    applyPackToMeal: function(useAdjusted) {
        const packId = this.logPackPickerSelectedPackId;
        const pack = (window.GlobalApp.data.diet.packs || []).find(p => p.id === packId);
        if (!pack) return;

        const mealIndex = this.currentLogMealIndex;
        if (mealIndex === null || mealIndex === undefined) {
            alert('Abra o registro de uma refeição antes de usar um pack.');
            return;
        }

        const todayStr = window.GlobalApp.getGameDate();
        const todayLog = window.GlobalApp.data.diet.logs[todayStr];
        if (todayLog && todayLog.closed) {
            alert("O dia já foi fechado. Reabra o dia para editar os registros.");
            return;
        }

        const foodDb = window.GlobalApp.data.diet.foodDb || [];
        const sourceItems = useAdjusted && this._packAdjustWorkingItems
            ? this._packAdjustWorkingItems
            : (pack.items || []);

        if (!window.GlobalApp.data.diet.logs[todayStr]) {
            window.GlobalApp.data.diet.logs[todayStr] = {};
        }
        if (!window.GlobalApp.data.diet.logs[todayStr][mealIndex]) {
            window.GlobalApp.data.diet.logs[todayStr][mealIndex] = [];
        }

        let addedAny = false;
        sourceItems.forEach(item => {
            const baseFood = foodDb.find(f => f.id === item.foodId);
            if (!baseFood) return; // alimento removido do banco depois de salvar o pack
            const grams = parseFloat(item.grams) || 0;
            if (grams <= 0) return;

            const ratio = grams / 100;
            window.GlobalApp.data.diet.logs[todayStr][mealIndex].push({
                id: baseFood.id,
                name: baseFood.name,
                grams: grams,
                kcal: baseFood.kcal * ratio,
                p: baseFood.p * ratio,
                c: baseFood.c * ratio
            });
            addedAny = true;
        });

        if (!addedAny) {
            alert('Nenhum alimento deste pack pôde ser adicionado (podem ter sido removidos do banco de alimentos).');
            return;
        }

        window.GlobalApp.saveData();
        this.render();

        document.getElementById('modal-diet-pack-adjust').classList.add('hidden');
        document.getElementById('modal-diet-log').classList.add('hidden');
        this.logPackPickerSelectedPackId = null;
        this._packAdjustWorkingItems = null;
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
            const todayStr = window.GlobalApp.getGameDate();
            d.lastWeighInDate = todayStr;

            // V7.1: Registra no histórico datado de pesagens (alimenta a Evolução Semanal/Mensal)
            if (!d.weighIns || !Array.isArray(d.weighIns)) d.weighIns = [];
            d.weighIns.push({ date: todayStr, weight: newWeight });
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

    // Agrupa o foodDb por categoria, preservando o índice original de cada item.
    // Inclui também categorias criadas manualmente (sem nenhum alimento ainda).
    _groupFoodsByCategory: function() {
        const list = window.GlobalApp.data.diet.foodDb;
        const manualCats = window.GlobalApp.data.diet.foodCategories || [];
        const groups = {};

        manualCats.forEach(cat => {
            if (!groups[cat]) groups[cat] = [];
        });

        list.forEach((f, idx) => {
            const cat = (f.category && f.category.trim()) || 'Sem Categoria';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ food: f, idx });
        });

        return groups;
    },

    // Lista de nomes de categorias existentes (com ou sem alimentos), ordenada
    _getAllCategoryNames: function() {
        const groups = this._groupFoodsByCategory();
        return Object.keys(groups)
            .filter(cat => cat !== 'Sem Categoria')
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },

    renderFoodCategoryOptions: function() {
        const datalist = document.getElementById('diet-food-category-options');
        if (!datalist) return;
        datalist.innerHTML = this._getAllCategoryNames()
            .map(cat => `<option value="${cat}"></option>`)
            .join('');
    },

    createCategoryOnly: async function() {
        const name = (await prompt('Nome da nova categoria:', ''))?.trim();
        if (!name) return;

        const d = window.GlobalApp.data.diet;
        const exists = this._getAllCategoryNames().some(c => c.toLowerCase() === name.toLowerCase());
        if (exists) { alert('Essa categoria já existe.'); return; }

        d.foodCategories.push(name);
        this.expandedFoodCategories[name] = true;

        window.GlobalApp.saveData();
        this.renderFoodDbList();
        this.renderFoodCategoryOptions();
    },

    renderFoodDbList: function() {
        const container = document.getElementById('diet-foods-list');
        const groups = this._groupFoodsByCategory();
        container.innerHTML = '';

        const categoryNames = Object.keys(groups).sort((a, b) => {
            if (a === 'Sem Categoria') return 1;
            if (b === 'Sem Categoria') return -1;
            return a.localeCompare(b, 'pt-BR');
        });

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = !!this.expandedFoodCategories[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'diet-food-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'diet-food-category-header';
            header.innerHTML = `
                <span class="diet-food-category-arrow">▶</span>
                <span class="diet-food-category-name">${cat}</span>
                <span class="diet-food-category-count">${items.length}</span>
            `;
            header.onclick = () => this.toggleFoodCategory(cat);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'diet-food-category-items';

            items.forEach(({ food: f, idx }) => {
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
                itemsDiv.appendChild(div);
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    toggleFoodCategory: function(cat) {
        this.expandedFoodCategories[cat] = !this.expandedFoodCategories[cat];
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

        // Registra a categoria na lista manual, caso seja nova
        if (category !== 'Sem Categoria') {
            const d = window.GlobalApp.data.diet;
            const exists = d.foodCategories.some(c => c.toLowerCase() === category.toLowerCase());
            if (!exists) d.foodCategories.push(category);
        }

        // Mantém a categoria aberta para facilitar adição em sequência
        this.expandedFoodCategories[category] = true;

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
        const groups = this._groupFoodsByCategory();
        container.innerHTML = '';

        const categoryNames = Object.keys(groups).sort((a, b) => {
            if (a === 'Sem Categoria') return 1;
            if (b === 'Sem Categoria') return -1;
            return a.localeCompare(b, 'pt-BR');
        });

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = !!this.logPickerExpandedCategories[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'diet-food-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'diet-food-category-header';
            header.innerHTML = `
                <span class="diet-food-category-arrow">▶</span>
                <span class="diet-food-category-name">${cat}</span>
                <span class="diet-food-category-count">${items.length}</span>
            `;
            header.onclick = () => this.toggleLogPickerCategory(cat);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'diet-food-category-items';

            items.forEach(({ food: f, idx }) => {
                const div = document.createElement('div');
                div.className = 'diet-food-db-item diet-food-db-item-pickable';
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
                itemsDiv.appendChild(div);
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    toggleLogPickerCategory: function(cat) {
        this.logPickerExpandedCategories[cat] = !this.logPickerExpandedCategories[cat];
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
