/**
 * HABITS-MODEL.JS
 * Lógica de Dados e Regras de Negócio para Hábitos.
 * VERSÃO: V6.0 - LEAN EDITION (SEM XP)
 * Alterações: Removido todo o cálculo de XP e Marcos (Milestones) de recompensa.
 * Mantida a lógica de agendamento (frequência semanal / padrão) e streak.
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

    // Auxiliar para calcular em qual passo do padrão estamos
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
        // A data de referência é "Ontem" (pois o reset roda na manhã seguinte)
        // Precisamos saber se o hábito estava agendado para ontem para cobrar o streak.
        
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = window.GlobalApp.formatDate(yesterday);

        habits.forEach(h => {
            // Salva estado de conclusão de ontem antes de limpar
            const completedYesterday = h.completedToday;

            // Registra no log histórico do calendário o resultado de ontem, mas
            // SÓ se ontem era um dia agendado para este hábito — dias fora da
            // frequência nunca entram no log (nunca ficam vermelhos).
            if (!h.completionLog) h.completionLog = {};
            if (this._wasScheduledOnDate(h, yesterday)) {
                h.completionLog[yesterdayStr] = !!completedYesterday;
            }
            
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

            // Lógica de Falha de Streak (Hard Reset)
            // Se não completou ontem...
            if (!completedYesterday) {
                // ...e não é um hábito infinito (que não tem obrigação diária)...
                if (h.type !== 'infinite') {
                    const lastDoneDate = h.lastDone ? h.lastDone.split('T')[0] : null;
                    
                    // Se a última vez que fez não foi ontem (e nem hoje, claro), e tinha streak...
                    if (lastDoneDate !== yesterdayStr && h.streak > 0) {
                        console.log(`[HabitModel] Streak perdido para: ${h.name}`);
                        h.streak = 0;
                    }
                }
            }
        });

        window.GlobalApp.saveData();
    },

    // --- 4. CALENDÁRIO DE CHECK POR HÁBITO ---

    // Verifica se uma data específica (objeto Date) estava agendada para o hábito,
    // usando a mesma lógica de frequência/padrão de isHabitScheduledForToday, mas
    // para uma data arbitrária (não necessariamente hoje).
    _wasScheduledOnDate: function(habit, dateObj) {
        if (habit.isDependent) return false; // dependentes não entram no calendário fixo

        const dayOfWeek = dateObj.getDay();

        if (habit.frequencyType === 'weekly') {
            if (!habit.frequency || habit.frequency.length === 0) return true;
            return habit.frequency.some(d => parseInt(d) === dayOfWeek);
        }

        if (habit.frequencyType === 'pattern') {
            if (!habit.pattern || !habit.createdAt) return false;
            const created = new Date(habit.createdAt);
            created.setHours(0, 0, 0, 0);
            const target = new Date(dateObj);
            target.setHours(0, 0, 0, 0);

            if (target < created) return false; // hábito ainda não existia nessa data

            const diffDays = Math.round((target - created) / (1000 * 60 * 60 * 24));
            const offset = habit.patternOffset || 0;
            const step = (diffDays + offset) % habit.pattern.length;
            return habit.pattern[step] === '1';
        }

        return true; // default: diário
    },

    /**
     * Monta os dados de um mês inteiro para o mini-calendário de um hábito.
     * Retorna um array de células (uma por dia 1..N do mês), cada uma com:
     *   { day, dateStr, status } onde status é um de:
     *   'done' | 'missed' | 'future' | 'not-scheduled'
     * 'not-scheduled' cobre tanto dias fora da frequência quanto dias antes da
     * criação do hábito — em ambos os casos a célula fica vazia (nunca vermelha).
     */
    getCalendarDataForMonth: function(habit, year, month) {
        const todayStr = window.GlobalApp.getGameDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dateStr = window.GlobalApp.formatDate(dateObj);

            const createdAt = habit.createdAt ? new Date(habit.createdAt) : null;
            if (createdAt) createdAt.setHours(0, 0, 0, 0);
            const cellDate = new Date(dateObj);
            cellDate.setHours(0, 0, 0, 0);

            let status;
            if (createdAt && cellDate < createdAt) {
                status = 'not-scheduled';
            } else if (!this._wasScheduledOnDate(habit, dateObj)) {
                status = 'not-scheduled';
            } else if (dateStr > todayStr) {
                status = 'future';
            } else if (dateStr === todayStr) {
                status = habit.completedToday ? 'done' : 'future'; // hoje ainda "em aberto" se não feito
            } else {
                const logged = habit.completionLog ? habit.completionLog[dateStr] : undefined;
                status = logged === true ? 'done' : (logged === false ? 'missed' : 'not-scheduled');
            }

            cells.push({ day, dateStr, status });
        }

        return cells;
    },

    /**
     * Marca ou desmarca manualmente um dia PASSADO no log de um hábito (usado
     * quando o usuário esqueceu de marcar a tempo). Não altera streak, contadores
     * do dia atual, nem qualquer outro estado — é só o registro histórico do
     * calendário. Só permite alterar dias que estavam agendados para o hábito.
     */
    toggleManualLogDay: function(habit, dateStr) {
        const todayStr = window.GlobalApp.getGameDate();
        if (dateStr >= todayStr) return false; // só dias passados

        const parts = dateStr.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!this._wasScheduledOnDate(habit, dateObj)) return false;

        if (!habit.completionLog) habit.completionLog = {};
        const current = habit.completionLog[dateStr];
        habit.completionLog[dateStr] = !(current === true);

        window.GlobalApp.saveData();
        return true;
    },

    // --- 5. UTILS ---
    formatSeconds: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};
