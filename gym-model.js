/**
 * GYM-MODEL.JS (V8.0 - CONTINUOUS CARDIO FUNCTION)
 * Cérebro do Módulo Iron Forge.
 * Novidades: Lógica de Cardio Baseada em Função Contínua (Cúbica/Linear),
 * garantindo integridade matemática independente da frequência de inputs.
 */

window.GymModel = {

    config: {
        xpPerSet: 15,          // XP Base (Mantido para fallback)
        xpPerWarmup: 5,        // XP Série de Aquecimento (Base)
        xpPerFinish: 100,      // Bônus Final (Base)
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
        
        // V5.9: Dados de Fase e Streak
        if (!d.gym.settings) d.gym.settings = { currentPhase: 'main' }; // 'cut', 'main', 'bulk'
        if (!d.gym.streak) d.gym.streak = { current: 0, lastDate: null };

        console.log("[GymModel] V8.0 (Continuous Cardio) Inicializado.");
    },

    // =========================================
    // 0. MATEMÁTICA DE CONTEXTO & HELPERS
    // =========================================

    getLevelMultiplier: function() {
        // Indexação por Nível: Garante que os valores cresçam com o usuário.
        // Se XPManager não existir, assume nível 1.
        const level = (window.GlobalApp.data.xp && window.GlobalApp.data.xp.level) || 1;
        return Math.max(1, level); // Mínimo 1x
    },

    getPhaseData: function() {
        const phase = window.GlobalApp.data.gym.settings.currentPhase || 'main';
        switch (phase) {
            case 'cut': return { val: 1.5, label: "Cutting" };
            case 'main': return { val: 1.2, label: "Manutenção" };
            case 'bulk': return { val: 1.0, label: "Bulking" };
            default: return { val: 1.0, label: "Padrão" };
        }
    },

    getStreakData: function() {
        const streak = window.GlobalApp.data.gym.streak.current || 0;
        if (streak >= 30) return { val: 1.5, label: "Mestre" };
        if (streak >= 15) return { val: 1.25, label: "Veterano" };
        if (streak >= 4) return { val: 1.1, label: "Consistente" };
        return { val: 1.0, label: "Iniciante" };
    },

    updateGymStreak: function() {
        // Chamado ao finalizar um treino
        const today = window.GlobalApp.formatDate(new Date());
        const s = window.GlobalApp.data.gym.streak;
        
        if (s.lastDate === today) return; // Já contou hoje

        // Verifica se foi ontem (data anterior)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = window.GlobalApp.formatDate(yesterday);

        if (s.lastDate === yesterdayStr) {
            s.current++;
        } else {
            s.current = 1; // Quebrou streak ou começou agora
        }
        s.lastDate = today;
        window.GlobalApp.saveData();
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
    // 2. SESSÃO ATIVA & CHECK-IN
    // =========================================

    /**
     * V56: Busca histórico para pré-preencher a sessão.
     */
    startSession: function(routineId) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;

        // --- NOTA FISCAL: CHECK-IN (V7.0) ---
        const lvl = this.getLevelMultiplier();
        const streakData = this.getStreakData();
        const baseVal = lvl * 10;
        const totalXP = parseFloat((baseVal * streakData.val).toFixed(1));

        const receipt = {
            title: "Check-in de Treino",
            sections: [
                {
                    title: "[1] CÁLCULO BASE",
                    rows: [{ label: `Nível (${lvl}) x 10 XP`, value: baseVal }]
                },
                {
                    title: "[2] MULTIPLICADORES",
                    rows: [{ label: `Consistência (Streak: ${streakData.label})`, value: `x ${streakData.val}` }]
                }
            ],
            total: totalXP
        };
        
        if (window.XPManager) {
            this.addGymLog("Check-in", "Início de Sessão", totalXP, receipt);
            window.XPManager.gainXP(totalXP, "🔥 Check-in", { type: 'gym' });
        }

        const session = {
            id: window.GlobalApp.generateUUID(),
            routineName: routine.name,
            startTime: Date.now(),
            exercises: routine.exercises.map(exId => {
                const exRef = this.getExerciseById(exId);
                const defaultRest = exRef ? exRef.defaultRest : this.config.defaultRest;
                const type = exRef ? exRef.type : 'rep_weight';
                
                // --- LÓGICA DE MEMÓRIA MUSCULAR ---
                const lastSets = this._getLastSetsForExercise(exId);
                let setsToUse = [];

                if (lastSets && lastSets.length > 0) {
                    setsToUse = lastSets.map((s, idx) => ({
                        id: idx + 1,
                        val1: s.val1,       
                        val2: s.val2,       
                        rest: s.rest || defaultRest, 
                        isWarmup: s.isWarmup || false, 
                        done: false
                    }));
                } else {
                    setsToUse = [
                        { id: 1, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false },
                        { id: 2, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false },
                        { id: 3, val1: '', val2: '', rest: defaultRest, done: false, isWarmup: false }
                    ];
                }

                // V8.0: Inicialização de Estado de Corrida (Contínuo)
                const isRunningEx = exRef && exRef.name === 'Corrida';

                return {
                    id: exId,
                    name: exRef ? exRef.name : "Exercício Removido",
                    type: type,
                    sets: setsToUse,
                    oathTaken: false, 
                    // Cardio Data
                    runDistance: isRunningEx ? 0 : null,
                    targetPR: isRunningEx ? this.getRunningPR() : 0, // Congela o PR da sessão
                    xpBaseAccumulated: 0, // Rastreia o XP Base já entregue
                    runStartTime: null,
                    runElapsedTime: 0,
                    isRunning: false
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
    // 3. AÇÕES DE SÉRIE (MUSCULAÇÃO)
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

        // --- NOTA FISCAL: CHECK DE SÉRIE (V7.0) ---
        const lvl = this.getLevelMultiplier();
        let xpAmount = 0;
        let receipt = {}; // Objeto da Nota

        if (set.isWarmup) {
            // Aquecimento: Nivel * 5
            xpAmount = parseFloat((lvl * 5).toFixed(1));
            receipt = {
                title: `${exercise.name} [Aquecimento]`,
                sections: [
                    {
                        title: "[1] CÁLCULO BASE",
                        rows: [{ label: `Nível (${lvl}) x 5 XP`, value: xpAmount }]
                    }
                ],
                total: xpAmount
            };
        } else {
            // Série Válida
            const pr = window.GlobalApp.data.gym.prs && window.GlobalApp.data.gym.prs[exercise.id];
            let baseXP = 10; 
            let perfType = "REGREDIU";
            let perfVal = "10 XP Base";

            const load = parseFloat(val1) || 0;
            const reps = parseInt(val2) || 0;

            if (pr) {
                const isHeavy = load > pr.load;
                const isMoreReps = load === pr.load && reps > pr.reps;
                const isMaintenance = load === pr.load && reps === pr.reps;
                const minReps = reps >= 6; 

                if ((isHeavy || (load === pr.load && isMoreReps)) && minReps) {
                    baseXP = 25; 
                    perfType = "SUPEROU PR"; 
                    perfVal = "25 XP Base";
                } else if (isMaintenance) {
                    baseXP = 15; 
                    perfType = "MANTEVE"; 
                    perfVal = "15 XP Base";
                }
            } else if (reps >= 6) {
                baseXP = 20; 
                perfType = "NOVO"; 
                perfVal = "20 XP Base";
            }

            // Multiplicadores
            const phaseD = this.getPhaseData();
            const mOrdem = 1 + (0.1 * setIndex);     
            const mAdapt = 1.0; 

            const calcBase = lvl * baseXP;
            xpAmount = parseFloat((calcBase * phaseD.val * mOrdem * mAdapt).toFixed(1));
            
            // Monta Receipt
            receipt = {
                title: `${exercise.name} [Série ${setIndex + 1}]`,
                sections: [
                    {
                        title: "[1] CÁLCULO BASE",
                        rows: [
                            { label: `Nível (${lvl}) x Base Performance`, value: calcBase },
                            { label: `(Performance: ${perfType} = ${perfVal})`, value: "", isSub: true }
                        ]
                    },
                    {
                        title: "[2] MULTIPLICADORES",
                        rows: [
                            { label: `Fase (${phaseD.label})`, value: `x ${phaseD.val.toFixed(2)}` },
                            { label: `Escada de Fadiga (Série ${setIndex + 1})`, value: `x ${mOrdem.toFixed(2)}` },
                            { label: "Adaptação (Ficha Nova)", value: "Inativo" }
                        ]
                    }
                ],
                total: xpAmount
            };
        }

        if (set.done) {
            const suffix = set.isWarmup ? " (Aquecimento)" : "";
            const logDetail = `Série ${setIndex + 1}${suffix}: ${val1}/${val2}`;
            
            this.addGymLog(exercise.name, logDetail, xpAmount, receipt);
            
            if (window.XPManager && xpAmount > 0) {
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

    // =========================================
    // 4. JURAMENTO & FINALIZAÇÃO
    // =========================================

    applyOathBonus: function(exerciseIndex) {
        const session = this.getActiveSession();
        if (!session) return 0;
        
        const ex = session.exercises[exerciseIndex];
        if (ex.oathTaken) return 0; // Já jurou

        // Calcula XP total gerado por este exercício até agora
        let totalExXP = 0;
        const logs = window.GlobalApp.data.gym.xpLogs || [];
        const todayStr = window.GlobalApp.formatDate(new Date());
        
        totalExXP = logs
            .filter(l => l.date === todayStr && l.exerciseName === ex.name)
            .reduce((acc, curr) => acc + curr.xp, 0);

        if (totalExXP <= 0) return 0;

        const bonus = parseFloat((totalExXP * 0.20).toFixed(1)); 
        
        ex.oathTaken = true;

        // --- NOTA FISCAL: JURAMENTO (V7.0) ---
        const receipt = {
            title: "Bônus de Intensidade",
            sections: [
                {
                    title: "[1] CÁLCULO BASE",
                    rows: [
                        { label: "XP Total do Exercício", value: totalExXP.toFixed(1) },
                        { label: "(Soma das séries realizadas)", value: "", isSub: true }
                    ]
                },
                {
                    title: "[2] MULTIPLICADORES",
                    rows: [
                        { label: "Juramento Solene (100%)", value: "x 0.20" }
                    ]
                }
            ],
            total: bonus
        };
        
        if (window.XPManager && bonus > 0) {
            this.addGymLog(ex.name, "Juramento Solene", bonus, receipt);
            window.XPManager.gainXP(bonus, `Juramento: ${ex.name}`, { type: 'gym' });
        }
        
        window.GlobalApp.saveData();
        return bonus;
    },

    finishSession: function() {
        const session = window.GlobalApp.data.gym.activeSession;
        if (!session) return;
        
        session.endTime = Date.now();
        window.GlobalApp.data.gym.history.push(JSON.parse(JSON.stringify(session)));
        
        // V5.9: Bônus de Completude (25% do XP Total do Treino)
        const logs = window.GlobalApp.data.gym.xpLogs || [];
        const todayStr = window.GlobalApp.formatDate(new Date());
        
        // Soma todo XP de GYM gerado hoje (Sets + Juramentos + Starts)
        const totalSessionXP = logs
            .filter(l => l.date === todayStr)
            .reduce((acc, curr) => acc + curr.xp, 0);

        const finishXP = parseFloat((totalSessionXP * 0.25).toFixed(1));
        
        // Atualiza Streak
        this.updateGymStreak();

        // --- NOTA FISCAL: COMPLETUDE (V7.0) ---
        const receipt = {
            title: "Finalização de Treino",
            sections: [
                {
                    title: "[1] CÁLCULO BASE",
                    rows: [
                        { label: "XP Acumulado na Sessão", value: totalSessionXP.toFixed(1) },
                        { label: "(Soma de Ferro + Cardio + Juramentos)", value: "", isSub: true }
                    ]
                },
                {
                    title: "[2] MULTIPLICADORES",
                    rows: [
                        { label: "Bônus de Completude (100%)", value: "x 0.25" }
                    ]
                }
            ],
            total: finishXP
        };

        // O XP é entregue AQUI, junto com o log.
        this.addGymLog("Treino Finalizado", "Workout Complete", finishXP, receipt);
        if (window.XPManager && finishXP > 0) {
            window.XPManager.gainXP(finishXP, "🏆 Treino Concluído!", { type: 'gym' });
        }
        
        window.GlobalApp.data.gym.activeSession = null;
        window.GlobalApp.saveData();
    },

    // =========================================
    // 4. LOGS, ANALÍTICA & PRs
    // =========================================

    addGymLog: function(exName, detail, xp, receiptObj) {
        const log = {
            id: window.GlobalApp.generateUUID(),
            timestamp: Date.now(),
            date: window.GlobalApp.formatDate(new Date()),
            exerciseName: exName,
            detail: detail,
            xp: xp,
            math: receiptObj || null // AGORA É UM OBJETO JSON
        };
        if (!window.GlobalApp.data.gym.xpLogs) window.GlobalApp.data.gym.xpLogs = [];
        window.GlobalApp.data.gym.xpLogs.unshift(log);
    },

    getExerciseProgress: function(exerciseId) {
        const history = window.GlobalApp.data.gym.history || [];
        const progressData = [];
        history.forEach(session => {
            if (!session.exercises) return;
            const exData = session.exercises.find(e => e.id === exerciseId);
            if (exData && exData.sets) {
                let bestVal = 0;
                exData.sets.forEach(s => {
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
        return progressData.slice(-15);
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
            if (window.XPManager) {
                window.XPManager.gainXP(-log.xp, `Reversão: ${log.exerciseName}`, { forceFlat: true });
            }
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
            if (window.XPManager) {
                window.XPManager.gainXP(-log.xp, `Desmarcado: ${exName}`, { forceFlat: true });
            }
            logs.splice(index, 1);
        }
    },

    _updateExercisePR: function(exerciseId, load, reps) {
        if (!window.GlobalApp.data.gym.prs) window.GlobalApp.data.gym.prs = {};
        const current = window.GlobalApp.data.gym.prs[exerciseId] || { load: 0, reps: 0 };
        if (load > current.load || (load === current.load && reps > current.reps)) {
            window.GlobalApp.data.gym.prs[exerciseId] = { load, reps };
        }
    },

    // =========================================
    // 5. MÓDULO DE CORRIDA: FUNÇÃO CONTÍNUA (V8.0)
    // =========================================

    setRunningPR: function(km) {
        if (!window.GlobalApp.data.gym.prs) window.GlobalApp.data.gym.prs = {};
        window.GlobalApp.data.gym.prs['running_distance'] = parseFloat(km);
        window.GlobalApp.saveData();
    },

    getRunningPR: function() {
        const prs = window.GlobalApp.data.gym.prs || {};
        return prs['running_distance'] || 0; 
    },

    // Timer Logic
    toggleRunTimer: function(exIndex) {
        const session = this.getActiveSession();
        if (!session) return false;
        const ex = session.exercises[exIndex];

        if (ex.isRunning) {
            ex.isRunning = false;
            ex.runElapsedTime += Date.now() - ex.runStartTime;
            ex.runStartTime = null;
        } else {
            ex.isRunning = true;
            ex.runStartTime = Date.now();
        }
        window.GlobalApp.saveData();
        return ex.isRunning;
    },

    /**
     * V8.0: Cálculo de Curva de XP Contínua (Cúbica -> Linear)
     * Retorna o XP Base Total (acumulado) para uma dada distância.
     */
    calculateTotalXPCurve: function(distance, pr, level) {
        const safePR = pr > 0 ? pr : 1; 
        const XP_Target_PR = 200 * level; 
        const XP_Per_Extra_Km = 100 * level;

        if (distance <= safePR) {
            // Fase 1: Cúbica (0 a PR)
            // Fórmula: Target * (d/PR)^3
            return XP_Target_PR * Math.pow(distance / safePR, 3);
        } else {
            // Fase 2: Linear (God Mode)
            // Fórmula: Target + ((d - PR)/1000 * 100 * L)  <-- Correção: Distância deve estar em KM se o input for KM
            // O input 'distance' aqui vem de runDistance (km). 'pr' é (km).
            // A fórmula da prova real usou (6000-5000)/1000. Isso assume metros.
            // Mas 'addRunDistance' soma 0.01, 1.0, etc. Isso é KM.
            // Logo: (distance - safePR) JÁ É o delta em km.
            return XP_Target_PR + ((distance - safePR) * XP_Per_Extra_Km);
        }
    },

    addRunDistance: function(exIndex, kmDelta) {
        const session = this.getActiveSession();
        if (!session) return;
        const ex = session.exercises[exIndex];

        if (typeof ex.runDistance !== 'number') ex.runDistance = 0;
        
        // 1. Atualiza Distância
        const oldDist = ex.runDistance;
        ex.runDistance += parseFloat(kmDelta);
        ex.runDistance = parseFloat(ex.runDistance.toFixed(3)); 

        // 2. Calcula Delta XP via Função Contínua (Acumulado Novo - Acumulado Velho)
        const lvl = this.getLevelMultiplier();
        // Usa o targetPR fixado no início da sessão para consistência da curva
        const pr = ex.targetPR || (ex.targetPR = 1); 
        
        const totalBaseXP = this.calculateTotalXPCurve(ex.runDistance, pr, lvl);
        const lastBaseXP = ex.xpBaseAccumulated || 0;
        
        const deltaBaseXP = totalBaseXP - lastBaseXP;
        
        // Atualiza acumulado
        ex.xpBaseAccumulated = totalBaseXP;

        // 3. Aplica Multiplicadores (Fase)
        const phaseD = this.getPhaseData();
        const xpToGrant = parseFloat((deltaBaseXP * phaseD.val).toFixed(1));

        // 4. Nota Fiscal & Grant
        if (xpToGrant > 0) {
            const unit = kmDelta < 1 ? `${(kmDelta*1000).toFixed(0)}m` : `${kmDelta}km`;
            const isGodMode = ex.runDistance > pr;
            const detailLabel = isGodMode ? `(Fase B: +${(ex.runDistance - pr).toFixed(2)}km God Mode)` : `(Fase A: Curva até PR de ${pr}km)`;

            const receipt = {
                title: `Cardio [${ex.runDistance.toFixed(2)}km]`,
                sections: [
                    {
                        title: "[1] CÁLCULO BASE",
                        rows: [
                            { label: "Função de Distância", value: deltaBaseXP.toFixed(1) },
                            { label: detailLabel, value: "", isSub: true }
                        ]
                    },
                    {
                        title: "[2] MULTIPLICADORES",
                        rows: [
                            { label: `Fase (${phaseD.label})`, value: `x ${phaseD.val.toFixed(2)}` },
                            { label: "Adaptação (Novo Hábito)", value: "Inativo" }
                        ]
                    }
                ],
                total: xpToGrant
            };

            this.addGymLog("Cardio", `+${unit}`, xpToGrant, receipt);
            if (window.XPManager) {
                window.XPManager.gainXP(xpToGrant, `Cardio: +${unit}`, { type: 'gym' });
            }
        }

        // 5. Verifica e Atualiza Global PR (Sem afetar a curva atual)
        const globalPR = this.getRunningPR();
        if (ex.runDistance > globalPR) {
            this.setRunningPR(ex.runDistance);
        }

        window.GlobalApp.saveData();
        return false; // Retorno padrão
    },

    updateRunDistanceManual: function(exIndex, newTotal) {
        const session = this.getActiveSession();
        if (!session) return;
        
        // Calcula a diferença para reutilizar a lógica de delta
        const current = session.exercises[exIndex].runDistance || 0;
        const delta = parseFloat(newTotal) - current;
        
        if (delta > 0) {
            this.addRunDistance(exIndex, delta);
        }
    }
};
