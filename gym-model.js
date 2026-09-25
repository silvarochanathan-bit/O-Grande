/**
 * GYM-MODEL.JS
 * Cérebro do Módulo Iron Forge.
 * VERSÃO: V9.0 - LEAN EDITION (SEM XP)
 * Alterações: Removida toda a matemática de XP (Nível, Fase como multiplicador,
 * Nota Fiscal, Juramento/Bônus de Intensidade, Bônus de Completude, curva de XP
 * do cardio). Mantidos: rotinas, exercícios, séries (com aquecimento), memória
 * muscular (repete última série), PRs de carga e distância, cardio (timer +
 * distância), sequência (streak) de treinos e fase (cut/main/bulk) como anotação
 * informativa sem efeito nos números.
 */

window.GymModel = {

    config: {
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
        if (!d.gym.gymLogs) d.gym.gymLogs = [];
        if (!d.gym.prs) d.gym.prs = {};
        if (!d.gym.activeSession) d.gym.activeSession = null;

        // Categorias de exercício (grupos musculares), criadas manualmente
        if (!d.gym.exerciseCategories || !Array.isArray(d.gym.exerciseCategories)) {
            d.gym.exerciseCategories = [];
        }

        // Migração: garante categoria em exercícios já existentes
        d.gym.userExercises.forEach(ex => {
            if (!ex.category || typeof ex.category !== 'string' || !ex.category.trim()) {
                ex.category = 'Sem Categoria';
            }
        });
        
        // Fase (informativa, sem efeito matemático) e Streak
        if (!d.gym.settings) d.gym.settings = { currentPhase: 'main' }; // 'cut', 'main', 'bulk'
        if (!d.gym.streak) d.gym.streak = { current: 0, lastDate: null };

        console.log("[GymModel] V9.0 (Lean Edition) Inicializado.");
    },

    // =========================================
    // 0. HELPERS DE CONTEXTO (INFORMATIVOS)
    // =========================================

    getPhaseData: function() {
        const phase = window.GlobalApp.data.gym.settings.currentPhase || 'main';
        switch (phase) {
            case 'cut': return { label: "Cutting" };
            case 'main': return { label: "Manutenção" };
            case 'bulk': return { label: "Bulking" };
            default: return { label: "Padrão" };
        }
    },

    updateGymStreak: function() {
        // Chamado ao finalizar um treino
        const today = window.GlobalApp.getGameDate();
        const s = window.GlobalApp.data.gym.streak;
        
        if (s.lastDate === today) return; // Já contou hoje

        // Verifica se foi ontem (data anterior)
        const parts = today.split('-');
        const yesterday = new Date(parts[0], parts[1] - 1, parts[2]);
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

    createExercise: function(name, type, restTime, category) {
        const newEx = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            type: type,
            category: (category && category.trim()) || 'Sem Categoria',
            defaultRest: parseInt(restTime) || this.config.defaultRest,
            createdAt: new Date().toISOString()
        };
        window.GlobalApp.data.gym.userExercises.push(newEx);

        // Registra a categoria na lista manual, caso seja nova
        if (newEx.category !== 'Sem Categoria') {
            const cats = window.GlobalApp.data.gym.exerciseCategories;
            const exists = cats.some(c => c.toLowerCase() === newEx.category.toLowerCase());
            if (!exists) cats.push(newEx.category);
        }

        window.GlobalApp.saveData();
        return newEx;
    },

    updateExercise: function(id, { name, type, category }) {
        const ex = this.getExerciseById(id);
        if (!ex) return null;

        ex.name = name;
        ex.type = type;
        ex.category = (category && category.trim()) || 'Sem Categoria';

        if (ex.category !== 'Sem Categoria') {
            const cats = window.GlobalApp.data.gym.exerciseCategories;
            const exists = cats.some(c => c.toLowerCase() === ex.category.toLowerCase());
            if (!exists) cats.push(ex.category);
        }

        window.GlobalApp.saveData();
        return ex;
    },

    getExerciseById: function(id) {
        return (window.GlobalApp.data.gym.userExercises || []).find(ex => ex.id === id);
    },

    getAllUserExercises: function() {
        return window.GlobalApp.data.gym.userExercises || [];
    },

    // --- Gestão de Categorias de Exercício (Grupos Musculares) ---

    getAllExerciseCategories: function() {
        // Categorias manuais (podem estar vazias) + categorias usadas por exercícios, sem duplicar
        const manual = window.GlobalApp.data.gym.exerciseCategories || [];
        const fromExercises = this.getAllUserExercises()
            .map(ex => ex.category)
            .filter(c => c && c !== 'Sem Categoria');

        const set = new Set([...manual, ...fromExercises]);
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },

    createExerciseCategory: function(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return false;

        const exists = this.getAllExerciseCategories().some(c => c.toLowerCase() === trimmed.toLowerCase());
        if (exists) return false;

        window.GlobalApp.data.gym.exerciseCategories.push(trimmed);
        window.GlobalApp.saveData();
        return true;
    },

    renameExerciseCategory: function(oldName, newName) {
        const trimmed = (newName || '').trim();
        if (!trimmed || trimmed === oldName) return false;

        const exists = this.getAllExerciseCategories().some(c => c.toLowerCase() === trimmed.toLowerCase());
        if (exists) return false;

        const d = window.GlobalApp.data.gym;
        d.exerciseCategories = d.exerciseCategories.map(c => c === oldName ? trimmed : c);
        d.userExercises.forEach(ex => {
            if (ex.category === oldName) ex.category = trimmed;
        });

        window.GlobalApp.saveData();
        return true;
    },

    deleteExerciseCategory: function(name) {
        const d = window.GlobalApp.data.gym;
        d.exerciseCategories = d.exerciseCategories.filter(c => c !== name);
        // Exercícios dessa categoria voltam para "Sem Categoria" (não são apagados)
        d.userExercises.forEach(ex => {
            if (ex.category === name) ex.category = 'Sem Categoria';
        });
        window.GlobalApp.saveData();
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
     * Constrói o objeto de exercício como ele entra numa sessão (memória
     * muscular: reaproveita as séries do último treino desse exercício, ou
     * começa com 3 séries em branco se nunca foi feito). Compartilhado entre
     * startSession (rotina inteira) e addExerciseToActiveSession (um exercício
     * avulso, adicionado durante o treino já em andamento).
     */
    _buildSessionExercise: function(exId) {
        const exRef = this.getExerciseById(exId);
        const defaultRest = exRef ? exRef.defaultRest : this.config.defaultRest;
        const type = exRef ? exRef.type : 'rep_weight';

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

        const isRunningEx = exRef && exRef.name === 'Corrida';

        return {
            id: exId,
            name: exRef ? exRef.name : "Exercício Removido",
            type: type,
            sets: setsToUse,
            runDistance: isRunningEx ? 0 : null,
            targetPR: isRunningEx ? this.getRunningPR() : 0,
            runStartTime: null,
            runElapsedTime: 0,
            isRunning: false
        };
    },

    /**
     * Inicia uma sessão de treino, pré-preenchendo com base no histórico
     * (memória muscular) da última vez que este exercício foi feito.
     */
    startSession: function(routineId) {
        const routine = this.getRoutineById(routineId);
        if (!routine) return null;

        this.addGymLog("Check-in", "Início de Sessão");

        const session = {
            id: window.GlobalApp.generateUUID(),
            routineId: routine.id,
            routineName: routine.name,
            startTime: Date.now(),
            exercises: routine.exercises.map(exId => this._buildSessionExercise(exId))
        };

        window.GlobalApp.data.gym.activeSession = session;
        window.GlobalApp.saveData();
        return session;
    },

    /**
     * Adiciona um exercício avulso à sessão JÁ EM ANDAMENTO (não altera a
     * rotina original — é só para esse treino específico). Usa a mesma
     * memória muscular de startSession: vem preenchido com o último treino
     * desse exercício, ou 3 séries em branco se for a primeira vez.
     */
    addExerciseToActiveSession: function(exId) {
        const session = this.getActiveSession();
        if (!session) return false;

        session.exercises.push(this._buildSessionExercise(exId));
        window.GlobalApp.saveData();
        return true;
    },

    /**
     * Remove um exercício inteiro (com todas as suas séries) da sessão ativa.
     * Não afeta a rotina original nem o histórico já salvo.
     */
    removeExerciseFromActiveSession: function(exIndex) {
        const session = this.getActiveSession();
        if (!session || !session.exercises[exIndex]) return false;

        session.exercises.splice(exIndex, 1);
        window.GlobalApp.saveData();
        return true;
    },

    /**
     * Reordena exercícios dentro da sessão ativa (não afeta a rotina original).
     */
    moveSessionExerciseUp: function(exIndex) {
        const session = this.getActiveSession();
        if (!session || exIndex <= 0) return false;

        const arr = session.exercises;
        [arr[exIndex - 1], arr[exIndex]] = [arr[exIndex], arr[exIndex - 1]];
        window.GlobalApp.saveData();
        return true;
    },

    moveSessionExerciseDown: function(exIndex) {
        const session = this.getActiveSession();
        if (!session || exIndex >= session.exercises.length - 1) return false;

        const arr = session.exercises;
        [arr[exIndex], arr[exIndex + 1]] = [arr[exIndex + 1], arr[exIndex]];
        window.GlobalApp.saveData();
        return true;
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

        if (set.done) {
            const suffix = set.isWarmup ? " (Aquecimento)" : "";
            const logDetail = `Série ${setIndex + 1}${suffix}: ${val1}/${val2}`;
            this.addGymLog(exercise.name, logDetail);
        }

        // Recalcula o PR deste exercício do zero (cobre marcar E desmarcar)
        if (!set.isWarmup) {
            this._recalculateExercisePR(exercise.id);
        }

        window.GlobalApp.saveData();
        return set.done;
    },

    /**
     * Ao adicionar série, copia os dados da última série para agilizar.
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
    // 4. FINALIZAÇÃO
    // =========================================

    finishSession: function() {
        const session = window.GlobalApp.data.gym.activeSession;
        if (!session) return;
        
        session.endTime = Date.now();
        window.GlobalApp.data.gym.history.push(JSON.parse(JSON.stringify(session)));
        
        // Atualiza Streak
        this.updateGymStreak();

        this.addGymLog("Treino Finalizado", "Workout Complete");
        
        window.GlobalApp.data.gym.activeSession = null;
        window.GlobalApp.saveData();
    },

    // =========================================
    // 5. LOGS & ANALÍTICA
    // =========================================

    addGymLog: function(exName, detail) {
        const log = {
            id: window.GlobalApp.generateUUID(),
            timestamp: Date.now(),
            date: window.GlobalApp.getGameDate(),
            exerciseName: exName,
            detail: detail
        };
        if (!window.GlobalApp.data.gym.gymLogs) window.GlobalApp.data.gym.gymLogs = [];
        window.GlobalApp.data.gym.gymLogs.unshift(log);
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

    /**
     * Varre o histórico completo de um exercício, retornando para cada sessão
     * finalizada o timestamp real e a métrica de progresso daquela sessão,
     * somando SEMPRE todas as séries válidas (não-aquecimento, marcadas como
     * feitas) — nunca apenas a maior série isolada:
     *
     *   - rep_weight (repetições com peso): volume = Σ (carga × repetições).
     *     Ex.: 20kg×10 (válida) + 20kg×10 (válida) = 400.
     *   - dur_weight (duração com peso): volume = Σ (carga × segundos).
     *     val1 = carga (kg), val2 = tempo (segundos) nesse tipo.
     *   - dur_no_weight (duração sem peso): volume = Σ segundos.
     *     Não há carga para multiplicar, então soma-se só o tempo.
     *   - rep_no_weight (repetições, peso do corpo): mantém o comportamento
     *     anterior — maior valor de série — pois val1 (peso corporal) costuma
     *     ficar vazio/constante, então somar não agregaria informação real.
     */
    _getExerciseTimeSeries: function(exerciseId) {
        const history = window.GlobalApp.data.gym.history || [];
        const series = [];

        history.forEach(session => {
            if (!session.exercises || !session.startTime) return;
            const exData = session.exercises.find(e => e.id === exerciseId);
            if (!exData || !exData.sets) return;

            let sessionValue = 0;

            if (exData.type === 'rep_weight') {
                exData.sets.forEach(s => {
                    if (!s.isWarmup && s.done) {
                        const load = parseFloat(s.val1) || 0;
                        const reps = parseFloat(s.val2) || 0;
                        sessionValue += load * reps;
                    }
                });
            } else if (exData.type === 'dur_weight') {
                exData.sets.forEach(s => {
                    if (!s.isWarmup && s.done) {
                        const load = parseFloat(s.val1) || 0;
                        const seconds = parseFloat(s.val2) || 0;
                        sessionValue += load * seconds;
                    }
                });
            } else if (exData.type === 'dur_no_weight') {
                exData.sets.forEach(s => {
                    if (!s.isWarmup && s.done) {
                        sessionValue += parseFloat(s.val2) || 0;
                    }
                });
            } else {
                exData.sets.forEach(s => {
                    if (!s.isWarmup && s.done) {
                        const v = parseFloat(s.val1) || 0;
                        if (v > sessionValue) sessionValue = v;
                    }
                });
            }

            if (sessionValue > 0) {
                series.push({ timestamp: session.startTime, value: sessionValue });
            }
        });

        series.sort((a, b) => a.timestamp - b.timestamp);
        return series;
    },

    /**
     * Calcula a comparação início→atual de um exercício dentro de uma janela de dias
     * contada a partir de agora. days=null significa "todo o histórico" (sem limite).
     * Retorna null se não houver nenhum registro dentro da janela.
     */
    getExerciseProgressInRange: function(exerciseId, days) {
        const series = this._getExerciseTimeSeries(exerciseId);
        if (series.length === 0) return null;

        let windowStartMs = null;
        if (days !== null) {
            const now = Date.now();
            windowStartMs = now - (days - 1) * 24 * 60 * 60 * 1000;
            // Zera para o início do dia local, para "1 dia" cobrir o dia inteiro de hoje
            const d = new Date(windowStartMs);
            d.setHours(0, 0, 0, 0);
            windowStartMs = d.getTime();
        }

        const inWindow = windowStartMs === null
            ? series
            : series.filter(p => p.timestamp >= windowStartMs);

        if (inWindow.length === 0) return null;

        const startPoint = inWindow[0];
        const currentPoint = inWindow[inWindow.length - 1];
        const isSingleRecord = startPoint === currentPoint;

        const delta = currentPoint.value - startPoint.value;
        const pct = startPoint.value > 0 ? (delta / startPoint.value) * 100 : 0;

        let status;
        if (isSingleRecord || delta === 0) status = 'null';
        else if (delta > 0) status = 'positive';
        else status = 'negative';

        return {
            startValue: startPoint.value,
            currentValue: currentPoint.value,
            startDate: startPoint.timestamp,
            currentDate: currentPoint.timestamp,
            isSingleRecord,
            delta,
            pct,
            status
        };
    },

    /**
     * Monta a árvore de evolução: para cada categoria, a lista de exercícios com
     * sua comparação início/atual dentro da janela de dias informada. Exercícios
     * sem nenhum registro no período são incluídos com progress=null, para a View
     * poder mostrar "sem dados no período".
     */
    getEvolutionTree: function(days) {
        const exercises = this.getAllUserExercises();
        const categories = this.getAllExerciseCategories();
        const groups = {};

        categories.forEach(cat => { groups[cat] = []; });
        groups['Sem Categoria'] = [];

        exercises.forEach(ex => {
            const cat = (ex.category && ex.category !== 'Sem Categoria') ? ex.category : 'Sem Categoria';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({
                exercise: ex,
                progress: this.getExerciseProgressInRange(ex.id, days)
            });
        });

        return groups;
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
        const logs = window.GlobalApp.data.gym.gymLogs;
        const index = logs.findIndex(l => l.id === logId);
        if (index !== -1) {
            logs.splice(index, 1);
            window.GlobalApp.saveData();
            return true;
        }
        return false;
    },

    /**
     * Recalcula o PR (maior carga, com maior reps como critério de desempate) de um
     * exercício varrendo o histórico completo + a sessão ativa. Chamado sempre que
     * uma série é marcada, desmarcada ou apagada, para que o PR nunca fique
     * "preso" em um valor digitado por engano.
     */
    _recalculateExercisePR: function(exerciseId) {
        if (!window.GlobalApp.data.gym.prs) window.GlobalApp.data.gym.prs = {};

        let best = { load: 0, reps: 0 };

        const scanSets = (sets) => {
            if (!sets) return;
            sets.forEach(s => {
                if (s.isWarmup || !s.done) return;
                const load = parseFloat(s.val1) || 0;
                const reps = parseInt(s.val2) || 0;
                if (load > best.load || (load === best.load && reps > best.reps)) {
                    best = { load, reps };
                }
            });
        };

        const history = window.GlobalApp.data.gym.history || [];
        history.forEach(session => {
            const exData = session.exercises && session.exercises.find(e => e.id === exerciseId);
            if (exData) scanSets(exData.sets);
        });

        const activeSession = window.GlobalApp.data.gym.activeSession;
        if (activeSession) {
            const exData = activeSession.exercises.find(e => e.id === exerciseId);
            if (exData) scanSets(exData.sets);
        }

        if (best.load > 0) {
            window.GlobalApp.data.gym.prs[exerciseId] = best;
        } else {
            delete window.GlobalApp.data.gym.prs[exerciseId];
        }
    },

    // =========================================
    // 6. MÓDULO DE CORRIDA (CARDIO)
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

    addRunDistance: function(exIndex, kmDelta) {
        const session = this.getActiveSession();
        if (!session) return;
        const ex = session.exercises[exIndex];

        if (typeof ex.runDistance !== 'number') ex.runDistance = 0;
        
        // Atualiza Distância
        ex.runDistance += parseFloat(kmDelta);
        ex.runDistance = parseFloat(ex.runDistance.toFixed(3)); 

        const unit = kmDelta < 1 ? `${(kmDelta*1000).toFixed(0)}m` : `${kmDelta}km`;
        this.addGymLog("Cardio", `+${unit} (Total: ${ex.runDistance.toFixed(2)}km)`);

        // Verifica e Atualiza Global PR
        const globalPR = this.getRunningPR();
        const isNewPR = ex.runDistance > globalPR;
        if (isNewPR) {
            this.setRunningPR(ex.runDistance);
        }

        window.GlobalApp.saveData();
        return isNewPR;
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
