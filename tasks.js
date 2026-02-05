/**
 * TASKS.JS
 * Gerencia tarefas únicas, agendamento, decaimento de valor e histórico.
 * VERSÃO: V2.1 - XP SAFE DELETE
 * Alterações: A remoção de logs agora usa o XPManager para estornar pontos,
 * em vez de manipular o objeto global de XP diretamente.
 */

window.TaskManager = {
    
    container: null,
    historyContainer: null,
    activeTimeFilter: 'today', // 'today', 'week', 'month', 'all'

    init: function() {
        this.container = document.getElementById('tasks-container');
        this.historyContainer = document.getElementById('tasks-history-list');

        document.addEventListener('SiteC_DataReady', () => {
            this.render();
            this.renderHistory();
        });

        // Evento criar tarefa
        const btnCreate = document.getElementById('btn-create-task');
        if (btnCreate) {
            // Remove listeners antigos para evitar duplicação (segurança)
            const newBtn = btnCreate.cloneNode(true);
            btnCreate.parentNode.replaceChild(newBtn, btnCreate);
            newBtn.addEventListener('click', () => this.createTask());
        }
    },

    /**
     * AUXILIAR: Data LOCAL
     */
    parseLocalDate: function(dateString) {
        if (!dateString) return new Date();
        const parts = dateString.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    },

    setTimeFilter: function(filter) {
        this.activeTimeFilter = filter;
        
        // Atualiza UI dos botões
        const btns = document.querySelectorAll('.filter-bar button');
        btns.forEach(b => {
            if (b.textContent.toLowerCase().includes(filter === 'all' ? 'todos' : 
               filter === 'week' ? 'semana' : 
               filter === 'month' ? 'mês' : 'hoje')) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        this.render();
    },

    createTask: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const name = await prompt("Nova Tarefa (Única):");
        if (!name) return;

        // Pergunta data (opcional)
        const dateStr = await prompt("Data de Agendamento (AAAA-MM-DD)?\nDeixe vazio para HOJE.", window.GlobalApp.formatDate(new Date()));
        
        // Pergunta dificuldade
        const diffInput = await prompt("Dificuldade (1-Fácil, 2-Médio, 3-Difícil, 4-Épico):", "1");
        const diffMap = { '1': 'easy', '2': 'medium', '3': 'hard', '4': 'epic' };
        const difficulty = diffMap[diffInput] || 'easy';

        const newTask = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            difficulty: difficulty,
            createdAt: new Date().toISOString(),
            scheduledDate: dateStr || window.GlobalApp.formatDate(new Date()) // Salva string YYYY-MM-DD
        };

        window.GlobalApp.data.tasks.push(newTask);
        window.GlobalApp.saveData();
        this.render();
    },

    calculateXP: function(task) {
        // Base: easy=15, medium=30, hard=50, epic=100
        const bases = { 'easy': 15, 'medium': 30, 'hard': 50, 'epic': 100 };
        const base = bases[task.difficulty] || 15;

        // Decaimento por Atraso
        // Se hoje > scheduledDate, perde 10% por dia (max 50%)
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const scheduled = this.parseLocalDate(task.scheduledDate);
        scheduled.setHours(0,0,0,0);

        const diffTime = today - scheduled;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        let multiplier = 1.0;
        let isDecayed = false;
        let isLate = false;

        if (diffDays > 0) {
            isLate = true;
            const penalty = Math.min(0.5, diffDays * 0.1); // 10% ao dia, max 50%
            multiplier = 1.0 - penalty;
            isDecayed = true;
        }

        return {
            currentXP: Math.floor(base * multiplier),
            baseXP: base,
            isDecayed: isDecayed,
            daysLate: diffDays > 0 ? diffDays : 0
        };
    },

    render: function() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const tasks = window.GlobalApp.data.tasks || [];
        const today = new Date();
        today.setHours(0,0,0,0);

        // FILTRAGEM
        const filteredTasks = tasks.filter(t => {
            const tDate = this.parseLocalDate(t.scheduledDate);
            tDate.setHours(0,0,0,0);

            if (this.activeTimeFilter === 'all') return true;
            
            // Sempre mostra atrasadas, independente do filtro (exceto se tiver lógica específica, mas padrão é mostrar)
            if (tDate < today) return true;

            if (this.activeTimeFilter === 'today') {
                return tDate.getTime() === today.getTime();
            }
            
            if (this.activeTimeFilter === 'week') {
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);
                return tDate >= today && tDate <= nextWeek;
            }

            if (this.activeTimeFilter === 'month') {
                const nextMonth = new Date(today);
                nextMonth.setDate(today.getDate() + 30);
                return tDate >= today && tDate <= nextMonth;
            }

            return true;
        });

        // Ordenação: Atrasadas primeiro, depois por data
        filteredTasks.sort((a, b) => {
            const dA = this.parseLocalDate(a.scheduledDate);
            const dB = this.parseLocalDate(b.scheduledDate);
            return dA - dB;
        });

        if (filteredTasks.length === 0) {
            this.container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Nenhuma tarefa pendente.</div>';
            return;
        }

        filteredTasks.forEach(task => {
            const calc = this.calculateXP(task);
            
            const div = document.createElement('div');
            div.className = `task-card ${calc.isDecayed ? 'decaying' : ''}`;
            
            let dateBadge = '';
            if (calc.daysLate > 0) {
                dateBadge = `<span class="days-late-badge">Atrasada ${calc.daysLate} dia(s)</span>`;
            } else {
                // Formata data amigável
                const tDate = this.parseLocalDate(task.scheduledDate);
                const dayStr = String(tDate.getDate()).padStart(2,'0') + '/' + String(tDate.getMonth()+1).padStart(2,'0');
                dateBadge = `<span style="font-size:0.75rem; color:#888; margin-right:5px;">📅 ${dayStr}</span>`;
            }

            div.innerHTML = `
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:1rem; color:#fff;">${task.name}</h4>
                    <div style="font-size:0.75rem; color:#aaa; margin-top:4px;">
                        ${dateBadge}
                        <span style="color:var(--accent-color); font-weight:bold;">+${calc.currentXP} XP</span>
                        ${calc.isDecayed ? `<small style="color:#ff5252;">(Original: ${calc.baseXP})</small>` : ''}
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="action-btn" onclick="window.TaskManager.completeTask('${task.id}')">✔</button>
                    <button class="secondary-btn" onclick="window.TaskManager.deleteTask('${task.id}')" style="border-color:#ff5252; color:#ff5252;">×</button>
                </div>
            `;
            this.container.appendChild(div);
        });
    },

    renderHistory: function() {
        if (!this.historyContainer) return;
        this.historyContainer.innerHTML = '';

        const history = window.GlobalApp.data.executedTasks || [];
        // Mostra os últimos 10
        const recent = history.slice(-10).reverse();

        if (recent.length === 0) {
            this.historyContainer.innerHTML = '<li style="padding:10px; color:#666;">Nenhuma tarefa concluída.</li>';
            return;
        }

        recent.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'task-history-item';
            
            // O index aqui é do slice reverso. Para deletar, precisamos do índice real no array original.
            // executedTasks: [0, 1, 2, 3] -> length 4
            // reverse slice: [3, 2, 1] (top 3)
            // item é o 3. No array original é index = history.length - 1 - index_do_loop
            
            li.innerHTML = `
                <span>${item.name}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="task-history-xp xp-positive">+${item.xp} XP</span>
                    <button class="btn-delete-log" title="Desfazer" onclick="window.TaskManager.deleteTaskLog(${index})">⟲</button>
                </div>
            `;
            this.historyContainer.appendChild(li);
        });
    },

    completeTask: function(taskId) {
        const tasks = window.GlobalApp.data.tasks;
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = tasks[taskIndex];
        const calc = this.calculateXP(task);

        if (window.SoundManager) window.SoundManager.play('xp');
        if (window.XPManager) {
            // Registra ganho no sistema global
            window.XPManager.gainXP(calc.currentXP, `Tarefa: ${task.name}`, { type: 'task' });
        }

        // Salva no histórico local de tarefas
        if (!window.GlobalApp.data.executedTasks) window.GlobalApp.data.executedTasks = [];
        window.GlobalApp.data.executedTasks.push({
            name: task.name,
            xp: calc.currentXP,
            date: window.GlobalApp.formatDate(new Date())
        });

        window.GlobalApp.data.tasks.splice(taskIndex, 1);
        
        window.GlobalApp.saveData();
        this.render();
        this.renderHistory();
    },

    deleteTask: async function(id) {
        if (window.SoundManager) window.SoundManager.play('click');
        if(await confirm("Apagar tarefa?")) {
            window.GlobalApp.data.tasks = window.GlobalApp.data.tasks.filter(t => t.id !== id);
            window.GlobalApp.saveData();
            this.render();
        }
    },

    deleteTaskLog: async function(reverseIndex) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const list = window.GlobalApp.data.executedTasks;
        // Converte índice do visual (reverso) para o real
        const realIndex = list.length - 1 - reverseIndex;
        const item = list[realIndex];

        if (!item) return;

        if (await confirm(`Remover registro de "${item.name}" e reverter XP?`)) {
            
            // V2.1: Delegação correta para o XPManager
            if (window.XPManager) {
                // Passa valor negativo com flag forceFlat para evitar multiplicadores na reversão
                window.XPManager.gainXP(-item.xp, `Correção: ${item.name}`, { forceFlat: true });
            }

            // Remove do histórico local
            list.splice(realIndex, 1);
            
            window.GlobalApp.saveData();
            this.renderHistory(); // Re-renderiza histórico
        }
    }
};