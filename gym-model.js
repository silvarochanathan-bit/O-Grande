/**
 * GYM-MODEL.JS (V56 - MUSCLE MEMORY & PERSISTENCE)
 * Cérebro do Módulo Iron Forge.
 * Novidades: Pré-carregamento de cargas/aquecimento do último treino e robustez de dados.
 */

window.GymModel = {

    config: {
        xpPerSet: 15,          // XP Série Válida
        xpPerWarmup: 5,        // XP Série de Aquecimento
        xpPerFinish: 100,      // Bônus Final
        defaultRest: 60,
        types: {
            REP_WEIGHT: 'rep_weight',
            REP_NO_WEIGHT: 'rep_no_weight',
            DUR_WEIGHT: 'dur_weight',
            DUR_NO_WEIGHT: 'dur_no_weight'
        }
    },

    init: function() {
        if (!window.GlobalApp || !window.GlobalApp.data) return;

        const d = window.GlobalApp.data;
        if (!d.gym) d.gym = {};
        
        if (!d.gym.userExercises) d.gym.userExercises = [];
        if (!d.gym.routines) d.gym.routines = [];
        if (!d.gym.history) d.gym.history = [];
        if (!d.gym.xpLogs) d.gym.xpLogs = [];
        if (!d.gym.prs) d.gym.prs = {};
        if (!d.gym.activeSession) d.gym.activeSession = null;

        console.log("[GymModel] V56 (Muscle Memory) Inicializado.");
    },

    // =========================================
    // 1. REPOSITÓRIO & ROTINAS
    // =========================================

    createExercise: function(name, type, restTime) {
        const newEx = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            type: type,
            defaultRest: parseInt(restTime) || this.config.defaultRest,
            createdAt: new Date().toISOString()
        };
        window.GlobalApp.data.gym.userExercises.push(newEx);
        window.GlobalApp.saveData();
        return newEx;
    },

    getExerciseById: function(id) {
        return (window.GlobalApp.data.gym.userExercises || []).find(ex => ex.id === id);
    },

    getAllUserExercises: function() {
        return window.GlobalApp.data.gym.userExercises || [];
    },

    // --- Gestão de Rotinas ---

    createRoutine: function(name) {
        const newRoutine = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            exercises: [],
            createdAt: new Date().toISOString()
        };
        window.GlobalApp.data.gym.routines.push(newRoutine);
        window.GlobalApp.saveData();
        return newRoutine;
    },

    getAllRoutines: function() {
        return window.GlobalApp.data.gym.routines || [];
    },

    getRoutineById: function(id) {
        return window.GlobalApp.data.gym.routines.find(r => r.id === id);
    },

    addExerciseToRoutine: function(routineId, exerciseId) {
        const routine = this.getRoutineById(routineId);
        if (routine) {
            routine.exercises.push(exerciseId);
            window.GlobalApp.saveData();
        }
    },

    renameRoutine: function(routineId, newName) {
        const routine = this.getRoutineById(routineId);
        if (routine) {
            routine.name = newName;
            window.GlobalApp.saveData();
        }
    },

    removeExerciseFromRoutine: function(routineId, index) {
        const routine = this.getRoutineById(routineId);
        if (routine && routine.exercises[index]) {
            routine.exercises.splice(index, 1);
            window.GlobalApp.saveData();
        }
    },

    moveExerciseUp: function(routineId, index) {
        const routine = this.getRoutineById(routineId);
        if (routine && index > 0) {
            const temp = routine.exercises[index];
            routine.exercises[index] = routine.exercises[index - 1];
            routine.exercises[index - 1] = temp;
            window.GlobalApp.saveData();
        }
    },

    moveExerciseDown: function(routineId, index) {
        const routine = this.getRoutineById(routineId);
        if (routine && index < routine.exercises.length - 1) {
            const temp = routine.exercises[index];
            routine.exercises[index] = routine.exercises[index + 1];
            routine.exercises[index + 1] = temp;
            window.GlobalApp.saveData();
        }
    },

    // =========================================
    // 2. SESSÃO ATIVA (COM MEMÓRIA MUSCULAR)
    // =========================================

    /**
     * V56: Busca histórico para pré-preencher a sessão.
     */
    startSession: function(routineId) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;

        const session = {
            id: window.GlobalApp.generateUUID(),
            routineName: routine.name,
            startTime: Date.now(),
            exercises: routine.exercises.map(exId => {
                const exRef = this.getExerciseById(exId);
                const defaultRest = exRef ? exRef.defaultRest : this.config.defaultRest;
                const type = exRef ? exRef.type : 'rep_weight';
                
                // --- LÓGICA DE MEMÓRIA MUSCULAR ---
                // Busca as séries do último treino deste exercício específico
                const lastSets = this._getLastSetsForExercise(exId);
                let setsToUse = [];

                if (lastSets && lastSets.length > 0) {
                    // Copia a estrutura do último treino (resetando o 'done')
                    setsToUse = lastSets.map((s, idx) => ({
                        id: idx + 1,
                        val1: s.val1,       // Carga anterior
                        val2: s.val2,       // Reps anteriores
                        rest: s.rest || defaultRest, // Descanso customizado anterior
                        isWarmup: s.isWarmup || false, // Status de aquecimento anterior
                        done: false
                    }));
                } else {
                    // Padrão se nunca treinou: 3 séries vazias
                    setsToUse = [
                        { id: 1, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false },
                        { id: 2, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false },
                        { id: 3, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false }
                    ];
                }

                return {
                    id: exId,
                    name: exRef ? exRef.name : "Exercício Removido",
                    type: type,
                    sets: setsToUse
                };
            })
        };

        window.GlobalApp.data.gym.activeSession = session;
        window.GlobalApp.saveData();
        return session;
    },

    getActiveSession: function() {
        return window.GlobalApp.data.gym.activeSession;
    },

    /**
     * Helper Privado: Varre o histórico de trás para frente procurando o exercício.
     */
    _getLastSetsForExercise: function(exerciseId) {
        const history = window.GlobalApp.data.gym.history || [];
        // Itera do mais recente para o mais antigo
        for (let i = history.length - 1; i >= 0; i--) {
            const session = history[i];
            const exData = session.exercises.find(e => e.id === exerciseId);
            // Retorna apenas se tiver séries válidas
            if (exData && exData.sets && exData.sets.length > 0) {
                return exData.sets;
            }
        }
        return null;
    },

    // =========================================
    // 3. AÇÕES DE SÉRIE
    // =========================================

    toggleSetWarmup: function(exIndex, setIndex) {
        const session = this.getActiveSession();
        if (!session) return false;
        const set = session.exercises[exIndex].sets[setIndex];
        
        if (set.done) {
            set.done = false; 
            this._revertLastLogForExercise(session.exercises[exIndex].name);
        }

        set.isWarmup = !set.isWarmup;
        window.GlobalApp.saveData();
        return set.isWarmup;
    },

    toggleSetCheck: function(exIndex, setIndex, val1, val2, restVal) {
        const session = window.GlobalApp.data.gym.activeSession;
        if (!session) return null;

        const exercise = session.exercises[exIndex];
        const set = exercise.sets[setIndex];
        
        set.val1 = val1;
        set.val2 = val2;
        set.rest = parseInt(restVal) || this.config.defaultRest;
        set.done = !set.done;

        const xpAmount = set.isWarmup ? this.config.xpPerWarmup : this.config.xpPerSet;

        if (set.done) {
            const suffix = set.isWarmup ? " (Aquecimento)" : "";
            const logDetail = `Série ${setIndex + 1}${suffix}: ${val1}/${val2}`;
            
            this.addGymLog(exercise.name, logDetail, xpAmount);
            
            if (xpAmount > 0) {
                window.XPManager.gainXP(xpAmount, `Academia: ${exercise.name}`, { type: 'gym' });
            }
            
            if (!set.isWarmup) {
                this._updateExercisePR(exercise.id, parseFloat(val1), parseInt(val2));
            }
        } else {
            this._revertLastLogForExercise(exercise.name);
        }

        window.GlobalApp.saveData();
        return set.done;
    },

    /**
     * V56: Ao adicionar série, copia os dados da última série para agilizar.
     */
    addSet: function(exIndex) {
        const session = this.getActiveSession();
        if (!session) return;
        const ex = session.exercises[exIndex];
        
        let newSet = {
            id: ex.sets.length + 1, 
            val1: '', 
            val2: '', 
            rest: this.config.defaultRest, 
            done: false, 
            isWarmup: false 
        };

        // Copia dados da última série se existir
        if (ex.sets.length > 0) {
            const last = ex.sets[ex.sets.length - 1];
            newSet.val1 = last.val1;
            newSet.val2 = last.val2;
            newSet.rest = last.rest;
            newSet.isWarmup = last.isWarmup;
        }

        ex.sets.push(newSet);
        window.GlobalApp.saveData();
    },

    finishSession: function() {
        const session = window.GlobalApp.data.gym.activeSession;
        if (!session) return;
        
        session.endTime = Date.now();
        window.GlobalApp.data.gym.history.push(JSON.parse(JSON.stringify(session)));
        
        const finishXP = this.config.xpPerFinish;
        this.addGymLog("Treino Finalizado", session.routineName, finishXP);
        
        window.GlobalApp.data.gym.activeSession = null;
        window.GlobalApp.saveData();
    },

    // =========================================
    // 4. LOGS, ANALÍTICA & PRs
    // =========================================

    addGymLog: function(exName, detail, xp) {
        const log = {
            id: window.GlobalApp.generateUUID(),
            timestamp: Date.now(),
            date: window.GlobalApp.formatDate(new Date()),
            exerciseName: exName,
            detail: detail,
            xp: xp
        };
        if (!window.GlobalApp.data.gym.xpLogs) window.GlobalApp.data.gym.xpLogs = [];
        window.GlobalApp.data.gym.xpLogs.unshift(log);
    },

    /**
     * V56: Reforçado para garantir dados válidos ao gráfico.
     */
    getExerciseProgress: function(exerciseId) {
        const history = window.GlobalApp.data.gym.history || [];
        const progressData = [];

        history.forEach(session => {
            // Proteção contra sessões corrompidas
            if (!session.exercises) return;

            const exData = session.exercises.find(e => e.id === exerciseId);
            if (exData && exData.sets) {
                let bestVal = 0;
                exData.sets.forEach(s => {
                    // Ignora aquecimento e valores inválidos
                    if (!s.isWarmup && s.done) { 
                        const v = parseFloat(s.val1) || 0;
                        if (v > bestVal) bestVal = v;
                    }
                });
                
                if (bestVal > 0) {
                    progressData.push({
                        date: window.GlobalApp.formatDate(new Date(session.startTime)),
                        value: bestVal
                    });
                }
            }
        });

        // Retorna array vazio se não houver dados, para o View tratar
        return progressData.slice(-15); // Últimos 15 treinos
    },

    // Método legado para o display "Anterior" na tabela
    getLastLog: function(exerciseName) {
        const history = window.GlobalApp.data.gym.history || [];
        for (let i = history.length - 1; i >= 0; i--) {
            const workout = history[i];
            if (!workout.exercises) continue;
            
            const exData = workout.exercises.find(e => e.name === exerciseName);
            if (exData && exData.sets) {
                const validSets = exData.sets.filter(s => s.done && !s.isWarmup);
                if (validSets.length > 0) {
                    const last = validSets[validSets.length - 1];
                    return `${last.val1}/${last.val2}`;
                }
            }
        }
        return "-";
    },

    revertLog: function(logId) {
        const logs = window.GlobalApp.data.gym.xpLogs;
        const index = logs.findIndex(l => l.id === logId);
        if (index !== -1) {
            const log = logs[index];
            window.XPManager.gainXP(-log.xp, `Reversão: ${log.exerciseName}`, { forceFlat: true });
            logs.splice(index, 1);
            window.GlobalApp.saveData();
            return true;
        }
        return false;
    },

    _revertLastLogForExercise: function(exName) {
        const logs = window.GlobalApp.data.gym.xpLogs;
        const index = logs.findIndex(l => l.exerciseName === exName);
        if (index !== -1) {
            const log = logs[index];
            window.XPManager.gainXP(-log.xp, `Desmarcado: ${exName}`, { forceFlat: true });
            logs.splice(index, 1);
        }
    },

    _updateExercisePR: function(exerciseId, load, reps) {
        if (!window.GlobalApp.data.gym.prs) window.GlobalApp.data.gym.prs = {};
        const current = window.GlobalApp.data.gym.prs[exerciseId] || { load: 0, reps: 0 };
        if (load > current.load || (load === current.load && reps > current.reps)) {
            window.GlobalApp.data.gym.prs[exerciseId] = { load, reps };
        }
    }
};