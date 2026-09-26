/**
 * GYM-CONTROLLER.JS
 * Orquestrador do Módulo Iron Forge.
 * VERSÃO: V7.1 - LEAN EDITION (SEM XP)
 * Alterações: Removido o Juramento (modal de bônus de XP ao final do exercício)
 * e todo o disparo/lógica associada. Mantidos: Fase (agora só anotação), Cardio
 * Híbrido (Timer + HIT), fluxo de sessão, rotinas e histórico.
 * V7.1: Implementado o botão "⚙️ Config" (Configurações da Academia), que tinha
 * o modal e o formulário prontos no HTML mas nenhum listener conectado a eles.
 */

window.GymController = {

    sessionInterval: null,
    restInterval: null,
    currentRoutineEditing: null, // ID da rotina sendo editada
    currentSetEditing: null,     // { exIndex, setIndex } para o modal de tipo de série
    exercisePickerMode: 'routine', // 'routine' | 'session' — para onde vai o exercício escolhido no modal "Adicionar Exercício"

    /**
     * Inicialização e Bindings.
     */
    init: function() {
        console.log("[GymController] Motor V7.1 (Lean Edition) Ativado.");

        if (window.GymView) {
            window.GymView.init('gym-container');
        }

        document.addEventListener('SiteC_DataReady', () => {
            if (window.GymModel && window.GymModel.init) {
                window.GymModel.init();
            }
            this.render();
            this._setupEventListeners();
        });

        document.addEventListener('SiteC_NavigationChanged', (e) => {
            if (e.detail.app === 'gym') {
                this.render();
                this._resumeTimers();
            } else {
                clearInterval(this.sessionInterval);
            }
        });
    },

    /**
     * Configuração dos Ouvintes de Eventos do DOM.
     */
    _setupEventListeners: function() {
        // 1. Listeners de Rotinas e Exercícios
        const formRoutine = document.getElementById('form-gym-routine');
        if (formRoutine) {
            formRoutine.onsubmit = (e) => {
                e.preventDefault();
                const name = document.getElementById('routine-name').value;
                window.GymModel.createRoutine(name);
                window.GymView.toggleModal('modal-gym-routine', false);
                formRoutine.reset();
                this.render();
            };
        }

        const formEx = document.getElementById('form-gym-exercise-create');
        if (formEx) {
            formEx.onsubmit = (e) => {
                e.preventDefault();
                const name = document.getElementById('gym-ex-name').value;
                const type = document.getElementById('gym-ex-type').value;
                const category = document.getElementById('gym-ex-category').value;
                window.GymModel.createExercise(name, type, 60, category);
                window.GymView.toggleModal('modal-gym-exercise-create', false);
                formEx.reset();
                this._refreshGymCategoryOptions();

                if (this.currentRoutineEditing) {
                    if (!document.getElementById('modal-gym-exercises').classList.contains('hidden')) {
                        this.renderExerciseList(window.GymModel.getAllUserExercises());
                    }
                }
            };
        }

        const formExEdit = document.getElementById('form-gym-exercise-edit');
        if (formExEdit) {
            formExEdit.onsubmit = (e) => {
                e.preventDefault();
                this.saveExerciseEdit();
            };
        }

        document.getElementById('btn-cancel-ex-edit')?.addEventListener('click', () => {
            window.GymView.toggleModal('modal-gym-exercise-edit', false);
        });

        document.getElementById('btn-new-gym-category')?.addEventListener('click', () => {
            this.createGymCategoryOnly('gym-ex-category');
        });
        document.getElementById('btn-new-gym-category-edit')?.addEventListener('click', () => {
            this.createGymCategoryOnly('gym-ex-edit-category');
        });

        document.getElementById('btn-save-edit-routine')?.addEventListener('click', () => {
            const nameInput = document.getElementById('edit-routine-name');
            if (this.currentRoutineEditing && nameInput) {
                window.GymModel.renameRoutine(this.currentRoutineEditing, nameInput.value);
                window.GymView.toggleModal('modal-gym-routine-edit', false);
                this.render();
            }
        });

        // 2. Listeners do Modal de Tipo de Série
        document.getElementById('btn-select-warmup')?.addEventListener('click', () => {
            this.confirmSetType(true); // true = é aquecimento
        });

        document.getElementById('btn-select-valid')?.addEventListener('click', () => {
            this.confirmSetType(false); // false = é válida
        });

        document.getElementById('btn-cancel-set-type')?.addEventListener('click', () => {
            window.GymView.toggleModal('modal-gym-set-type', false);
            this.currentSetEditing = null;
        });

        document.getElementById('btn-delete-set-modal')?.addEventListener('click', () => {
            if (this.currentSetEditing) {
                const { exIndex, setIndex } = this.currentSetEditing;
                this.deleteSet(exIndex, setIndex);
            }
        });

        // 3. Fechamento Geral de Modais
        const closeSelectors = [
            { btn: 'btn-cancel-routine', modal: 'modal-gym-routine' },
            { btn: 'btn-cancel-ex-create', modal: 'modal-gym-exercise-create' },
            { btn: 'btn-cancel-exercise', modal: 'modal-gym-exercises' },
            { btn: 'btn-cancel-edit-routine', modal: 'modal-gym-routine-edit' },
            { btn: 'btn-close-chart', modal: 'modal-gym-chart' },
            { btn: 'btn-close-gym-evolution', modal: 'modal-gym-evolution' },
            { btn: 'btn-cancel-gym-settings', modal: 'modal-gym-settings' }
        ];

        closeSelectors.forEach(sel => {
            document.getElementById(sel.btn)?.addEventListener('click', () => {
                window.GymView.toggleModal(sel.modal, false);
            });
        });

        // 5. Evolução por Grupo Muscular
        document.getElementById('btn-gym-evolution')?.addEventListener('click', () => {
            this.openEvolutionModal();
        });

        const evoDaysInput = document.getElementById('gym-evo-days-input');
        if (evoDaysInput) {
            evoDaysInput.oninput = () => this._applyEvoDays();
        }

        document.querySelectorAll('.gym-days-presets button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (evoDaysInput) evoDaysInput.value = btn.dataset.days;
                this._applyEvoDays();
            });
        });

        // 6. Configurações da Academia (Ciclo de Treino)
        document.getElementById('btn-gym-settings')?.addEventListener('click', () => {
            this.openGymSettingsModal();
        });

        const formGymSettings = document.getElementById('form-gym-settings');
        if (formGymSettings) {
            formGymSettings.onsubmit = (e) => {
                e.preventDefault();
                this.saveGymSettings();
            };
        }

        // 4. Pesquisa e Atalhos
        const searchInput = document.getElementById('exercise-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = window.GymModel.getAllUserExercises().filter(ex =>
                    ex.name.toLowerCase().includes(term)
                );
                this.renderExerciseList(filtered);
            };
        }

        document.getElementById('btn-open-create-ex')?.addEventListener('click', () => {
            this._refreshGymCategoryOptions();
            window.GymView.toggleModal('modal-gym-exercise-create', true);
        });
    },

    render: function() {
        const session = window.GymModel.getActiveSession();

        if (session) {
            // Busca o último treino finalizado desta mesma rotina
            const history = window.GlobalApp.data.gym.history || [];
            const lastSession = history.slice().reverse().find(h => h.routineId === session.routineId);

            // Envia session atual e lastSession para a View fazer a comparação (Treino a Treino)
            if (window.GymView) window.GymView.renderActiveSession(session, lastSession);

            if (!this.sessionInterval) this._startWorkoutTimer();
        } else {
            if (window.GymView) window.GymView.render();
            clearInterval(this.sessionInterval);
            this.sessionInterval = null;
        }
    },

    // =========================================
    // 0. CONTROLE DE FASE (INFORMATIVO)
    // =========================================

    setGymPhase: function(phase) {
        if (window.SoundManager) window.SoundManager.play('click');

        if (!window.GlobalApp.data.gym.settings) window.GlobalApp.data.gym.settings = {};
        window.GlobalApp.data.gym.settings.currentPhase = phase;

        window.GlobalApp.saveData();
        this.render(); // Re-renderiza para atualizar UI do seletor
    },

    // =========================================
    // 0.5. CONFIGURAÇÕES DA ACADEMIA (CICLO DE TREINO)
    // =========================================

    openGymSettingsModal: function() {
        if (window.SoundManager) window.SoundManager.play('click');

        if (!window.GlobalApp.data.gym.settings) window.GlobalApp.data.gym.settings = {};
        const currentDay = window.GlobalApp.data.gym.settings.cycleDay || 1;

        const select = document.getElementById('gym-cycle-day');
        if (select) select.value = String(currentDay);

        window.GymView.toggleModal('modal-gym-settings', true);
    },

    saveGymSettings: function() {
        if (window.SoundManager) window.SoundManager.play('click');

        const select = document.getElementById('gym-cycle-day');
        const day = select ? parseInt(select.value, 10) || 1 : 1;

        if (!window.GlobalApp.data.gym.settings) window.GlobalApp.data.gym.settings = {};
        window.GlobalApp.data.gym.settings.cycleDay = day;
        window.GlobalApp.saveData();

        window.GymView.toggleModal('modal-gym-settings', false);
    },

    // =========================================
    // 1. LÓGICA DE TIPO DE SÉRIE
    // =========================================

    openSetTypeSelector: function(exIndex, setIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        this.currentSetEditing = { exIndex, setIndex };
        window.GymView.toggleModal('modal-gym-set-type', true);
    },

    confirmSetType: function(isWarmupTarget) {
        if (!this.currentSetEditing) return;

        const { exIndex, setIndex } = this.currentSetEditing;
        const session = window.GymModel.getActiveSession();

        if (session) {
            const set = session.exercises[exIndex].sets[setIndex];
            if (set.isWarmup !== isWarmupTarget) {
                window.GymModel.toggleSetWarmup(exIndex, setIndex);
            }
        }

        window.GymView.toggleModal('modal-gym-set-type', false);
        this.currentSetEditing = null;
        this.render();
    },

    // =========================================
    // 2. GESTÃO DE ROTINAS
    // =========================================

    openCreateRoutineModal: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymView.toggleModal('modal-gym-routine', true);
    },

    openEditRoutineModal: function(routineId) {
        if (window.SoundManager) window.SoundManager.play('click');
        this.currentRoutineEditing = routineId;
        window.GymView.renderEditRoutineList(routineId);
        window.GymView.toggleModal('modal-gym-routine-edit', true);
    },

    addExerciseToRoutine: function(routineId) {
        if (window.SoundManager) window.SoundManager.play('click');
        this.currentRoutineEditing = routineId;
        this.exercisePickerMode = 'routine';
        window.GymView.toggleModal('modal-gym-exercises', true);
        this.renderExerciseList(window.GymModel.getAllUserExercises());
    },

    // Abre o mesmo modal de seleção de exercícios, mas para adicionar direto
    // na sessão de treino que já está em andamento (não mexe na rotina salva).
    openAddExerciseToSessionModal: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        this.exercisePickerMode = 'session';
        window.GymView.toggleModal('modal-gym-exercises', true);
        this.renderExerciseList(window.GymModel.getAllUserExercises());
    },

    renderExerciseList: function(list) {
        const sorted = window.GlobalApp.applySortPreference(list, 'exercises', ex => ex.name);
        window.GymView.renderExerciseSelectionList(sorted, (exId) => {
            if (this.exercisePickerMode === 'session') {
                window.GymModel.addExerciseToActiveSession(exId);
            } else {
                window.GymModel.addExerciseToRoutine(this.currentRoutineEditing, exId);
            }
            // O modal permanece aberto de propósito, para permitir adicionar
            // vários exercícios em sequência sem precisar reabri-lo a cada um;
            // ele só fecha quando o usuário toca em "Fechar".
            this.render();
            if (this.exercisePickerMode === 'routine' && this.currentRoutineEditing) {
                window.GymView.renderEditRoutineList(this.currentRoutineEditing);
            }
        });
    },

    // =========================================
    // 2.5. EDIÇÃO DE EXERCÍCIO E CATEGORIAS (GRUPOS MUSCULARES)
    // =========================================

    _refreshGymCategoryOptions: function() {
        const datalist = document.getElementById('gym-category-options');
        if (!datalist) return;
        datalist.innerHTML = window.GymModel.getAllExerciseCategories()
            .map(cat => `<option value="${cat}"></option>`)
            .join('');
    },

    createGymCategoryOnly: async function(targetInputId) {
        const raw = await prompt('Nome do grupo muscular:', '');
        const name = raw?.trim();
        if (!name) return;

        const created = window.GymModel.createExerciseCategory(name);
        if (!created) { alert('Esse grupo já existe.'); return; }

        this._refreshGymCategoryOptions();
        const input = document.getElementById(targetInputId);
        if (input) input.value = name;
    },

    openEditExerciseModal: function(exerciseId) {
        if (window.SoundManager) window.SoundManager.play('click');
        const ex = window.GymModel.getExerciseById(exerciseId);
        if (!ex) return;

        this._refreshGymCategoryOptions();
        document.getElementById('gym-ex-edit-id').value = ex.id;
        document.getElementById('gym-ex-edit-name').value = ex.name;
        document.getElementById('gym-ex-edit-type').value = ex.type;
        document.getElementById('gym-ex-edit-category').value = (ex.category && ex.category !== 'Sem Categoria') ? ex.category : '';

        window.GymView.toggleModal('modal-gym-exercise-edit', true);
    },

    saveExerciseEdit: function() {
        const id = document.getElementById('gym-ex-edit-id').value;
        const name = document.getElementById('gym-ex-edit-name').value;
        const type = document.getElementById('gym-ex-edit-type').value;
        const category = document.getElementById('gym-ex-edit-category').value;

        window.GymModel.updateExercise(id, { name, type, category });
        window.GymView.toggleModal('modal-gym-exercise-edit', false);

        // Atualiza a lista de seleção se estiver visível
        if (!document.getElementById('modal-gym-exercises').classList.contains('hidden')) {
            this.renderExerciseList(window.GymModel.getAllUserExercises());
        }
    },

    // =========================================
    // 2.6. EVOLUÇÃO POR GRUPO MUSCULAR
    // =========================================

    openEvolutionModal: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymView.toggleModal('modal-gym-evolution', true);
        this._applyEvoDays();
    },

    _currentEvoDays: function() {
        const raw = document.getElementById('gym-evo-days-input')?.value.trim() ?? '';
        return raw === '' ? null : Math.max(1, parseInt(raw, 10) || 1);
    },

    _applyEvoDays: function() {
        const days = this._currentEvoDays();
        window.GymView.renderEvolutionTree(days);

        const presetButtons = document.querySelectorAll('.gym-days-presets button');
        presetButtons.forEach(b => {
            const bd = b.dataset.days;
            const matches = (bd === '' && days === null) || (bd !== '' && String(days) === bd);
            b.classList.toggle('active', matches);
        });
    },

    deleteRoutine: async function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Tem a certeza que deseja eliminar esta rotina?")) {
            const routines = window.GlobalApp.data.gym.routines;
            const idx = routines.findIndex(r => r.id === id);
            if (idx !== -1) routines.splice(idx, 1);
            window.GlobalApp.saveData();
            this.render();
        }
    },

    moveExerciseUp: function(routineId, index) {
        window.GymModel.moveExerciseUp(routineId, index);
        window.GymView.renderEditRoutineList(routineId);
    },

    moveExerciseDown: function(routineId, index) {
        window.GymModel.moveExerciseDown(routineId, index);
        window.GymView.renderEditRoutineList(routineId);
    },

    removeExerciseFromRoutine: async function(routineId, index) {
        if (await confirm("Remover este exercício da rotina?")) {
            window.GymModel.removeExerciseFromRoutine(routineId, index);
            window.GymView.renderEditRoutineList(routineId);
        }
    },

    // --- Reordenar / remover exercício NA SESSÃO ATIVA (treino em andamento) ---
    // Distintas das equivalentes de rotina acima: estas mexem só no treino de
    // agora, sem alterar a rotina salva.

    moveSessionExerciseUp: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (window.GymModel.moveSessionExerciseUp(exIndex)) this.render();
    },

    moveSessionExerciseDown: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (window.GymModel.moveSessionExerciseDown(exIndex)) this.render();
    },

    removeExerciseFromSession: async function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Remover este exercício do treino de hoje? As séries já marcadas dele serão perdidas.")) {
            window.GymModel.removeExerciseFromActiveSession(exIndex);
            this.render();
        }
    },

    // =========================================
    // 3. CONTROLE DE SESSÃO
    // =========================================

    startSession: function(routineId) {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymModel.startSession(routineId);
        this.render();
        this._startWorkoutTimer();
    },

    finishSession: async function() {
        if (window.SoundManager) window.SoundManager.play('click');

        const session = window.GymModel.getActiveSession();
        if (!session) return;

        // Verifica se há atividade (Musculação OU Corrida)
        const hasSets = session.exercises.some(ex => ex.sets && ex.sets.some(s => s.done));
        const hasRun = session.exercises.some(ex => ex.name === 'Corrida' && (ex.runDistance > 0 || (ex.sets && ex.sets.length > 0)));

        if (!hasSets && !hasRun) {
            if (!await confirm("Nenhuma atividade registrada. Finalizar treino?")) return;
        } else {
            if (!await confirm("Concluir treino e salvar histórico?")) return;
        }

        clearInterval(this.sessionInterval);

        window.GymModel.finishSession();

        if (window.SoundManager) window.SoundManager.play('click');

        this.render();
    },

    cancelSession: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Cancelar treino? O progresso não será salvo.")) {
            clearInterval(this.sessionInterval);
            window.GlobalApp.data.gym.activeSession = null;
            window.GlobalApp.saveData();
            this.render();
        }
    },

    // =========================================
    // 4. AÇÕES DE SÉRIE
    // =========================================

    toggleCheck: function(exIndex, setIndex) {
        const v1 = document.getElementById(`v1-${exIndex}-${setIndex}`).value.replace(',', '.');
        const v2 = document.getElementById(`v2-${exIndex}-${setIndex}`).value.replace(',', '.');
        const restVal = document.getElementById(`r-${exIndex}-${setIndex}`).value;

        if (!v1 || !v2) {
            alert("Preencha carga e repetições.");
            return;
        }

        if (window.SoundManager) window.SoundManager.play('click');

        const isChecked = window.GymModel.toggleSetCheck(exIndex, setIndex, v1, v2, restVal);
        window.GymView.toggleCheckVisual(exIndex, setIndex, isChecked);

        const session = window.GymModel.getActiveSession();
        if (session && window.GymView.updateExerciseProgress) {
            window.GymView.updateExerciseProgress(exIndex, session.exercises[exIndex].id);
        }

        if (isChecked) {
            const seconds = parseInt(restVal) || 60;
            this.startRestTimer(seconds);
        }
    },

    updateSetData: function(exIndex, setIndex) {
        const session = window.GymModel.getActiveSession();
        if (!session) return;

        const set = session.exercises[exIndex].sets[setIndex];
        set.val1 = document.getElementById(`v1-${exIndex}-${setIndex}`).value.replace(',', '.');
        set.val2 = document.getElementById(`v2-${exIndex}-${setIndex}`).value.replace(',', '.');
        set.rest = document.getElementById(`r-${exIndex}-${setIndex}`).value;

        window.GlobalApp.saveData();

        if (window.GymView.updateExerciseProgress) {
            window.GymView.updateExerciseProgress(exIndex, session.exercises[exIndex].id);
        }
    },

    addSetToExercise: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymModel.addSet(exIndex);
        this.render();
    },

    // Deletar Série
    deleteSet: async function(exIndex, setIndex) {
        if (window.SoundManager) window.SoundManager.play('click');

        if (await confirm("Tem certeza que deseja apagar esta série?")) {
            const session = window.GymModel.getActiveSession();
            if (session && session.exercises[exIndex] && session.exercises[exIndex].sets) {
                const exerciseId = session.exercises[exIndex].id;

                // Remove a série do array
                session.exercises[exIndex].sets.splice(setIndex, 1);

                // Recalcula o PR, caso a série apagada fosse o recorde atual
                window.GymModel._recalculateExercisePR(exerciseId);

                // Salva
                window.GlobalApp.saveData();

                // Fecha o modal pois a série não existe mais neste índice
                window.GymView.toggleModal('modal-gym-set-type', false);
                this.currentSetEditing = null;

                this.render();
            }
        }
    },

    updateExerciseNote: function(exId, note) {
        const ex = window.GymModel.getExerciseById(exId);
        if (ex) {
            ex.note = note;
            window.GlobalApp.saveData();
        }
    },

    updateExerciseGoal: function(exId, v1, v2) {
        const ex = window.GymModel.getExerciseById(exId);
        if (ex) {
            ex.goalV1 = v1.replace(',', '.');
            ex.goalV2 = v2.replace(',', '.');
            window.GlobalApp.saveData();

            const session = window.GymModel.getActiveSession();
            if (session && window.GymView.updateExerciseProgress) {
                session.exercises.forEach((sessionEx, index) => {
                    if (sessionEx.id === exId) {
                        window.GymView.updateExerciseProgress(index, exId);
                    }
                });
            }
        }
    },

    // =========================================
    // 5. TIMERS
    // =========================================

    _startWorkoutTimer: function() {
        if (this.sessionInterval) clearInterval(this.sessionInterval);
        this.sessionInterval = setInterval(() => {
            const session = window.GymModel.getActiveSession();
            if (!session) return clearInterval(this.sessionInterval);

            const diff = Math.floor((Date.now() - session.startTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2,'0');
            const s = (diff % 60).toString().padStart(2,'0');
            window.GymView.updateTimer(`${m}:${s}`);
        }, 1000);
    },

    startRestTimer: function(seconds) {
        if (this.restInterval) clearInterval(this.restInterval);

        let overlay = document.getElementById('rest-timer-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rest-timer-overlay';
            overlay.className = 'rest-timer-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';

        let remaining = seconds;
        const tick = () => {
            overlay.innerHTML = `
                <span style="font-size:0.65rem; opacity:0.8; letter-spacing:1px; font-weight:700;">DESCANSO</span>
                <div class="rest-timer-display">${remaining}s</div>
                <button onclick="window.GymController.stopRestTimer()"
                        style="background:none; border:none; color:rgba(255,255,255,0.7); text-decoration:underline; font-size:0.75rem; margin-top:8px; cursor:pointer;">
                    Pular
                </button>
            `;
            if (remaining <= 0) {
                this.stopRestTimer();
                if (window.SoundManager) window.SoundManager.play('click');
            }
            remaining--;
        };

        tick();
        this.restInterval = setInterval(tick, 1000);
    },

    stopRestTimer: function() {
        clearInterval(this.restInterval);
        const overlay = document.getElementById('rest-timer-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    _resumeTimers: function() {
        if (window.GymModel.getActiveSession()) this._startWorkoutTimer();
    },

    // =========================================
    // 6. HISTÓRICO
    // =========================================

    undoLog: async function(logId) {
        if (window.SoundManager) window.SoundManager.play('click');
        if (await confirm("Remover este registo do histórico?")) {
            window.GymModel.revertLog(logId);
            this.render();
        }
    },

    // =========================================
    // 7. MÓDULO DE CORRIDA HÍBRIDO
    // =========================================

    // Ações de HIT (Lista de intervalos)
    addHitInterval: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymModel.addSet(exIndex);
        this.render();
    },

    removeHitInterval: function(exIndex, setIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        const session = window.GymModel.getActiveSession();
        if (session && session.exercises[exIndex].sets[setIndex]) {
            session.exercises[exIndex].sets.splice(setIndex, 1);
            window.GlobalApp.saveData();
            this.render();
        }
    },

    updateHitTime: function(exIndex, setIndex, secondsToAdd) {
        if (window.SoundManager) window.SoundManager.play('click');

        const inputId = `hit-input-${exIndex}-${setIndex}`;
        const el = document.getElementById(inputId);
        const session = window.GymModel.getActiveSession();

        if (el && session) {
            let current = parseInt(el.value) || 0;
            let newVal = current + secondsToAdd;
            if (newVal < 0) newVal = 0;

            el.value = newVal;

            // Persiste no modelo
            const set = session.exercises[exIndex].sets[setIndex];
            set.val1 = newVal;
            window.GlobalApp.saveData();
        }
    },

    // Ações de Dashboard (Timer + Distância)
    toggleRunTimer: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymModel.toggleRunTimer(exIndex);
        this.render();
    },

    promptSetPR: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        const val = await prompt("Qual seu PR atual de distância? (Ex: 5 ou 5.5)");
        if (val) {
            window.GymModel.setRunningPR(val);
            this.render();
        }
    },

    addRunShortcut: function(exIndex, kmDelta) {
        if (window.SoundManager) window.SoundManager.play('click');
        const isNewPR = window.GymModel.addRunDistance(exIndex, kmDelta);
        if (isNewPR) {
            alert("🏆 NOVO RECORDE PESSOAL (PR) ALCANÇADO!");
        }
        this.render();
    },

    addRunManual: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        const el = document.getElementById(`run-manual-km-${exIndex}`);
        if (el) {
            const val = parseFloat(el.value);
            if (!isNaN(val) && val > 0) {
                window.GymModel.updateRunDistanceManual(exIndex, val);
                this.render();
            }
        }
    }
};

window.GymController.init();
