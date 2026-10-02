/**
 * GYM-VIEW.JS
 * Camada de Visualização.
 * VERSÃO: V9.6 - EXERCÍCIOS AGRUPADOS POR CATEGORIA, COLUNA TEMPO MAIS LARGA
 * E EDIÇÃO MANUAL DO CRONÔMETRO COM VOZ
 * Alterações: (1) O modal "Adicionar Exercício" agora agrupa os exercícios
 * por categoria em seções expansíveis (igual ao modal "Evolução por Grupo
 * Muscular"), em vez de uma lista plana A-Z/Recentes — ao buscar por nome,
 * as categorias com resultado abrem automaticamente. (2) A coluna TEMPO dos
 * exercícios de Duração (dur_weight/dur_no_weight), que ficou apertada
 * depois da adição do botão 🔊 ao lado, agora tem mais espaço (nova classe
 * CSS .sets-grid.has-voice-col para dur_weight; .sets-grid.no-weight-col
 * teve sua coluna de tempo alargada). (3) Depois de parar o Cronômetro com
 * Voz manualmente, o valor exibido pode ser tocado para corrigi-lo antes de
 * confirmar com "Usar".
 * V9.5 - CORREÇÃO: "DURAÇÃO SEM PESO" NÃO MOSTRA MAIS COLUNA DE PESO
 * Alterações: Exercícios do tipo dur_no_weight (Duração sem peso — ex.: prancha,
 * alongamento cronometrado) mostravam uma coluna "PESO" na tela de treino, mesmo
 * não fazendo sentido para esse tipo (só rep_no_weight, repetições com peso do
 * corpo, realmente precisa dessa coluna). Agora, para dur_no_weight: a coluna de
 * peso (val1) é totalmente ocultada na grade de séries (TIPO/LAST/TEMPO/REST/✓,
 * 5 colunas em vez de 6 — nova classe CSS .sets-grid.no-weight-col em gym.css),
 * a comparação "LAST" passa a comparar só o tempo (val2) em vez de peso+tempo, e
 * no bloco de Meta/Nota o campo de meta de peso vira um input oculto (mantém o
 * dado salvo, se já havia) em vez de aparecer na tela. rep_no_weight (Repetições
 * com Peso do Corpo) não foi alterado — continua mostrando a coluna PESO
 * normalmente, pois ali ela é usada para peso adicional.
 * V9.4 - EVOLUÇÃO SEMANAL/MENSAL MOVIDA PARA "EVOLUÇÃO POR GRUPO MUSCULAR"
 * A seção de Evolução Semanal/Mensal por exercício, que estava
 * dentro do modal de gráfico individual (showExerciseChart), foi MOVIDA para
 * dentro do modal "Evolução por Grupo Muscular" (modal-gym-evolution), que
 * agora tem um toggle global no topo: "Período Fixo" (comportamento de
 * sempre, comparação início/atual numa janela de dias) vs. "Semanal/Mensal"
 * (nova visão, com sub-toggle Semanal/Mensal, por exercício dentro de cada
 * categoria). O modal de gráfico individual (modal-gym-chart) voltou a ser
 * apenas o gráfico simples de 15 pontos, como era antes da V9.3.
 * Responsável por: Renderização de Treinos, Seletor de Fase (informativo),
 * Interface Híbrida de Corrida.
 * V9.1: Adicionado o botão "+ Adicionar Permanente à Rotina" na tela de treino
 * em andamento, ao lado do "+ Adicionar Exercício ao Treino" — permite incluir
 * um exercício na sessão de hoje E salvá-lo na rotina de uma vez, sem precisar
 * sair do treino em andamento.
 * V9.2: Exercícios do tipo "Duração" (dur_weight / dur_no_weight — prancha,
 * pendurar na barra, etc.) agora mostram um botão "🔊" em cada linha de série,
 * que abre o Cronômetro com Voz (modal-gym-voice-timer): conta regressiva de
 * preparação falada, depois cronômetro progressivo com anúncios por voz em
 * intervalos configuráveis, avisando "Recorde!" ao superar o PR do exercício.
 */

window.GymView = {

    containerId: null,
    activeGymTab: 'gym-routines-section', // Aba padrão (Treinos)
    runTimerInterval: null, // Intervalo local para atualização visual do timer de corrida
    evoExpandedCategories: {}, // Controla quais categorias estão abertas na tela de Evolução
    exercisePickerExpandedCategories: {}, // Controla quais categorias estão abertas no modal "Adicionar Exercício"

    // Estado do modal "Evolução por Grupo Muscular"
    evoMode: 'days', // 'days' (Período Fixo) | 'period' (Semanal/Mensal)
    evoPeriodType: 'week', // 'week' | 'month' — só usado quando evoMode === 'period'

    /**
     * Inicializa a View, vincula ao container e configura navegação interna.
     */
    init: function(containerId) {
        this.containerId = containerId;
        this._setupInternalNav();
        console.log("[GymView] Interface V9.6 (exercícios por categoria, coluna TEMPO ajustada, edição do cronômetro) inicializada.");
    },

    openSetTypeModal: function(currentType, exIndex, setIndex) {
        this.toggleModal('modal-gym-set-type', true);
    },

    /**
     * Configura os botões da barra de navegação interna (Treinos vs Histórico).
     */
    _setupInternalNav: function() {
        const btns = document.querySelectorAll('.gym-nav-btn');
        if (btns.length > 0) {
            btns.forEach(btn => {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-gym-target');
                    this.switchTab(target);
                };
            });
        }
    },

    /**
     * Alterna entre abas e renderiza o conteúdo apropriado.
     */
    switchTab: function(tabId) {
        this.activeGymTab = tabId;

        // Atualiza estado visual dos botões
        document.querySelectorAll('.gym-nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-gym-target') === tabId);
        });

        // Alterna visibilidade das seções
        const sections = document.querySelectorAll('.gym-tab-content');
        if (sections.length > 0) {
            sections.forEach(s => {
                s.classList.toggle('active', s.id === tabId);
            });
        }

        this.render();
    },

    /**
     * Função Mestre de Renderização.
     * Decide o que mostrar com base no estado atual (Treino Ativo, Home ou Histórico).
     */
    render: function() {
        // Limpa intervalo anterior de corrida para não duplicar
        if (this.runTimerInterval) clearInterval(this.runTimerInterval);

        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        const activeSession = window.GymModel.getActiveSession();

        // Prioridade: Se há treino ativo, mostra a sessão.
        if (activeSession) {
            // Nota: O Controller deve chamar renderActiveSession com lastSession
            // Se chamar render() puro, pode faltar o lastSession.
            // O fluxo ideal é via GymController.render().
            // Se cair aqui direto, renderiza sem histórico.
            this._renderSession(container, activeSession, null);
        } else if (this.activeGymTab === 'gym-routines-section') {
            this._renderHome(container);
        } else {
            this._renderHistory(container);
        }
    },

    // =========================================
    // 1. HOME (LISTA DE ROTINAS)
    // =========================================

    _renderHome: function(container) {
        // V5.9: Seletor de Fase (Biological Justice)
        const currentPhase = (window.GlobalApp.data.gym.settings && window.GlobalApp.data.gym.settings.currentPhase) || 'main';

        const phaseContainer = document.createElement('div');
        phaseContainer.className = 'phase-selector-container';
        phaseContainer.innerHTML = `
            <button class="phase-btn phase-cut ${currentPhase === 'cut' ? 'active' : ''}" onclick="window.GymController.setGymPhase('cut')">✂️ Cut</button>
            <button class="phase-btn phase-main ${currentPhase === 'main' ? 'active' : ''}" onclick="window.GymController.setGymPhase('main')">⚖️ Main</button>
            <button class="phase-btn phase-bulk ${currentPhase === 'bulk' ? 'active' : ''}" onclick="window.GymController.setGymPhase('bulk')">🦍 Bulk</button>
        `;
        container.appendChild(phaseContainer);

        // Cabeçalho com botão de Criar Nova Rotina
        const header = document.createElement('div');
        header.className = 'gym-screen-header';
        header.innerHTML = `
            <span class="gym-title">Meus Treinos</span>
            <button class="btn-new-routine" onclick="window.GymController.openCreateRoutineModal()">
                + Nova Rotina
            </button>
        `;
        container.appendChild(header);

        // Seletor de ordenação (preferência própria desta lista, persistida)
        container.appendChild(window.GlobalApp.renderSortPicker('routines', () => window.GymController.render()));

        const list = document.createElement('div');
        list.className = 'routines-list';

        const routines = window.GlobalApp.applySortPreference(
            window.GymModel.getAllRoutines(), 'routines', r => r.name
        );

        if (routines.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:60px 20px; opacity:0.3;">
                    <div style="font-size:3rem; margin-bottom:15px;">🏋️‍♂️</div>
                    <p>Você ainda não criou nenhuma rotina.</p>
                </div>
            `;
        } else {
            routines.forEach(routine => {
                const card = document.createElement('div');
                card.className = 'routine-card';

                // Monta preview dos exercícios
                const names = (routine.exercises || []).map(id => {
                    const ex = window.GymModel.getExerciseById(id);
                    return ex ? ex.name : "Ex. Removido";
                });

                card.innerHTML = `
                    <div class="routine-header">
                        <div class="routine-info">
                            <h3>${routine.name}</h3>
                            <div class="routine-exercises-preview">${names.join(', ') || 'Rotina Vazia'}</div>
                        </div>
                        <div class="routine-actions">
                            <button class="routine-menu-btn" title="Adicionar Exercício" onclick="window.GymController.addExerciseToRoutine('${routine.id}')">➕</button>
                            <button class="routine-menu-btn routine-config-btn" title="Configurar Rotina" onclick="window.GymController.openEditRoutineModal('${routine.id}')">⚙️</button>
                            <button class="routine-menu-btn routine-delete-btn" title="Apagar Rotina" onclick="window.GymController.deleteRoutine('${routine.id}')">🗑️</button>
                        </div>
                    </div>
                    <button class="btn-start-routine" onclick="window.GymController.startSession('${routine.id}')">
                        Iniciar Treino
                    </button>
                `;
                list.appendChild(card);
            });
        }
        container.appendChild(list);
    },

    // =========================================
    // 2. MODAL DE EDIÇÃO DE ROTINA (Lista Reordenável)
    // =========================================

    renderEditRoutineList: function(routineId) {
        const container = document.getElementById('edit-routine-exercises-list');
        const nameInput = document.getElementById('edit-routine-name');
        if (!container || !nameInput) return;

        container.innerHTML = '';
        const routine = window.GymModel.getRoutineById(routineId);
        if (!routine) return;

        nameInput.value = routine.name;

        if (routine.exercises.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Nenhum exercício nesta rotina.</p>';
            return;
        }

        routine.exercises.forEach((exId, index) => {
            const ex = window.GymModel.getExerciseById(exId);
            const exName = ex ? ex.name : "Exercício Desconhecido";

            const item = document.createElement('div');
            item.className = 'edit-routine-item';
            item.innerHTML = `
                <span class="edit-routine-name">${index + 1}. ${exName}</span>
                <div class="reorder-controls">
                    <button class="btn-reorder" onclick="window.GymController.moveExerciseUp('${routineId}', ${index})">⬆️</button>
                    <button class="btn-reorder" onclick="window.GymController.moveExerciseDown('${routineId}', ${index})">⬇️</button>
                    <button class="btn-delete-item" onclick="window.GymController.removeExerciseFromRoutine('${routineId}', ${index})">✖</button>
                </div>
            `;
            container.appendChild(item);
        });
    },

    // Função pública para o Controller chamar com lastSession
    renderActiveSession: function(session, lastSession) {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';
        this._renderSession(container, session, lastSession);
    },

    // =========================================
    // 3. SESSÃO ATIVA (LAYOUT V57 - 6 COLUNAS)
    // =========================================

    _renderSession: function(container, session, lastSession) {
        // Sticky Header (Fixo no topo)
        const stickyHeader = document.createElement('div');
        stickyHeader.className = 'workout-sticky-header';
        stickyHeader.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-size:0.65rem; color:var(--gym-text-sub); text-transform:uppercase; font-weight:700;">Treino em Andamento</span>
                <strong style="color:var(--gym-accent); font-size:1.1rem;">${session.routineName}</strong>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div id="session-timer-display" class="session-timer">00:00</div>
                <button class="btn-finish-workout" onclick="window.GymController.finishSession()">Finalizar</button>
            </div>
        `;
        container.appendChild(stickyHeader);

        // Renderiza cada exercício
        session.exercises.forEach((ex, exIndex) => {

            // --- INTERFACE HÍBRIDA PARA CORRIDA (V6.0: DASHBOARD + HIT) ---
            if (ex.name === 'Corrida') {
                const card = document.createElement('div');
                card.className = 'session-exercise-card';

                // Header Normal
                card.innerHTML = `
                    <div class="session-exercise-header">
                        <span class="session-exercise-name">🏃 ${ex.name} (Híbrido)</span>
                        <button class="btn-ex-stats" onclick="window.GymView.showExerciseChart('${ex.id}')">📊</button>
                    </div>
                `;

                // 1. DASHBOARD DE CORRIDA (Parte Superior)
                const dashboard = document.createElement('div');
                dashboard.className = 'run-dashboard-container';

                // Dados
                const pr = window.GymModel.getRunningPR();
                const dist = ex.runDistance || 0;

                // Timer Logic Calculation
                let initialTimeMs = ex.runElapsedTime || 0;
                if (ex.isRunning && ex.runStartTime) {
                    initialTimeMs += (Date.now() - ex.runStartTime);
                }
                const timeStr = this._formatTime(Math.floor(initialTimeMs / 1000));

                // Botão de definir PR se for 0
                const prBtnHTML = (pr === 0)
                    ? `<button class="btn-set-pr" onclick="window.GymController.promptSetPR()">Definir PR Inicial</button>`
                    : `<span class="run-stat-value pr">${pr.toFixed(2)}km</span>`;

                const toggleIcon = ex.isRunning ? '⏸️' : '▶️';
                const toggleClass = ex.isRunning ? 'btn-run-pause' : 'btn-run-play';

                dashboard.innerHTML = `
                    <div class="run-dashboard-top">
                        <span class="run-stat-label">RECORD PESSOAL (PR)</span>
                        ${pr === 0 ? prBtnHTML : `<div style="text-align:right">${prBtnHTML}</div>`}
                    </div>

                    <div id="run-timer-${exIndex}" class="run-timer-display">${timeStr}</div>

                    <div class="run-timer-controls">
                        <button class="${toggleClass}" onclick="window.GymController.toggleRunTimer(${exIndex})">${toggleIcon}</button>
                    </div>

                    <div class="run-stats-grid">
                        <div class="run-stat-box">
                            <span class="run-stat-label">DISTÂNCIA ATUAL</span>
                            <span class="run-stat-value">${dist.toFixed(2)}km</span>
                        </div>
                        <div class="run-stat-box">
                            <span class="run-stat-label">META XP</span>
                            <span class="run-stat-value" style="color:var(--gym-accent)">Exponencial</span>
                        </div>
                    </div>

                    <div class="run-controls-grid">
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.01)">+10m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.1)">+100m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 0.5)">+500m</button>
                        <button class="btn-dist-shortcut" onclick="window.GymController.addRunShortcut(${exIndex}, 1.0)">+1km</button>
                    </div>

                    <div class="run-manual-input-container">
                        <input type="number" id="run-manual-km-${exIndex}" class="run-manual-km-input" placeholder="KM Manual (Total)">
                        <button class="btn-add-km-manual" onclick="window.GymController.addRunManual(${exIndex})">DEFINIR</button>
                    </div>
                `;

                card.appendChild(dashboard);

                // 2. INTERFACE HIT (Parte Inferior - Restaurada)
                const runContainer = document.createElement('div');
                runContainer.className = 'run-interface-container';

                // Botão Mestre HIT
                const hitBtn = document.createElement('button');
                hitBtn.className = 'hit-master-btn';
                hitBtn.innerHTML = '⚡ INTERVALOS DE HIT';
                hitBtn.onclick = () => window.GymController.addHitInterval(exIndex);
                runContainer.appendChild(hitBtn);

                // Renderiza intervalos (Sets de corrida HIT)
                if (ex.sets && ex.sets.length > 0) {
                    ex.sets.forEach((set, setIndex) => {
                        const row = document.createElement('div');
                        row.className = 'hit-time-row';

                        // Input Manual (Time em segundos)
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.id = `hit-input-${exIndex}-${setIndex}`;
                        input.className = 'hit-manual-input';
                        input.value = set.val1 || 0;
                        input.placeholder = '0s';
                        input.onchange = () => window.GymController.updateHitTime(exIndex, setIndex, 0);

                        // Grid de Atalhos
                        const shortcutsDiv = document.createElement('div');
                        shortcutsDiv.className = 'hit-shortcuts-grid';

                        const times = [10, 30, 60, 300];
                        const labels = ['+10s', '+30s', '+1m', '+5m'];

                        times.forEach((t, i) => {
                            const btn = document.createElement('button');
                            btn.className = 'hit-shortcut-btn';
                            btn.textContent = labels[i];
                            btn.onclick = () => window.GymController.updateHitTime(exIndex, setIndex, t);
                            shortcutsDiv.appendChild(btn);
                        });

                        // Botão Remover Linha
                        const delBtn = document.createElement('button');
                        delBtn.className = 'btn-remove-hit';
                        delBtn.innerHTML = '×';
                        delBtn.onclick = () => window.GymController.removeHitInterval(exIndex, setIndex);

                        row.appendChild(input);
                        row.appendChild(shortcutsDiv);
                        row.appendChild(delBtn);
                        runContainer.appendChild(row);
                    });
                }

                card.appendChild(runContainer);
                container.appendChild(card);

                // Lógica de Atualização Visual do Timer Específico
                if (ex.isRunning) {
                    this._activateRunTimerVisual(exIndex, ex.runStartTime, ex.runElapsedTime);
                }

                return; // Pula renderização padrão
            }
            // --- FIM INTERFACE HÍBRIDA CORRIDA ---

            const card = document.createElement('div');
            card.className = 'session-exercise-card';

            // Definição de Labels (KG/REPS ou TEMPO)
            let label1 = "KG", label2 = "REPS";
            if (ex.type && ex.type.includes('dur')) label2 = "TEMPO";
            if (ex.type && ex.type.includes('no_weight')) label1 = "PESO";

            // Exercícios de Duração (dur_weight / dur_no_weight) ganham o botão
            // do Cronômetro com Voz em cada linha de série — não faz sentido em
            // exercícios de repetição, que não têm um tempo a cronometrar.
            const isDurationType = !!(ex.type && ex.type.startsWith('dur'));

            // "Duração sem peso" (ex.: prancha, alongamento cronometrado) não
            // tem peso algum a registrar — diferente de "Repetições (Peso do
            // Corpo)", onde a coluna de peso ainda serve para peso adicional.
            // Por isso a coluna/campo de peso é totalmente ocultada só para
            // este tipo específico.
            const isNoWeightDuration = ex.type === 'dur_no_weight';

            // Busca exercício correspondente no LastSession (se houver)
            let lastEx = null;
            if (lastSession && lastSession.exercises) {
                // Compara pelo ID do exercício, não pela posição no array
                lastEx = lastSession.exercises.find(le => le.id === ex.id);
            }

            // --- INJEÇÃO V6.2: NOTAS E METAS ---
            const globalEx = window.GymModel.getExerciseById(ex.id) || {};
            const noteText = globalEx.note || '';
            const goalV1 = globalEx.goalV1 || '';
            const goalV2 = globalEx.goalV2 || '';

            // Em "Duração sem peso" o campo de meta de peso (goal-v1) continua
            // existindo no DOM (como input oculto, preservando qualquer valor
            // já salvo) para não quebrar o onchange do campo de meta de tempo,
            // mas não é mostrado ao usuário — só a meta de tempo faz sentido.
            const goalMetaLabel = isNoWeightDuration ? `🎯 META (${label2})` : `🎯 META (${label1} x ${label2})`;
            const goalV1FieldHTML = isNoWeightDuration
                ? `<input type="hidden" id="goal-v1-${ex.id}" value="${goalV1}">`
                : `<input type="text" id="goal-v1-${ex.id}" class="gym-input" style="flex: 1;" placeholder="${label1}" value="${goalV1}" onchange="window.GymController.updateExerciseGoal('${ex.id}', document.getElementById('goal-v1-${ex.id}').value, document.getElementById('goal-v2-${ex.id}').value)">`;

            const extraFieldsHTML = `
                <div class="exercise-extra-fields" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333;">
                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 0.7rem; color: var(--gym-gold); font-weight: bold; display: block; margin-bottom: 5px;">📝 NOTAS DO EXERCÍCIO</label>
                        <textarea id="note-${exIndex}" class="gym-input" style="width: 100%; height: 50px; resize: none; font-size: 0.8rem;" placeholder="Anote placas, ajustes da máquina..." onchange="window.GymController.updateExerciseNote('${ex.id}', this.value)">${noteText}</textarea>
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: var(--gym-accent); font-weight: bold; display: block; margin-bottom: 5px;">${goalMetaLabel}</label>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            ${goalV1FieldHTML}
                            <input type="text" id="goal-v2-${ex.id}" class="gym-input" style="flex: 1;" placeholder="${label2}" value="${goalV2}" onchange="window.GymController.updateExerciseGoal('${ex.id}', document.getElementById('goal-v1-${ex.id}').value, document.getElementById('goal-v2-${ex.id}').value)">
                        </div>
                        <div style="background: #222; border-radius: 10px; height: 10px; width: 100%; overflow: hidden; position: relative;">
                            <div id="progress-bar-${exIndex}" style="background: linear-gradient(90deg, var(--gym-accent), var(--gym-success)); width: 0%; height: 100%; transition: width 0.3s;"></div>
                        </div>
                        <div id="progress-text-${exIndex}" style="font-size: 0.7rem; text-align: right; margin-top: 3px; color: var(--gym-text-sub);">0%</div>
                    </div>
                </div>
            `;

            let setsHTML = '';

            // Loop de Séries
            ex.sets.forEach((set, setIndex) => {
                const checkedClass = set.done ? 'checked' : '';

                // LÓGICA V57: Ícone e Cor baseados no estado (Aquecimento vs Válida)
                const typeIcon = set.isWarmup ? '🔥' : '💪';
                const typeClass = set.isWarmup ? 'is-warmup' : 'is-valid';

                // LÓGICA V6.1: Comparação de Carga (History Check) - SÓ TREINO ANTERIOR
                let styleV1 = '';
                let styleV2 = '';
                let historyLabel = '-';

                // Se houver histórico desse exercício e dessa série específica (índice)
                if (lastEx && lastEx.sets && lastEx.sets[setIndex]) {
                    const lastSet = lastEx.sets[setIndex];

                    if (isNoWeightDuration) {
                        // Sem peso: a comparação e o histórico exibido são só o tempo (val2)
                        historyLabel = `${lastSet.val2}`;

                        const currentV2 = parseFloat(set.val2) || 0;
                        const lastV2 = parseFloat(lastSet.val2) || 0;

                        if (currentV2 > lastV2) {
                            styleV2 = 'color:var(--gym-success); font-weight:bold;';
                        } else if (currentV2 < lastV2) {
                            styleV2 = 'color:var(--gym-danger);';
                        }
                    } else {
                        // Exibe o histórico na coluna LAST (ex: "50kg x 10")
                        historyLabel = `${lastSet.val1} x ${lastSet.val2}`;

                        // Comparação de Carga (Val1)
                        const currentV1 = parseFloat(set.val1) || 0;
                        const lastV1 = parseFloat(lastSet.val1) || 0;

                        if (currentV1 > lastV1) {
                            styleV1 = 'color:var(--gym-success); font-weight:bold;'; // Superou (Verde)
                        } else if (currentV1 < lastV1) {
                            styleV1 = 'color:var(--gym-danger);'; // Regrediu (Vermelho)
                        }

                        // Comparação de Reps (Val2) - Apenas se carga for igual ou maior
                        if (currentV1 >= lastV1) {
                            const currentV2 = parseFloat(set.val2) || 0;
                            const lastV2 = parseFloat(lastSet.val2) || 0;

                            if (currentV2 > lastV2) {
                                styleV2 = 'color:var(--gym-success); font-weight:bold;';
                            } else if (currentV1 === lastV1 && currentV2 < lastV2) {
                                // Só pinta vermelho se carga for igual e reps caíram
                                styleV2 = 'color:var(--gym-danger);';
                            }
                        }
                    }
                }

                // Botão do Cronômetro com Voz (só em exercícios de Duração)
                const voiceBtnHTML = isDurationType
                    ? `<button type="button" class="btn-voice-timer" title="Cronômetro com Voz"
                               onclick="window.GymController.openVoiceTimer(${exIndex}, ${setIndex})">🔊</button>`
                    : '';

                // Em exercícios de Duração o campo TEMPO divide a coluna com o
                // botão 🔊, então precisa de flex:1 + min-width:0 para ocupar
                // o espaço extra que a grade alargada (has-voice-col /
                // no-weight-col) reserva para essa coluna.
                const v2InputStyle = isDurationType ? `flex:1; min-width:0; ${styleV2}` : styleV2;

                // Coluna de peso (val1): totalmente omitida para "Duração sem peso"
                const val1ColumnHTML = isNoWeightDuration ? '' : `
                        <div>
                            <input type="text" id="v1-${exIndex}-${setIndex}" class="gym-input"
                                   value="${set.val1}" placeholder="0" inputmode="decimal"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})"
                                   style="${styleV1}">
                        </div>`;

                /* GRID V57 (6 Colunas, ou 5 para "Duração sem peso") */
                setsHTML += `
                    <div class="set-row">
                        <div>
                            <button class="btn-set-type ${typeClass}"
                                    onclick="window.GymController.openSetTypeSelector(${exIndex}, ${setIndex})"
                                    title="Alterar tipo de série">
                                ${typeIcon}
                            </button>
                        </div>

                        <div class="set-prev" style="font-size:0.7rem; opacity:0.6; white-space:nowrap; overflow:hidden;">${historyLabel}</div>
                        ${val1ColumnHTML}
                        <div style="display:flex; align-items:center; gap:4px;">
                            <input type="text" id="v2-${exIndex}-${setIndex}" class="gym-input"
                                   value="${set.val2}" placeholder="0" inputmode="decimal"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})"
                                   style="${v2InputStyle}">
                            ${voiceBtnHTML}
                        </div>

                        <div>
                            <input type="number" id="r-${exIndex}-${setIndex}" class="gym-input"
                                   value="${set.rest}" placeholder="60" inputmode="numeric"
                                   onchange="window.GymController.updateSetData(${exIndex}, ${setIndex})"
                                   style="color:var(--gym-gold); border-bottom: 1px solid rgba(255,214,10,0.2);">
                        </div>

                        <div>
                            <button id="btn-check-${exIndex}-${setIndex}" class="btn-check-set ${checkedClass}"
                                    onclick="window.GymController.toggleCheck(${exIndex}, ${setIndex})"></button>
                        </div>
                    </div>
                `;
            });

            // Montagem do Card do Exercício
            const isFirst = exIndex === 0;
            const isLast = exIndex === session.exercises.length - 1;
            let setsGridClass = 'sets-grid';
            if (isNoWeightDuration) setsGridClass = 'sets-grid no-weight-col';
            else if (isDurationType) setsGridClass = 'sets-grid has-voice-col';
            const label1HeaderHTML = isNoWeightDuration ? '' : `<div class="sets-header">${label1}</div>`;
            card.innerHTML = `
                <div class="session-exercise-header">
                    <span class="session-exercise-name">${ex.name}</span>
                    <div class="session-exercise-actions">
                        <button class="btn-session-reorder" title="Mover para cima" ${isFirst ? 'disabled' : ''} onclick="window.GymController.moveSessionExerciseUp(${exIndex})">⬆️</button>
                        <button class="btn-session-reorder" title="Mover para baixo" ${isLast ? 'disabled' : ''} onclick="window.GymController.moveSessionExerciseDown(${exIndex})">⬇️</button>
                        <button class="btn-ex-stats" title="Ver evolução" onclick="window.GymView.showExerciseChart('${ex.id}')">📊</button>
                        <button class="btn-session-remove-ex" title="Remover exercício deste treino" onclick="window.GymController.removeExerciseFromSession(${exIndex})">🗑️</button>
                    </div>
                </div>
                ${extraFieldsHTML}
                <div class="${setsGridClass}">
                    <div class="sets-header">TIPO</div>
                    <div class="sets-header align-left">LAST</div>
                    ${label1HeaderHTML}
                    <div class="sets-header">${label2}</div>
                    <div class="sets-header" style="color:var(--gym-gold)">REST</div>
                    <div class="sets-header">✓</div>
                    ${setsHTML}
                    <button class="btn-add-set" onclick="window.GymController.addSetToExercise(${exIndex})">+ Adicionar Série</button>
                </div>
            `;
            container.appendChild(card);

            // Atualiza barra de progresso inicial
            if (this.updateExerciseProgress) {
                this.updateExerciseProgress(exIndex, ex.id);
            }
        });

        // Botões de Adicionar Exercício ao treino em andamento (V9.1: dois modos)
        const addExDiv = document.createElement('div');
        addExDiv.className = 'session-add-exercise-group';
        addExDiv.innerHTML = `
            <button class="btn-add-exercise-session" onclick="window.GymController.openAddExerciseToSessionModal()">
                + Adicionar Exercício ao Treino
            </button>
            <button class="btn-add-exercise-session btn-add-exercise-routine" onclick="window.GymController.openAddExerciseToSessionAndRoutineModal()" title="Adiciona ao treino de hoje e também salva na rotina, para os próximos treinos">
                + Adicionar Permanente à Rotina
            </button>
        `;
        container.appendChild(addExDiv);

        // Botão de Cancelamento no final
        const cancelDiv = document.createElement('div');
        cancelDiv.style.cssText = "text-align:center; padding:30px 0;";
        cancelDiv.innerHTML = `
            <button onclick="window.GymController.cancelSession()"
                    style="background:none; border:none; color:var(--gym-danger); text-decoration:underline; cursor:pointer;">
                CANCELAR TREINO
            </button>
        `;
        container.appendChild(cancelDiv);
    },

    // =========================================
    // 3. AUXILIARES DE CORRIDA E METAS
    // =========================================

    updateExerciseProgress: function(exIndex, exId) {
        const globalEx = window.GymModel.getExerciseById(exId);
        const session = window.GymModel.getActiveSession();
        if (!globalEx || !session || !session.exercises[exIndex]) return;

        const goalV1 = parseFloat(globalEx.goalV1) || 0;
        const goalV2 = parseFloat(globalEx.goalV2) || 0;

        const progressBar = document.getElementById(`progress-bar-${exIndex}`);
        const progressText = document.getElementById(`progress-text-${exIndex}`);

        if (!progressBar || !progressText) return;

        if (goalV1 === 0 && goalV2 === 0) {
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            return;
        }

        // Calcula a pontuação da meta: (Peso * 12) + Reps
        const goalScore = (goalV1 * 12) + goalV2;
        if (goalScore <= 0) return;

        // Busca a melhor série válida desta sessão
        let maxScore = 0;
        const sessionEx = session.exercises[exIndex];

        sessionEx.sets.forEach(set => {
            if (set.done && !set.isWarmup) {
                const v1 = parseFloat(set.val1) || 0;
                const v2 = parseFloat(set.val2) || 0;
                const score = (v1 * 12) + v2;
                if (score > maxScore) maxScore = score;
            }
        });

        let percent = (maxScore / goalScore) * 100;
        if (percent > 100) percent = 100;

        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent.toFixed(1)}%`;
    },

    _formatTime: function(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        // Se tiver hora, mostra HH:MM:SS, senão MM:SS
        if (h > 0) {
            return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    },

    _activateRunTimerVisual: function(exIndex, startTime, elapsedBefore) {
        // Se já existe um intervalo rodando, limpa
        if (this.runTimerInterval) clearInterval(this.runTimerInterval);

        const el = document.getElementById(`run-timer-${exIndex}`);
        if (!el) return;

        this.runTimerInterval = setInterval(() => {
            const now = Date.now();
            const totalSeconds = Math.floor((elapsedBefore + (now - startTime)) / 1000);
            el.textContent = this._formatTime(totalSeconds);
        }, 1000);
    },

    // =========================================
    // 3.5. CRONÔMETRO COM VOZ (Modal)
    // =========================================

    /**
     * Prepara a tela de configuração do modal do Cronômetro com Voz (antes de
     * iniciar a contagem). Mostra o PR atual do exercício, se houver, para
     * contexto — o anúncio de "Recorde!" em voz só acontece depois, durante a
     * contagem em si (ver GymController.openVoiceTimer / _voiceTimerTick).
     */
    setupVoiceTimerModal: function(exerciseName, prSeconds, prepSeconds, intervalSeconds) {
        const title = document.getElementById('voice-timer-title');
        if (title) title.textContent = `🔊 ${exerciseName}`;

        const configArea = document.getElementById('voice-timer-config');
        const displayArea = document.getElementById('voice-timer-display-area');
        if (configArea) configArea.classList.remove('hidden');
        if (displayArea) displayArea.classList.add('hidden');

        const prepInput = document.getElementById('voice-timer-prep');
        if (prepInput) prepInput.value = prepSeconds;

        const intervalInput = document.getElementById('voice-timer-interval');
        if (intervalInput) intervalInput.value = intervalSeconds;

        document.querySelectorAll('.voice-timer-interval-presets button').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.interval, 10) === intervalSeconds);
        });

        const prNote = document.getElementById('voice-timer-pr-note');
        const prValue = document.getElementById('voice-timer-pr-value');
        if (prNote && prValue) {
            if (prSeconds > 0) {
                prValue.textContent = this._formatTime(prSeconds);
                prNote.classList.remove('hidden');
            } else {
                prNote.classList.add('hidden');
            }
        }

        const btnStart = document.getElementById('btn-start-voice-timer');
        const btnStop = document.getElementById('btn-stop-voice-timer');
        const btnUse = document.getElementById('btn-use-voice-timer-value');
        if (btnStart) btnStart.classList.remove('hidden');
        if (btnStop) btnStop.classList.add('hidden');
        if (btnUse) btnUse.classList.add('hidden');

        // Reseta qualquer estado "editável" deixado por uma parada anterior
        const display = document.getElementById('voice-timer-display');
        if (display) {
            display.classList.remove('is-editable');
            display.onclick = null;
            display.title = '';
        }
    },

    /**
     * Alterna a tela do modal de configuração -> tela de contagem ativa.
     */
    showVoiceTimerRunning: function() {
        const configArea = document.getElementById('voice-timer-config');
        const displayArea = document.getElementById('voice-timer-display-area');
        if (configArea) configArea.classList.add('hidden');
        if (displayArea) displayArea.classList.remove('hidden');

        const btnStart = document.getElementById('btn-start-voice-timer');
        const btnStop = document.getElementById('btn-stop-voice-timer');
        const btnUse = document.getElementById('btn-use-voice-timer-value');
        if (btnStart) btnStart.classList.add('hidden');
        if (btnStop) btnStop.classList.remove('hidden');
        if (btnUse) btnUse.classList.add('hidden');
    },

    /**
     * Atualiza o display numérico do cronômetro e a label de fase
     * ("PREPARE-SE" na contagem regressiva, "EM ANDAMENTO" depois do zero).
     */
    updateVoiceTimerDisplay: function(value, phaseLabel, isRecordBeat) {
        const display = document.getElementById('voice-timer-display');
        const label = document.getElementById('voice-timer-phase-label');
        if (display) {
            display.textContent = value;
            display.classList.toggle('is-record', !!isRecordBeat);
        }
        if (label) label.textContent = phaseLabel;
    },

    /**
     * Ao parar o cronômetro (manual ou pelo usuário), mostra o botão para
     * jogar o tempo decorrido no campo TEMPO da série.
     */
    showVoiceTimerStopped: function() {
        const btnStop = document.getElementById('btn-stop-voice-timer');
        const btnUse = document.getElementById('btn-use-voice-timer-value');
        if (btnStop) btnStop.classList.add('hidden');
        if (btnUse) btnUse.classList.remove('hidden');

        // Agora que o cronômetro já foi parado manualmente, permite tocar no
        // valor exibido para corrigi-lo antes de confirmar com "Usar".
        const display = document.getElementById('voice-timer-display');
        if (display) {
            display.classList.add('is-editable');
            display.title = 'Toque para corrigir o tempo';
            display.onclick = () => window.GymController.enableVoiceTimerManualEdit();
        }
    },

    /**
     * Troca o conteúdo do display do cronômetro por um input numérico, para
     * o usuário corrigir o valor antes de confirmar. Só é chamado depois que
     * o cronômetro já foi parado manualmente (ver GymController.enableVoiceTimerManualEdit).
     */
    showVoiceTimerEditInput: function(currentValue) {
        const display = document.getElementById('voice-timer-display');
        if (!display) return;
        display.classList.remove('is-editable');
        display.onclick = null;
        display.title = '';
        display.innerHTML = `<input type="number" id="voice-timer-edit-input" class="voice-timer-edit-input" value="${currentValue}" inputmode="numeric" min="0">`;
        const input = document.getElementById('voice-timer-edit-input');
        if (input) {
            input.focus();
            input.select();
            input.onblur = () => window.GymController.commitVoiceTimerManualEdit();
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                }
            };
        }
    },

    /**
     * Mostra de volta o valor (já corrigido ou não) como texto, voltando a
     * permitir tocar para editar novamente.
     */
    renderVoiceTimerFinalValue: function(value) {
        const display = document.getElementById('voice-timer-display');
        if (!display) return;
        display.textContent = value;
        display.classList.add('is-editable');
        display.title = 'Toque para corrigir o tempo';
        display.onclick = () => window.GymController.enableVoiceTimerManualEdit();
    },

    // =========================================
    // 4. HISTÓRICO & AUDITORIA
    // =========================================

    _renderHistory: function(container) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<h2>Histórico de Atividade</h2>`;
        container.appendChild(header);

        const logs = window.GlobalApp.data.gym.gymLogs || [];

        let rowsHTML = '';
        if (logs.length === 0) {
            rowsHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; opacity:0.5;">Sem logs registrados.</td></tr>';
        } else {
            logs.forEach(log => {
                rowsHTML += `
                    <tr>
                        <td style="font-size:0.75rem; color:var(--gym-text-sub);">${log.date}<br>${new Date(log.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
                        <td><strong>${log.exerciseName}</strong></td>
                        <td style="font-size:0.8rem;">${log.detail}</td>
                        <td><button class="btn-undo-gym" onclick="window.GymController.undoLog('${log.id}')">Desfazer</button></td>
                    </tr>
                `;
            });
        }

        const table = document.createElement('div');
        table.className = 'logs-container';
        table.innerHTML = `
            <table id="gym-log-table">
                <thead><tr><th>Hora</th><th>Origem</th><th>Detalhe</th><th>Ação</th></tr></thead>
                <tbody>${rowsHTML}</tbody>
            </table>
        `;
        container.appendChild(table);
    },

    // =========================================
    // 5. GRÁFICOS (Renderização Segura SVG)
    // =========================================

    showExerciseChart: function(exerciseId) {
        try {
            const ex = window.GymModel.getExerciseById(exerciseId);
            if (!ex) return;

            document.getElementById('gym-chart-title').textContent = `Evolução: ${ex.name}`;
            const container = document.getElementById('gym-chart-container');
            container.innerHTML = '';

            const progress = window.GymModel.getExerciseProgress(exerciseId);

            if (!progress || progress.length < 2) {
                container.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center; color:var(--gym-text-sub); flex-direction:column;"><span style="font-size:2rem;">📉</span><p>Dados insuficientes (mín. 2 treinos)</p></div>';
            } else {
                // Dimensões Virtuais do SVG
                const w = 600;
                const h = 200;
                const padX = 50; // Margem Esquerda Aumentada para Eixo Y
                const padY = 20;

                const values = progress.map(p => p.value);
                let minVal = Math.min(...values);
                let maxVal = Math.max(...values);

                // Ajuste de escala Y para não colar nas bordas
                if (minVal === maxVal) { minVal -= 10; maxVal += 10; }
                const range = maxVal - minVal;
                // Margem de 10% em cima e em baixo
                const yMin = minVal - (range * 0.1);
                const yMax = maxVal + (range * 0.1);
                const yRange = yMax - yMin;

                // Funções de Projeção
                const mapX = (i) => padX + (i / (progress.length - 1)) * (w - (padX * 2));
                const mapY = (v) => h - padY - ((v - yMin) / yRange) * (h - (padY * 2));

                // Construção dos Caminhos SVG
                let pathD = `M ${mapX(0)} ${mapY(values[0])}`;
                let areaD = `M ${mapX(0)} ${h} L ${mapX(0)} ${mapY(values[0])}`;

                let circlesSVG = '';
                let labelsSVG = '';

                progress.forEach((p, i) => {
                    const x = mapX(i);
                    const y = mapY(p.value);

                    if (i > 0) {
                        pathD += ` L ${x} ${y}`;
                        areaD += ` L ${x} ${y}`;
                    }

                    // Pontos (Círculos)
                    circlesSVG += `<circle cx="${x}" cy="${y}" class="chart-dot"><title>${p.date}: ${p.value}</title></circle>`;

                    // Rótulos X (Datas) - Lógica de espaçamento
                    const step = Math.ceil(progress.length / 5);
                    if (i % step === 0 || i === progress.length - 1) {
                         // Formata Data (DD/MM)
                         const dateParts = p.date.split('/');
                         const shortDate = dateParts.slice(0, 2).join('/');
                         labelsSVG += `<text x="${x}" y="${h - 5}" class="chart-axis-text">${shortDate}</text>`;
                    }
                });

                // Fecha Área
                areaD += ` L ${mapX(progress.length - 1)} ${h} Z`;

                // --- EIXO Y (TICKS & LABELS) ---
                const midVal = (minVal + maxVal) / 2;
                const ticks = [minVal, midVal, maxVal];
                let yAxisSVG = '';

                ticks.forEach(val => {
                    const yPos = mapY(val);
                    // Linha de grade
                    yAxisSVG += `<line x1="${padX}" y1="${yPos}" x2="${w-padX}" y2="${yPos}" class="chart-grid-line" />`;
                    // Label Numérico (estilo inline para forçar alinhamento)
                    yAxisSVG += `<text x="${padX - 8}" y="${yPos + 4}" class="chart-axis-text" style="text-anchor:end;">${val.toFixed(1)}</text>`;
                });

                // Renderiza SVG
                const svgContent = `
                    <svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="gradientArea" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="var(--gym-accent)" stop-opacity="0.4"/>
                                <stop offset="100%" stop-color="var(--gym-accent)" stop-opacity="0"/>
                            </linearGradient>
                        </defs>

                        ${yAxisSVG}

                        <path d="${areaD}" class="chart-area" />
                        <path d="${pathD}" class="chart-line" vector-effect="non-scaling-stroke" />
                        ${circlesSVG}
                        ${labelsSVG}
                    </svg>
                `;

                container.innerHTML = svgContent;
            }

            this.toggleModal('modal-gym-chart', true);

        } catch (error) {
            console.error("[GymView] Erro ao gerar gráfico:", error);
            document.getElementById('gym-chart-container').innerHTML = '<p style="text-align:center; padding-top:40px;">Erro visualização.</p>';
            this.toggleModal('modal-gym-chart', true);
        }
    },

    // =========================================
    // UTILITÁRIOS
    // =========================================

    updateTimer: function(str) {
        const el = document.getElementById('session-timer-display');
        if (el) el.textContent = str;
    },

    toggleCheckVisual: function(exIndex, setIndex, isDone) {
        const btn = document.getElementById(`btn-check-${exIndex}-${setIndex}`);
        if (btn) btn.classList.toggle('checked', isDone);
    },

    toggleModal: function(id, show) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.toggle('hidden', !show);

        // Sempre que o modal "Evolução por Grupo Muscular" é aberto, volta
        // para o modo "Período Fixo" (comportamento padrão/original) — evita
        // reabrir "preso" no modo Semanal/Mensal de uma visita anterior.
        if (id === 'modal-gym-evolution' && show) {
            this.evoMode = 'days';
            document.querySelectorAll('#gym-evo-mode-tabs button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === 'days');
            });
            const daysControls = document.getElementById('gym-evo-days-controls');
            const periodControls = document.getElementById('gym-evo-period-controls');
            if (daysControls) daysControls.classList.remove('hidden');
            if (periodControls) periodControls.classList.add('hidden');
        }
    },

    /**
     * Renderiza a lista de seleção de exercícios (usada nos modais de adicionar),
     * agrupada por categoria em seções expansíveis (mesmo padrão visual da
     * árvore do modal "Evolução por Grupo Muscular"). Quando forceExpandAll é
     * true (ex.: enquanto o usuário está buscando por nome), todas as
     * categorias aparecem abertas, independente do estado salvo.
     */
    renderExerciseSelectionList: function(list, onSelect, forceExpandAll) {
        const container = document.getElementById('gym-exercises-list');
        if (!container) return;

        const pickerContainer = document.getElementById('gym-exercises-sort-picker');
        if (pickerContainer) {
            pickerContainer.innerHTML = '';
            pickerContainer.appendChild(
                window.GlobalApp.renderSortPicker('exercises', () => window.GymController.renderExerciseList(window.GymModel.getAllUserExercises()))
            );
        }

        container.innerHTML = '';

        if (list.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:20px;">Nenhum exercício encontrado.</p>';
            return;
        }

        const groups = {};
        list.forEach(ex => {
            const cat = (ex.category && ex.category !== 'Sem Categoria') ? ex.category : 'Sem Categoria';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(ex);
        });

        const categoryNames = Object.keys(groups).sort((a, b) => {
            if (a === 'Sem Categoria') return 1;
            if (b === 'Sem Categoria') return -1;
            return a.localeCompare(b, 'pt-BR');
        });

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = forceExpandAll || !!this.exercisePickerExpandedCategories[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'gym-evo-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'gym-evo-category-header';
            header.innerHTML = `
                <span class="gym-evo-category-arrow">▶</span>
                <span class="gym-evo-category-name">${cat}</span>
                <span class="gym-evo-category-count">${items.length}</span>
            `;
            header.onclick = () => this.toggleExercisePickerCategory(cat, list, onSelect);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'gym-evo-category-items gym-selection-list';
            itemsDiv.style.margin = '0';
            itemsDiv.style.border = 'none';
            itemsDiv.style.maxHeight = 'none';
            itemsDiv.style.overflowY = 'visible';

            items.forEach(ex => {
                const item = document.createElement('div');
                item.className = 'gym-select-item';
                item.innerHTML = `
                    <div><h4>${ex.name}</h4><small>${ex.type}</small></div>
                    <div class="gym-select-item-actions">
                        <button class="btn-edit-ex-item" title="Editar Exercício" onclick="event.stopPropagation(); window.GymController.openEditExerciseModal('${ex.id}')">✏️</button>
                        <span>+</span>
                    </div>
                `;
                item.onclick = (e) => {
                    if (e.target.closest('.btn-edit-ex-item')) return;
                    onSelect(ex.id);
                };
                itemsDiv.appendChild(item);
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    /**
     * Abre/fecha uma categoria no modal "Adicionar Exercício" e re-renderiza.
     */
    toggleExercisePickerCategory: function(cat, list, onSelect) {
        this.exercisePickerExpandedCategories[cat] = !this.exercisePickerExpandedCategories[cat];
        this.renderExerciseSelectionList(list, onSelect, false);
    },

    // =========================================
    // EVOLUÇÃO POR GRUPO MUSCULAR
    // =========================================

    // Formata um timestamp em "DD Mmm AAAA" (ex: 12 Set 2026)
    _formatEvoDate: function(timestamp) {
        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const d = new Date(timestamp);
        return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    },

    /**
     * Alterna o modo do modal "Evolução por Grupo Muscular" entre 'days'
     * (Período Fixo, comportamento original: comparação início/atual numa
     * janela de dias) e 'period' (Semanal/Mensal, novo: evolução por
     * blocos semanais/mensais, por exercício). Mostra/esconde os controles
     * de cada modo e re-renderiza a árvore de categorias no modo escolhido.
     */
    setEvoMode: function(mode) {
        this.evoMode = mode;
        document.querySelectorAll('#gym-evo-mode-tabs button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        const daysControls = document.getElementById('gym-evo-days-controls');
        const periodControls = document.getElementById('gym-evo-period-controls');
        if (daysControls) daysControls.classList.toggle('hidden', mode !== 'days');
        if (periodControls) periodControls.classList.toggle('hidden', mode !== 'period');

        if (mode === 'days') {
            this.renderEvolutionTree(window.GymController._currentEvoDays());
        } else {
            this.renderEvolutionTreePeriod(this.evoPeriodType);
        }
    },

    /**
     * Chamado pelos botões "Semanal"/"Mensal" do sub-toggle, visível só
     * quando evoMode === 'period'.
     */
    setEvoPeriodType: function(period) {
        this.evoPeriodType = period;
        document.querySelectorAll('#gym-evo-period-type-tabs button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        this.renderEvolutionTreePeriod(period);
    },

    renderEvolutionTree: function(days) {
        const container = document.getElementById('gym-evolution-list');
        const rangeEcho = document.getElementById('gym-evo-range-echo');
        if (!container) return;

        container.innerHTML = '';
        const groups = window.GymModel.getEvolutionTree(days);

        // Calcula a data de início mais antiga entre os exercícios com dados, para o eco do período
        let earliest = null;
        Object.values(groups).forEach(items => {
            items.forEach(({ progress }) => {
                if (progress && (earliest === null || progress.startDate < earliest)) {
                    earliest = progress.startDate;
                }
            });
        });
        if (rangeEcho) {
            const endLabel = this._formatEvoDate(Date.now());
            rangeEcho.textContent = earliest ? `${this._formatEvoDate(earliest)} → ${endLabel}` : '—';
        }

        const categoryNames = Object.keys(groups)
            .filter(cat => groups[cat].length > 0)
            .sort((a, b) => {
                if (a === 'Sem Categoria') return 1;
                if (b === 'Sem Categoria') return -1;
                return a.localeCompare(b, 'pt-BR');
            });

        if (categoryNames.length === 0) {
            container.innerHTML = '<div class="gym-evo-empty">Nenhum exercício cadastrado ainda.</div>';
            return;
        }

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = !!this.evoExpandedCategories?.[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'gym-evo-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'gym-evo-category-header';
            header.innerHTML = `
                <span class="gym-evo-category-arrow">▶</span>
                <span class="gym-evo-category-name">${cat}</span>
                <span class="gym-evo-category-count">${items.length}</span>
            `;
            header.onclick = () => this.toggleEvoCategory(cat);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'gym-evo-category-items';

            items.forEach(({ exercise, progress }) => {
                itemsDiv.appendChild(this._renderEvoItem(exercise, progress));
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    /**
     * Versão "Semanal/Mensal" da árvore de categorias: mesma estrutura de
     * categorias expansíveis, mas cada exercício mostra sua evolução por
     * blocos semanais/mensais (GymModel.getExerciseWeeklyMonthlyEvolution)
     * em vez da comparação início/atual numa janela de dias.
     */
    renderEvolutionTreePeriod: function(period) {
        const container = document.getElementById('gym-evolution-list');
        const rangeEcho = document.getElementById('gym-evo-range-echo');
        if (!container) return;

        container.innerHTML = '';
        if (rangeEcho) rangeEcho.textContent = period === 'month' ? 'Por mês' : 'Por semana';

        const exercises = window.GymModel.getAllUserExercises();
        const categories = window.GymModel.getAllExerciseCategories();
        const groups = {};
        categories.forEach(cat => { groups[cat] = []; });
        groups['Sem Categoria'] = [];

        exercises.forEach(ex => {
            const cat = (ex.category && ex.category !== 'Sem Categoria') ? ex.category : 'Sem Categoria';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(ex);
        });

        const categoryNames = Object.keys(groups)
            .filter(cat => groups[cat].length > 0)
            .sort((a, b) => {
                if (a === 'Sem Categoria') return 1;
                if (b === 'Sem Categoria') return -1;
                return a.localeCompare(b, 'pt-BR');
            });

        if (categoryNames.length === 0) {
            container.innerHTML = '<div class="gym-evo-empty">Nenhum exercício cadastrado ainda.</div>';
            return;
        }

        const periodLabelPrefix = period === 'month' ? 'Mês ' : 'Sem. ';

        categoryNames.forEach(cat => {
            const items = groups[cat];
            const isExpanded = !!this.evoExpandedCategories?.[cat];

            const catDiv = document.createElement('div');
            catDiv.className = 'gym-evo-category' + (isExpanded ? ' expanded' : '');

            const header = document.createElement('div');
            header.className = 'gym-evo-category-header';
            header.innerHTML = `
                <span class="gym-evo-category-arrow">▶</span>
                <span class="gym-evo-category-name">${cat}</span>
                <span class="gym-evo-category-count">${items.length}</span>
            `;
            header.onclick = () => this.toggleEvoCategory(cat);
            catDiv.appendChild(header);

            const itemsDiv = document.createElement('div');
            itemsDiv.className = 'gym-evo-category-items';

            items.forEach(ex => {
                itemsDiv.appendChild(this._renderEvoPeriodItem(ex, period, periodLabelPrefix));
            });

            catDiv.appendChild(itemsDiv);
            container.appendChild(catDiv);
        });
    },

    toggleEvoCategory: function(cat) {
        if (!this.evoExpandedCategories) this.evoExpandedCategories = {};
        this.evoExpandedCategories[cat] = !this.evoExpandedCategories[cat];
        if (this.evoMode === 'period') {
            this.renderEvolutionTreePeriod(this.evoPeriodType);
        } else {
            this.renderEvolutionTree(window.GymController._currentEvoDays());
        }
    },

    /**
     * Renderiza um exercício dentro da árvore no modo Semanal/Mensal: nome,
     * mini-gráfico de linha (base pontilhada = 1º bloco, curva = média de
     * cada bloco seguinte) e lista de marcos com delta vs. o bloco anterior.
     * Mais volume é sempre tratado como positivo (verde) — objetivo em
     * exercícios é sempre progressão.
     */
    _renderEvoPeriodItem: function(exercise, period, periodLabelPrefix) {
        const div = document.createElement('div');
        div.className = 'gym-evo-item';

        let unit;
        if (exercise.type === 'rep_weight') unit = 'kg vol.';
        else if (exercise.type === 'dur_weight') unit = 'kg·s vol.';
        else if (exercise.type === 'dur_no_weight') unit = 's vol.';
        else unit = 'kg';

        const groups = window.GymModel.getExerciseWeeklyMonthlyEvolution(exercise.id, period);

        if (groups.length < 2) {
            const msg = groups.length === 0 ? 'sem dados registrados' : 'dados insuficientes (mín. 2 períodos)';
            div.innerHTML = `
                <div class="gym-evo-item-row">
                    <span class="gym-evo-item-name">${exercise.name}</span>
                    <span class="gym-evo-delta no-data">${msg}</span>
                </div>
            `;
            return div;
        }

        const chartHTML = this._buildEvoPeriodChartSVG(groups, unit, periodLabelPrefix);
        const listHTML = this._buildEvoPeriodMilestonesList(groups, unit, periodLabelPrefix);

        div.innerHTML = `
            <div class="gym-evo-item-row">
                <span class="gym-evo-item-name">${exercise.name}</span>
            </div>
            <div class="gym-evo-period-section gym-evo-period-section-nested">
                <div class="gym-chart-box gym-evo-period-chart-mini">${chartHTML}</div>
                ${listHTML}
            </div>
        `;
        return div;
    },

    _renderEvoItem: function(exercise, progress) {
        const div = document.createElement('div');
        div.className = 'gym-evo-item';

        if (!progress) {
            div.innerHTML = `
                <div class="gym-evo-item-row">
                    <span class="gym-evo-item-name">${exercise.name}</span>
                    <span class="gym-evo-delta no-data">sem dados no período</span>
                </div>
            `;
            return div;
        }

        // Ambos "Repetições com Peso" e os tipos de Duração agora medem volume
        // acumulado (soma de todas as séries válidas), não um valor isolado —
        // o rótulo deixa isso explícito.
        let unit;
        if (exercise.type === 'rep_weight') unit = 'kg vol.';
        else if (exercise.type === 'dur_weight') unit = 'kg·s vol.';
        else if (exercise.type === 'dur_no_weight') unit = 's vol.';
        else unit = 'kg';
        const { startValue, currentValue, delta, pct, status, isSingleRecord, startDate, currentDate } = progress;

        let deltaHTML;
        if (isSingleRecord) {
            deltaHTML = `<span class="gym-evo-delta null">único registro no período</span>`;
        } else if (status === 'positive') {
            deltaHTML = `<span class="gym-evo-delta positive">▲ +${this._fmtNum(delta)}${unit} (+${pct.toFixed(0)}%)</span>`;
        } else if (status === 'negative') {
            deltaHTML = `<span class="gym-evo-delta negative">▼ ${this._fmtNum(delta)}${unit} (${pct.toFixed(0)}%)</span>`;
        } else {
            deltaHTML = `<span class="gym-evo-delta null">◆ sem variação (0%)</span>`;
        }

        const maxVal = Math.max(startValue, currentValue, 1);
        const startPct = Math.max(6, (startValue / maxVal) * 100);
        const currentPct = Math.max(6, (currentValue / maxVal) * 100);
        const statusClass = isSingleRecord ? 'null' : status;

        div.innerHTML = `
            <div class="gym-evo-item-row">
                <span class="gym-evo-item-name">${exercise.name}</span>
                ${deltaHTML}
            </div>
            <div class="gym-evo-bars">
                <div class="gym-evo-bar-track">
                    <div class="gym-evo-bar-bg"><div class="gym-evo-bar-fill start" style="width:${startPct}%"></div></div>
                    <div class="gym-evo-bar-value">${this._fmtNum(startValue)}<span style="opacity:0.6">${unit}</span></div>
                </div>
                <div class="gym-evo-bar-track">
                    <div class="gym-evo-bar-bg"><div class="gym-evo-bar-fill current ${statusClass}" style="width:${currentPct}%"></div></div>
                    <div class="gym-evo-bar-value"><strong>${this._fmtNum(currentValue)}</strong><span style="opacity:0.6">${unit}</span></div>
                </div>
            </div>
            <div class="gym-evo-period">${this._formatEvoDate(startDate)} → ${this._formatEvoDate(currentDate)}</div>
        `;
        return div;
    },

    /**
     * Constrói o SVG do mini-gráfico de linha de um exercício no modo
     * Semanal/Mensal: linha base pontilhada no valor do primeiro bloco +
     * curva sólida ligando a média de cada bloco seguinte.
     */
    _buildEvoPeriodChartSVG: function(groups, unit, periodLabelPrefix) {
        const w = 400, h = 170;
        const padL = 46, padR = 12, padT = 16, padB = 28;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        const baseline = groups[0].avgValue;
        const vals = groups.map(g => g.avgValue);
        let minV = Math.min(...vals, baseline);
        let maxV = Math.max(...vals, baseline);
        const range = (maxV - minV) || 1;
        minV -= range * 0.15;
        maxV += range * 0.15;
        const span = maxV - minV;

        const xAt = (i) => padL + (groups.length <= 1 ? 0 : (i / (groups.length - 1)) * plotW);
        const yAt = (v) => padT + plotH - ((v - minV) / span) * plotH;

        const baselineY = yAt(baseline);

        let gridLines = '';
        [0, 0.5, 1].forEach(frac => {
            const y = padT + plotH * frac;
            const val = maxV - span * frac;
            gridLines += `<line class="chart-grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}"/>`;
            gridLines += `<text class="chart-axis-text" x="${padL-6}" y="${(y+3).toFixed(1)}" style="text-anchor:end;">${this._fmtNum(val)}</text>`;
        });

        const points = groups.map((g, i) => `${xAt(i).toFixed(1)},${yAt(g.avgValue).toFixed(1)}`).join(' ');

        let dots = groups.map((g, i) => {
            const isLast = i === groups.length - 1;
            return `<circle class="gym-evo-period-dot${isLast ? ' is-last' : ''}" cx="${xAt(i).toFixed(1)}" cy="${yAt(g.avgValue).toFixed(1)}" r="${isLast ? 5 : 4}"><title>${periodLabelPrefix}${i+1}: ${this._fmtNum(g.avgValue)}${unit}</title></circle>`;
        }).join('');

        let xLabels = groups.map((g, i) => {
            const isLast = i === groups.length - 1;
            const label = isLast ? 'Agora' : (periodLabelPrefix + (i + 1));
            const showEvery = groups.length > 8 ? Math.ceil(groups.length / 6) : 1;
            if (!isLast && i % showEvery !== 0) return '';
            return `<text class="chart-axis-text" x="${xAt(i).toFixed(1)}" y="${h - 8}">${label}</text>`;
        }).join('');

        return `
            <svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="none">
                ${gridLines}
                <line class="gym-evo-period-baseline" x1="${padL}" y1="${baselineY.toFixed(1)}" x2="${w-padR}" y2="${baselineY.toFixed(1)}"/>
                <polyline class="gym-evo-period-trend" points="${points}"/>
                ${dots}
                ${xLabels}
            </svg>
            <div class="gym-evo-period-legend">
                <span class="gym-evo-period-legend-item"><span class="gym-evo-period-swatch baseline"></span>1º Período (${this._fmtNum(baseline)}${unit})</span>
                <span class="gym-evo-period-legend-item"><span class="gym-evo-period-swatch trend"></span>Evolução Real</span>
            </div>
        `;
    },

    /**
     * Constrói a lista de marcos de um exercício no modo Semanal/Mensal: uma
     * linha por período (a partir do segundo, já que o primeiro é a base sem
     * delta), com o volume médio do período e o delta vs. o período anterior.
     */
    _buildEvoPeriodMilestonesList: function(groups, unit, periodLabelPrefix) {
        let rows = '';
        for (let i = 1; i < groups.length; i++) {
            const g = groups[i];
            const isLast = i === groups.length - 1;
            const fromLabel = periodLabelPrefix + i;
            const toLabel = isLast ? 'Agora' : periodLabelPrefix + (i + 1);

            const delta = g.delta;
            const sign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
            // Mais volume é sempre positivo (verde) para exercícios — objetivo é sempre progressão
            const cls = Math.abs(delta) < 0.01 ? 'null' : (delta > 0 ? 'positive' : 'negative');

            rows += `
                <div class="gym-evo-period-row${isLast ? ' is-current' : ''}">
                    <span class="gym-evo-period-date">${fromLabel} → ${toLabel}</span>
                    <span class="gym-evo-period-value">${this._fmtNum(g.avgValue)}${unit}</span>
                    <span class="gym-evo-period-delta ${cls}">${sign}${this._fmtNum(Math.abs(delta))}${unit}</span>
                </div>
            `;
        }
        return `<div class="gym-evo-period-list">${rows}</div>`;
    },

    _fmtNum: function(n) {
        return Number.isInteger(n) ? n : parseFloat(n.toFixed(1));
    }
};
