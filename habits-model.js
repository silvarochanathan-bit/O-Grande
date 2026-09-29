/**
 * HABITS-MODEL.JS
 * Lógica de Dados e Regras de Negócio para Hábitos.
 * VERSÃO: V7.1 - CALENDÁRIO DE 3 ESTADOS (VERDE/VERMELHO)
 * Alterações: completionLog agora guarda um estado por data em vez de um
 * booleano: 'done' (verde/feito), 'failed' (vermelho/não feito) ou ausente
 * (não marcado). O calendário cicla os 3 estados ao clicar em qualquer dia
 * (cycleCalendarDay). O check simples do dia (toggleCompletionOnDate) continua
 * só para o fluxo normal de hoje (marca/desmarca 'done'). A sequência atual e
 * o recorde continuam derivados do completionLog inteiro, respeitando a
 * frequência/padrão de cada hábito (dias de descanso não quebram a sequência).
 * Hábitos "Dependentes" (oportunidade) não têm agenda fixa, então sua
 * sequência conta apenas dias consecutivos com registro 'done'.
 */

window.HabitModel = {

    // --- 1. FILTRAGEM E VISIBILIDADE ---

    filterHabits: function(habits, timeFilter) {
        if (!habits) return [];
        return habits.filter(h => this.checkHabitVisibility(h, timeFilter));
    },

    checkHabitVisibility: function(habit, timeFilter) {
        // Se filtro for 'all', mostra tudo
        if (timeFilter === 'all') return true;

        // Se filtro for 'pending', mostra só o que não completou hoje (considerando dia da semana)
        if (timeFilter === 'pending') {
            const isToday = this.isHabitScheduledForToday(habit);
            return isToday && !habit.completedToday;
        }

        // Se filtro for 'today', mostra tudo agendado para hoje (feito ou não)
        if (timeFilter === 'today') {
            return this.isHabitScheduledForToday(habit);
        }

        return true;
    },

    isHabitScheduledForToday: function(habit) {
        // 1. Hábitos Dependentes (só aparecem se marcados como oportunidade)
        if (habit.isDependent) {
            return !!habit.opportunityToday; // Só exibe se foi desbloqueado
        }

        // Usa a Data do Jogo (Game Date) para respeitar a regra das 12h
        const gameDateStr = window.GlobalApp.getGameDate();
        const parts = gameDateStr.split('-');
        const gameDateObj = new Date(parts[0], parts[1] - 1, parts[2]);

        const dayOfWeek = gameDateObj.getDay(); // 0=Dom, 1=Seg...

        // 2. Frequência Semanal (Array de dias)
        if (habit.frequencyType === 'weekly') {
            // Se frequency for vazio e não for dependente, assume todos os dias (segurança)
            if (!habit.frequency || habit.frequency.length === 0) return true;
            // Verifica se o dia de hoje está no array de frequência (strings ou ints)
            return habit.frequency.some(d => parseInt(d) === dayOfWeek);
        }

        // 3. Padrão (X dias sim, Y dias não)
        if (habit.frequencyType === 'pattern') {
            const step = this.getPatternStep(habit);
            // Se o caractere no passo atual for '1', é dia de fazer. Se '0', folga.
            return habit.pattern && habit.pattern[step] === '1';
        }

        // Default (diário)
        return true;
    },

    // Auxiliar para calcular em qual passo do padrão estamos (relativo à Data do Jogo)
    getPatternStep: function(habit) {
        if (!habit.createdAt) return 0;
        if (!habit.pattern) return 0;

        const created = new Date(habit.createdAt);
        created.setHours(0,0,0,0);

        // Usa a Data do Jogo (Game Date)
        const gameDateStr = window.GlobalApp.getGameDate();
        const parts = gameDateStr.split('-');
        const currentGameDate = new Date(parts[0], parts[1] - 1, parts[2]);
        currentGameDate.setHours(0,0,0,0);

        const diffTime = Math.abs(currentGameDate - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const offset = habit.patternOffset || 0;
        const totalIndex = diffDays + offset;

        return totalIndex % habit.pattern.length;
    },

    // --- 2. RESET DIÁRIO (PASSIVO) ---
    // Chamado EXCLUSIVAMENTE pelo GlobalApp.checkForDailyReset()
    resetDailyState: function() {
        console.log("[HabitModel] Executando reset passivo de estados...");

        const habits = window.GlobalApp.data.habits || [];

        habits.forEach(h => {
            // Reseta contadores do dia (prepara para Hoje)
            h.completedToday = false;
            h.currentOfDay = 0;
            h.accumulatedTime = 0;
            h.opportunityToday = false; // Reseta flag de oportunidade (dependentes)
            h.dailySessionCount = 0;    // Reseta sessões de foco
            h.conductCompleted = [false, false, false];
            h.abstinenceCompleted = [];
            if (h.abstinenceStages) {
                h.abstinenceCompleted = new Array(h.abstinenceStages.length).fill(false);
            }

            // A sequência (streak) agora é sempre derivada do completionLog real,
            // então não há mais "hard reset" ad-hoc aqui: apenas recalcula com
            // base na nova Data do Jogo, que naturalmente zera a sequência se um
            // dia agendado ficou sem registro.
            this.recalculateStreaks(h);
        });

        window.GlobalApp.saveData();
    },

    // =========================================================================
    // 3. CALENDÁRIO, SEQUÊNCIA ATUAL E RECORDE
    // =========================================================================

    // Versão de isHabitScheduledForToday para uma data QUALQUER (passado ou futuro),
    // usada pelo calendário e pelo recálculo de sequência.
    isDateScheduled: function(habit, dateStr) {
        if (habit.isDependent) return true; // Sem agenda fixa; tratado à parte no recálculo

        const parts = dateStr.split('-');
        const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const dayOfWeek = dateObj.getDay();

        if (habit.frequencyType === 'weekly') {
            if (!habit.frequency || habit.frequency.length === 0) return true;
            return habit.frequency.some(d => parseInt(d) === dayOfWeek);
        }

        if (habit.frequencyType === 'pattern') {
            const step = this.getPatternStepForDate(habit, dateObj);
            return !!(habit.pattern && habit.pattern[step] === '1');
        }

        return true;
    },

    // Igual a getPatternStep, mas para uma data arbitrária (não só a Data do Jogo atual).
    getPatternStepForDate: function(habit, dateObj) {
        if (!habit.createdAt || !habit.pattern) return 0;

        const created = new Date(habit.createdAt);
        created.setHours(0, 0, 0, 0);
        const d = new Date(dateObj);
        d.setHours(0, 0, 0, 0);

        const diffDays = Math.round((d - created) / (1000 * 60 * 60 * 24));
        const offset = habit.patternOffset || 0;
        const len = habit.pattern.length;
        const totalIndex = diffDays + offset;

        // Módulo seguro para índices negativos (datas antes da criação)
        return ((totalIndex % len) + len) % len;
    },

    _parseDate: function(dateStr) {
        const p = dateStr.split('-');
        return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
    },

    /**
     * Marca ou desmarca a conclusão de um hábito numa data específica
     * (passada, ou hoje) e recalcula a sequência atual e o recorde a partir
     * do histórico completo. Usado pelo fluxo normal do check/contador de
     * HOJE (não pelo calendário, que usa cycleCalendarDay). Retorna o novo
     * estado (true = agora concluído/'done').
     */
    toggleCompletionOnDate: function(habit, dateStr) {
        if (!habit.completionLog) habit.completionLog = {};
        const wasCompleted = habit.completionLog[dateStr] === 'done';

        if (wasCompleted) {
            delete habit.completionLog[dateStr];
            if (habit.totalCount > 0) habit.totalCount--;
        } else {
            habit.completionLog[dateStr] = 'done';
            habit.totalCount = (habit.totalCount || 0) + 1;
        }

        // Sincroniza o estado "hoje" (completedToday/lastDone) se a data alterada for a atual
        const todayStr = window.GlobalApp.getGameDate();
        if (dateStr === todayStr) {
            habit.completedToday = !wasCompleted;
            habit.lastDone = !wasCompleted ? todayStr : null;
        }

        this.recalculateStreaks(habit);
        return !wasCompleted;
    },

    /**
     * Cicla o estado de um dia do CALENDÁRIO em 3 passos, a cada clique:
     * vazio/não marcado -> 'done' (verde) -> 'failed' (vermelho) -> vazio.
     * Só o estado 'done' conta para totalCount e para a sequência; 'failed'
     * é um registro explícito de "não feito" (interrompe a sequência atual
     * exatamente como um dia agendado sem marcação, mas fica visível em
     * vermelho em vez de neutro). Sincroniza completedToday/lastDone quando
     * a data alterada é hoje.
     */
    cycleCalendarDay: function(habit, dateStr) {
        if (!habit.completionLog) habit.completionLog = {};
        const current = habit.completionLog[dateStr];

        let next;
        if (current === 'done') next = 'failed';
        else if (current === 'failed') next = null;
        else next = 'done';

        const wasDone = current === 'done';
        const isDoneNow = next === 'done';

        if (wasDone && !isDoneNow && habit.totalCount > 0) habit.totalCount--;
        if (!wasDone && isDoneNow) habit.totalCount = (habit.totalCount || 0) + 1;

        if (next) habit.completionLog[dateStr] = next;
        else delete habit.completionLog[dateStr];

        const todayStr = window.GlobalApp.getGameDate();
        if (dateStr === todayStr) {
            habit.completedToday = isDoneNow;
            habit.lastDone = isDoneNow ? todayStr : null;
        }

        this.recalculateStreaks(habit);
        return next;
    },

    /**
     * Recalcula habit.streak (sequência atual) e habit.bestStreak (recorde) a
     * partir do completionLog inteiro, respeitando a frequência/padrão do
     * hábito — dias não agendados (folga) não quebram a sequência. Para
     * hábitos Dependentes (sem agenda fixa), conta apenas dias consecutivos
     * com registro (sem quebra em dias sem oportunidade).
     */
    recalculateStreaks: function(habit) {
        const log = habit.completionLog || {};
        const todayStr = window.GlobalApp.getGameDate();
        const createdStr = habit.createdAt
            ? window.GlobalApp.formatDate(new Date(habit.createdAt))
            : todayStr;

        const loggedDates = Object.keys(log).filter(d => !!log[d]);
        let earliest = createdStr;
        loggedDates.forEach(d => { if (d < earliest) earliest = d; });

        // --- RECORDE: varredura para frente, do dia mais antigo até hoje ---
        let best = 0;
        let running = 0;
        let cursor = this._parseDate(earliest);
        const endDate = this._parseDate(todayStr);

        while (cursor <= endDate) {
            const dStr = window.GlobalApp.formatDate(cursor);
            const done = log[dStr] === 'done';
            const counts = habit.isDependent ? true : this.isDateScheduled(habit, dStr);

            if (counts) {
                if (done) {
                    running++;
                    if (running > best) best = running;
                } else {
                    running = 0;
                }
            }
            // dia não agendado (folga): não afeta a sequência

            cursor.setDate(cursor.getDate() + 1);
        }

        // --- SEQUÊNCIA ATUAL: varredura para trás, de hoje até o dia mais antigo ---
        let current = 0;
        cursor = this._parseDate(todayStr);
        const startLimit = this._parseDate(earliest);
        let stillCounting = true;

        while (cursor >= startLimit && stillCounting) {
            const dStr = window.GlobalApp.formatDate(cursor);
            const done = log[dStr] === 'done';
            const counts = habit.isDependent ? true : this.isDateScheduled(habit, dStr);

            if (counts) {
                if (done) {
                    current++;
                } else if (dStr !== todayStr) {
                    // Dia agendado no passado sem registro: quebra a sequência.
                    // Se for HOJE e ainda não feito, não quebra (dia em andamento).
                    stillCounting = false;
                }
            }
            // dia não agendado: pula sem quebrar

            cursor.setDate(cursor.getDate() - 1);
        }

        habit.streak = current;
        habit.bestStreak = Math.max(habit.bestStreak || 0, best, current);
    },

    /**
     * Migração one-time: garante completionLog/bestStreak em hábitos salvos
     * antes desta versão. Se o hábito já tinha uma sequência visível (streak >
     * 0) mas nenhum registro no log, reconstrói um histórico plausível
     * marcando os últimos N dias agendados (N = streak antigo) terminando em
     * lastDone — assim a sequência que o usuário já via não desaparece com a
     * atualização.
     */
    migrateLegacyStreak: function(habit) {
        if (habit._legacyMigrated) return;
        habit._legacyMigrated = true;

        if (!habit.completionLog || typeof habit.completionLog !== 'object') habit.completionLog = {};
        if (typeof habit.bestStreak !== 'number') habit.bestStreak = 0;

        if (Object.keys(habit.completionLog).length === 0 && habit.lastDone && habit.streak > 0) {
            let cursor = this._parseDate(habit.lastDone);
            let remaining = habit.streak;
            let safety = 0;

            while (remaining > 0 && safety < 3650) {
                const dStr = window.GlobalApp.formatDate(cursor);
                const scheduled = habit.isDependent ? true : this.isDateScheduled(habit, dStr);
                if (scheduled) {
                    habit.completionLog[dStr] = 'done';
                    remaining--;
                }
                cursor.setDate(cursor.getDate() - 1);
                safety++;
            }
        }

        this.recalculateStreaks(habit);
        habit.bestStreak = Math.max(habit.bestStreak || 0, habit.streak || 0);
    },

    // --- 4. UTILS ---
    formatSeconds: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};
