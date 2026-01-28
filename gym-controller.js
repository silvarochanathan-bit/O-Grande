/**
 * GYM-CONTROLLER.JS
 * O Maestro do Módulo Iron Forge.
 * VERSÃO: V3.1 (Correção de Inicialização Assíncrona)
 * Responsável por: Orquestrar input do usuário, gerenciar timers, 
 * disparar ganhos de XP e persistir dados da sessão.
 */

window.GymController = {

    // Estado da Sessão em RAM
    activeTimers: {}, // { exerciseId: intervalId }
    sessionXP: 0,
    
    init: function() {
        console.log("[GymController] Inicializando...");

        // 1. Configura Listeners PRIMEIRO
        document.addEventListener('SiteC_DataReady', () => {
            console.log("[GymController] Dados prontos detectados via evento.");
            this._onDataReady();
        });

        document.addEventListener('SiteC_NavigationChanged', (e) => {
            if (e.detail.app === 'gym') {
                this.render(); // Renderiza ao entrar na aba
            }
        });

        // 2. Inicializa Views (sem dependência de dados)
        if (window.GymView && window.GymView.init) window.GymView.init('gym-container');

        // 3. Verifica se os dados JÁ estão lá (caso o script carregue depois do evento)
        if (window.GlobalApp && window.GlobalApp.data) {
            console.log("[GymController] Dados já existiam na memória.");
            this._onDataReady();
        }
    },

    // Função interna segura para iniciar lógica que depende de dados
    _onDataReady: function() {
        // Agora é seguro chamar o Model, pois GlobalApp.data existe
        if (window.GymModel && window.GymModel.init) window.GymModel.init();
        
        this.loadActiveSession();
        this.render();
    },

    loadActiveSession: function() {
        // Segurança extra
        if (!window.GlobalApp.data) return;
        if (!window.GlobalApp.data.gym) window.GlobalApp.data.gym = {};

        // MOCKUP: Se não houver treino ativo, cria um EXEMPLO
        if (!window.GlobalApp.data.gym.activeWorkout) {
            console.log("[GymController] Criando treino de exemplo...");
            window.GlobalApp.data.gym.activeWorkout = [
                { 
                    id: 'ex_supino', 
                    name: 'Supino Reto', 
                    setsDone: 0, 
                    accumulatedXP: 0, 
                    isAdapt: false, 
                    timers: [90, 120, 120] 
                },
                { 
                    id: 'ex_agachamento', 
                    name: 'Agachamento Livre', 
                    setsDone: 0, 
                    accumulatedXP: 0, 
                    isAdapt: false, 
                    timers: [120, 180, 180] 
                },
                { 
                    id: 'ex_remada', 
                    name: 'Remada Curvada', 
                    setsDone: 0, 
                    accumulatedXP: 0, 
                    isAdapt: false, 
                    timers: [90, 90, 90] 
                }
            ];
            // Aplica XP de Start apenas na criação
            this.applyStartBonus();
            window.GlobalApp.saveData();
        }
    },

    render: function() {
        // Só renderiza se os dados existirem
        if (!window.GlobalApp.data || !window.GlobalApp.data.gym) return;

        if (window.GymView && window.GymView.render) {
            window.GymView.render();
        }
    },

    // --- 1. START & BONUS ---

    applyStartBonus: function() {
        const startXP = window.GymModel.calculateStartXP();
        window.XPManager.gainXP(startXP, "🔥 Início de Treino (Streak Bonus)");
        this.sessionXP += startXP;
    },

    toggleRestDay: function() {
        if (confirm("Marcar hoje como Descanso Planejado? (Mantém Streak)")) {
            const xp = Math.floor(window.GymModel.calculateStartXP() * 0.5); 
            window.XPManager.gainXP(xp, "💤 Descanso Planejado");
            
            window.GlobalApp.data.gym.streak = (window.GlobalApp.data.gym.streak || 0) + 1;
            window.GlobalApp.saveData();
            this.render();
        }
    },

    // --- 2. LOOP DO EXERCÍCIO (CHECK SET) ---

    checkSet: function(exerciseId) {
        if (window.SoundManager) window.SoundManager.play('click');

        const exercise = window.GlobalApp.data.gym.activeWorkout.find(ex => ex.id === exerciseId);
        if (!exercise) return;

        // 1. Coleta Inputs
        const loadInput = document.getElementById(`load-${exerciseId}`);
        const repsInput = document.getElementById(`reps-${exerciseId}`);
        
        if (!loadInput || !repsInput) return;

        const load = parseFloat(loadInput.value) || 0;
        const reps = parseInt(repsInput.value) || 0;

        if (load <= 0 || reps <= 0) {
            alert("Preencha carga e repetições válidas.");
            return;
        }

        // 2. Verifica Double Progression (Matemática)
        const progression = window.GymModel.checkDoubleProgression(exerciseId, load, reps);
        
        // 3. Calcula XP da Série
        const setIndex = exercise.setsDone; 
        const xp = window.GymModel.calculateSetXP(setIndex, progression.baseXP, exercise.isAdapt);

        // 4. Efeitos Colaterais (Feedback)
        const meta = window.GymModel.getStatusMeta(progression.status);
        
        let logMsg = `${exercise.name}: Série ${setIndex + 1}`;
        if (progression.isPR) logMsg += ` (${meta.label}!)`;
        
        window.XPManager.gainXP(xp, logMsg);
        
        // Atualiza Estado Local
        exercise.setsDone++;
        exercise.accumulatedXP = (exercise.accumulatedXP || 0) + xp;
        this.sessionXP += xp;

        // 5. Salva
        window.GlobalApp.saveData();

        // 6. Atualiza UI e Dispara Timer
        this.render(); 
        this.startTimer(exercise, setIndex);
    },

    toggleAdapt: function(exerciseId) {
        if (window.SoundManager) window.SoundManager.play('click');
        const exercise = window.GlobalApp.data.gym.activeWorkout.find(ex => ex.id === exerciseId);
        if (exercise) {
            exercise.isAdapt = !exercise.isAdapt;
            this.render();
        }
    },

    // --- 3. GERENCIAMENTO DE TIMER ---

    startTimer: function(exercise, setIndex) {
        if (this.activeTimers[exercise.id]) clearInterval(this.activeTimers[exercise.id]);

        const duration = window.GymModel.getTimerForSet(exercise, setIndex);
        let remaining = duration;

        window.GymView.updateTimerUI(exercise.id, remaining, duration);

        const intervalId = setInterval(() => {
            remaining--;
            
            const display = document.getElementById(`timer-display-${exercise.id}`);
            if (display) {
                window.GymView.updateTimerUI(exercise.id, remaining, duration);
            } else {
                clearInterval(this.activeTimers[exercise.id]);
                delete this.activeTimers[exercise.id];
                return;
            }

            if (remaining <= 0) {
                clearInterval(this.activeTimers[exercise.id]);
                delete this.activeTimers[exercise.id];
            }
        }, 1000);

        this.activeTimers[exercise.id] = intervalId;
    },

    // --- 4. FINALIZAÇÃO DE EXERCÍCIO (JURAMENTO) ---

    finishExercise: function(exerciseId) {
        if (window.SoundManager) window.SoundManager.play('click');
        const exercise = window.GlobalApp.data.gym.activeWorkout.find(ex => ex.id === exerciseId);
        if (!exercise) return;

        window.GymView.openOathModal(exercise.name, exercise.accumulatedXP, (confirmed) => {
            if (confirmed) {
                const bonus = Math.floor(exercise.accumulatedXP * 0.20);
                window.XPManager.gainXP(bonus, "🗡️ Bônus do Juramento");
                this.sessionXP += bonus;
            }
            
            window.GlobalApp.saveData();
            this.render();
        });
    },

    // --- 5. CARDIO EXPONENCIAL ---

    addCardio: function(amount) {
        if (window.SoundManager) window.SoundManager.play('click');

        if (!window.GlobalApp.data.gym.cardioSession) window.GlobalApp.data.gym.cardioSession = 0;
        window.GlobalApp.data.gym.cardioSession += amount;
        
        const currentDist = window.GlobalApp.data.gym.cardioSession;
        const prDist = window.GlobalApp.data.gym.cardioPR || 5000;

        const xp = window.GymModel.calculateCardioXP(currentDist, prDist);
        
        if (currentDist > prDist && !window.GlobalApp.data.gym.godModeTriggered) {
            const godBonus = window.GymModel.calculateGodModeBonus();
            window.XPManager.gainXP(godBonus, "🔥 GOD MODE: PR QUEBRADO!");
            window.GlobalApp.data.gym.godModeTriggered = true; 
        }

        window.XPManager.gainXP(xp, `🏃 Cardio (+${amount}m)`);
        window.GlobalApp.saveData();
        this.render();
    },

    // --- 6. FINALIZAR TREINO ---

    finishWorkout: function() {
        if (window.SoundManager) window.SoundManager.play('click');
        if (!confirm("Encerrar sessão e consolidar ganhos?")) return;

        const completionBonus = Math.floor(this.sessionXP * 0.25);
        if (completionBonus > 0) {
            window.XPManager.gainXP(completionBonus, "🏁 Sessão Finalizada (Bônus 25%)");
        }

        window.GlobalApp.data.gym.streak = (window.GlobalApp.data.gym.streak || 0) + 1;
        
        const currentCardio = window.GlobalApp.data.gym.cardioSession || 0;
        const oldCardioPR = window.GlobalApp.data.gym.cardioPR || 0;
        if (currentCardio > oldCardioPR) {
            window.GlobalApp.data.gym.cardioPR = currentCardio;
        }

        // Limpeza
        window.GlobalApp.data.gym.activeWorkout = null; 
        window.GlobalApp.data.gym.cardioSession = 0;
        window.GlobalApp.data.gym.godModeTriggered = false;
        
        this.sessionXP = 0;
        Object.values(this.activeTimers).forEach(clearInterval);
        this.activeTimers = {};

        window.GlobalApp.saveData();
        
        if (window.SoundManager) window.SoundManager.play('levelup');
        
        this.loadActiveSession(); // Cria novo treino (template)
        this.render();
    }
};

// Auto-inicialização
window.GymController.init();