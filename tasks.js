/**
 * TASKS.JS
 * Gerencia tarefas únicas (lista simples): nome, data, concluir e excluir.
 * VERSÃO: V3.0 - LEAN EDITION (SEM XP / SEM DIFICULDADE)
 * Alterações: Removida toda a lógica de dificuldade, decaimento de valor por
 * atraso e concessão de XP. A tarefa concluída simplesmente sai da lista ativa
 * e entra no histórico de concluídas.
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
        
        const name = await prompt("Nova Tarefa:");
        if (!name) return;

        // Pergunta data (opcional)
        const dateStr = await prompt("Data de Agendamento (AAAA-MM-DD)?\nDeixe vazio para HOJE.", window.GlobalApp.formatDate(new Date()));

        const newTask = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            createdAt: new Date().toISOString(),
            scheduledDate: dateStr || window.GlobalApp.formatDate(new Date()) // Salva string YYYY-MM-DD
        };

        window.GlobalApp.data.tasks.push(newTask);
        window.GlobalApp.saveData();
        this.render();
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
            
            // Sempre mostra atrasadas, independente do filtro
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
            const tDate = this.parseLocalDate(task.scheduledDate);
            tDate.setHours(0,0,0,0);
            const isLate = tDate < today;

            const div = document.createElement('div');
            div.className = `task-card ${isLate ? 'decaying' : ''}`;
            
            let dateBadge = '';
            if (isLate) {
                const diffDays = Math.ceil((today - tDate) / (1000 * 60 * 60 * 24));
                dateBadge = `<span class="days-late-badge">Atrasada ${diffDays} dia(s)</span>`;
            } else {
                const dayStr = String(tDate.getDate()).padStart(2,'0') + '/' + String(tDate.getMonth()+1).padStart(2,'0');
                dateBadge = `<span style="font-size:0.75rem; color:#888; margin-right:5px;">📅 ${dayStr}</span>`;
            }

            div.innerHTML = `
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:1rem; color:#fff;">${task.name}</h4>
                    <div style="font-size:0.75rem; color:#aaa; margin-top:4px;">
                        ${dateBadge}
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-complete-task" onclick="window.TaskManager.completeTask('${task.id}')">✔</button>
                    <button class="secondary-btn" onclick="window.TaskManager.deleteTask('${task.id}')" style="border-color:#ff5252; color:#ff5252;">×</button>
                </div>
            `;
            this.container.appendChild(div);
        });
    },

    renderHistory: function() {
        if (!this.historyContainer) return;
        this.historyContainer.innerHTML = '';

        const history = window.GlobalApp.data.tasksHistory || [];
        // Mostra os últimos 10
        const recent = history.slice(-10).reverse();

        if (recent.length === 0) {
            this.historyContainer.innerHTML = '<li style="padding:10px; color:#666;">Nenhuma tarefa concluída.</li>';
            return;
        }

        recent.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'task-history-item';
            
            li.innerHTML = `
                <span>${item.name}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="btn-delete-log" title="Remover do histórico" onclick="window.TaskManager.deleteTaskLog(${index})">⟲</button>
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

        if (window.SoundManager) window.SoundManager.play('click');

        // Salva no histórico local de tarefas
        if (!window.GlobalApp.data.tasksHistory) window.GlobalApp.data.tasksHistory = [];
        window.GlobalApp.data.tasksHistory.push({
            name: task.name,
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
        
        const list = window.GlobalApp.data.tasksHistory;
        // Converte índice do visual (reverso) para o real
        const realIndex = list.length - 1 - reverseIndex;
        const item = list[realIndex];

        if (!item) return;

        if (await confirm(`Remover registro de "${item.name}" do histórico?`)) {
            list.splice(realIndex, 1);
            window.GlobalApp.saveData();
            this.renderHistory();
        }
    }
};
