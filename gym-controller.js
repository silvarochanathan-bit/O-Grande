/**
 * GYM-CONTROLLER.JS (V6.0 - HYBRID RUNNING CONTROL)
 * Orquestrador do Módulo Iron Forge.
 * Gerencia: Fase, Juramento, Cardio Híbrido (Timer + HIT) e Fluxo de Sessão.
 */

window.GymController = {

    sessionInterval: null,
    restInterval: null,
    currentRoutineEditing: null, // ID da rotina sendo editada
    currentSetEditing: null,     // { exIndex, setIndex } para o modal de tipo de série
    currentOathExerciseIndex: null, // Exercício aguardando juramento

    /**
     * Inicialização e Bindings.
     */
    init: function() {
        console.log("[GymController] Motor V6.0 (Hybrid Run) Ativado.");

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
                window.GymModel.createExercise(name, type, 60);
                window.GymView.toggleModal('modal-gym-exercise-create', false);
                formEx.reset();
                
                if (this.currentRoutineEditing) {
                    if (!document.getElementById('modal-gym-exercises').classList.contains('hidden')) {
                        this.renderExerciseList(window.GymModel.getAllUserExercises());
                    }
                }
            };
        }

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

        // 3. NOVO: Listeners do Modal de Juramento (V5.9)
        document.getElementById('btn-oath-yes')?.addEventListener('click', () => {
            this.handleOath(true);
        });
        
        document.getElementById('btn-oath-no')?.addEventListener('click', () => {
            this.handleOath(false);
        });

        // 4. Fechamento Geral de Modais
        const closeSelectors = [
            { btn: 'btn-cancel-routine', modal: 'modal-gym-routine' },
            { btn: 'btn-cancel-ex-create', modal: 'modal-gym-exercise-create' },
            { btn: 'btn-cancel-exercise', modal: 'modal-gym-exercises' },
            { btn: 'btn-cancel-edit-routine', modal: 'modal-gym-routine-edit' },
            { btn: 'btn-close-chart', modal: 'modal-gym-chart' }
        ];

        closeSelectors.forEach(sel => {
            document.getElementById(sel.btn)?.addEventListener('click', () => {
                window.GymView.toggleModal(sel.modal, false);
            });
        });

        // 5. Pesquisa e Atalhos
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
            window.GymView.toggleModal('modal-gym-exercise-create', true);
        });
    },

    render: function() {
        if (window.GymView) window.GymView.render();
    },

    // =========================================
    // 0. CONTROLE DE FASE (V5.9)
    // =========================================

    setGymPhase: function(phase) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        if (!window.GlobalApp.data.gym.settings) window.GlobalApp.data.gym.settings = {};
        window.GlobalApp.data.gym.settings.currentPhase = phase;
        
        window.GlobalApp.saveData();
        this.render(); // Re-renderiza para atualizar UI do seletor
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
        window.GymView.toggleModal('modal-gym-exercises', true);
        this.renderExerciseList(window.GymModel.getAllUserExercises());
    },

    renderExerciseList: function(list) {
        window.GymView.renderExerciseSelectionList(list, (exId) => {
            window.GymModel.addExerciseToRoutine(this.currentRoutineEditing, exId);
            window.GymView.toggleModal('modal-gym-exercises', false);
            this.render();
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

    removeExerciseFromRoutine: function(routineId, index) {
        if (confirm("Remover este exercício da rotina?")) {
            window.GymModel.removeExerciseFromRoutine(routineId, index);
            window.GymView.renderEditRoutineList(routineId);
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

        // V6.0: Verifica se há atividade (Musculação OU Corrida)
        const hasSets = session.exercises.some(ex => ex.sets && ex.sets.some(s => s.done));
        const hasRun = session.exercises.some(ex => ex.name === 'Corrida' && (ex.runDistance > 0 || (ex.sets && ex.sets.length > 0)));
        
        if (!hasSets && !hasRun) {
            if (!await confirm("Nenhuma atividade registrada. Finalizar treino?")) return;
        } else {
            if (!await confirm("Concluir treino e salvar histórico?")) return;
        }

        clearInterval(this.sessionInterval);
        
        // Model calcula Bônus de Completude e entrega XP
        window.GymModel.finishSession();
        
        if (window.SoundManager) window.SoundManager.play('levelup');

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
    // 4. AÇÕES DE SÉRIE & JURAMENTO
    // =========================================

    toggleCheck: function(exIndex, setIndex) {
        const v1 = document.getElementById(`v1-${exIndex}-${setIndex}`).value;
        const v2 = document.getElementById(`v2-${exIndex}-${setIndex}`).value;
        const restVal = document.getElementById(`r-${exIndex}-${setIndex}`).value;

        if (!v1 || !v2) {
            alert("Preencha carga e repetições.");
            return;
        }

        if (window.SoundManager) window.SoundManager.play('click');

        const isChecked = window.GymModel.toggleSetCheck(exIndex, setIndex, v1, v2, restVal);
        window.GymView.toggleCheckVisual(exIndex, setIndex, isChecked);

        if (isChecked) {
            const seconds = parseInt(restVal) || 60;
            this.startRestTimer(seconds);

            // V5.9: Verifica Gatilho do Juramento
            const session = window.GymModel.getActiveSession();
            const ex = session.exercises[exIndex];
            
            // Se for a última série E ainda não jurou
            if (setIndex === ex.sets.length - 1 && !ex.oathTaken) {
                this.currentOathExerciseIndex = exIndex;
                setTimeout(() => {
                    window.GymView.toggleModal('modal-gym-oath', true);
                }, 500); // Pequeno delay para UX
            }
        }
    },

    handleOath: function(accepted) {
        if (this.currentOathExerciseIndex === null) return;

        window.GymView.toggleModal('modal-gym-oath', false);

        if (accepted) {
            if (window.SoundManager) window.SoundManager.play('xp');
            const bonus = window.GymModel.applyOathBonus(this.currentOathExerciseIndex);
            if (bonus > 0) {
                alert(`🛡️ JURAMENTO ACEITO!\nBônus de Intensidade: +${bonus} XP`);
            }
        }

        this.currentOathExerciseIndex = null;
    },

    updateSetData: function(exIndex, setIndex) {
        const session = window.GymModel.getActiveSession();
        if (!session) return;
        
        const set = session.exercises[exIndex].sets[setIndex];
        set.val1 = document.getElementById(`v1-${exIndex}-${setIndex}`).value;
        set.val2 = document.getElementById(`v2-${exIndex}-${setIndex}`).value;
        set.rest = document.getElementById(`r-${exIndex}-${setIndex}`).value;
        
        window.GlobalApp.saveData();
    },

    addSetToExercise: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        window.GymModel.addSet(exIndex);
        this.render();
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
                if (window.SoundManager) window.SoundManager.play('xp');
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
        if (await confirm("Remover registo e estornar XP?")) {
            window.GymModel.revertLog(logId);
            this.render();
        }
    },

    // =========================================
    // 7. MÓDULO DE CORRIDA HÍBRIDO (V6.0)
    // =========================================

    // Ações de HIT (Lista) - RESTAURADAS
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

    // Ações de Dashboard (Timer + Distância) - NOVAS V6.0
    toggleRunTimer: function(exIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        const newState = window.GymModel.toggleRunTimer(exIndex);
        // Não renderiza tudo para não piscar, o timer roda via setInterval na View se necessário
        // Mas para atualizar o ícone Play/Pause:
        this.render(); 
    },

    promptSetPR: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        const val = prompt("Qual seu PR atual de distância? (Ex: 5 ou 5.5)");
        if (val) {
            window.GymModel.setRunningPR(val);
            this.render();
        }
    },

    addRunShortcut: function(exIndex, kmDelta) {
        if (window.SoundManager) window.SoundManager.play('click');
        const isGodMode = window.GymModel.addRunDistance(exIndex, kmDelta);
        if (isGodMode) {
            if (window.SoundManager) window.SoundManager.play('levelup');
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
