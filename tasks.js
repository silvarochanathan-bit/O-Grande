/**
 * TASKS.JS
 * Gerencia tarefas únicas, agendamento, decaimento de valor e histórico.
 * VERSÃO FINAL 2.0: Filtros de Tempo + Agendamento de Data.
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
        if (window.SoundManager) window.SoundManager.play('click');
        this.activeTimeFilter = filter;
        this.render();
    },

    /**
     * Verifica se a tarefa deve aparecer no filtro atual
     */
    checkTaskVisibility: function(task) {
        // Tarefas sem data (Backlog) aparecem sempre, pois são "Para fazer o quanto antes"
        if (!task.targetDate) return true;
        if (this.activeTimeFilter === 'all') return true;

        const target = this.parseLocalDate(task.targetDate);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Se já passou da data (atrasada), mostra sempre (urgente)
        if (target < today) return true;

        // Define data limite do filtro
        let limitDate = new Date(today);

        if (this.activeTimeFilter === 'today') {
            limitDate = new Date(today);
        } else if (this.activeTimeFilter === 'week') {
            const day = today.getDay(); // 0 (Dom) - 6 (Sab)
            // Lógica: Até o próximo Domingo
            const daysUntilSunday = (day === 0) ? 0 : (7 - day);
            limitDate.setDate(today.getDate() + daysUntilSunday);
        } else if (this.activeTimeFilter === 'month') {
            limitDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }

        return target <= limitDate;
    },

    calculateTaskStatus: function(task) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Base de cálculo: Data Alvo (se existir) ou Data de Criação
        let referenceDate;
        let isScheduled = false;

        if (task.targetDate) {
            referenceDate = this.parseLocalDate(task.targetDate);
            // Se a data alvo é no futuro (> hoje), não tem decaimento
            if (referenceDate > today) {
                return { currentXP: parseInt(task.originalXP), daysLate: 0, status: 'scheduled' };
            }
        } else {
            referenceDate = this.parseLocalDate(task.createdAt);
        }

        const diffTime = today - referenceDate;
        let daysLate = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (daysLate < 0) daysLate = 0;
        
        const originalXP = parseInt(task.originalXP);
        let currentXP = 0;
        let status = 'normal';

        if (daysLate === 0) {
            currentXP = originalXP;
        } else if (daysLate < 10) {
            const loss = originalXP * 0.10 * daysLate;
            currentXP = Math.round(originalXP - loss);
            status = 'decaying';
        } else if (daysLate === 10) {
            currentXP = 0;
            status = 'decaying';
        } else {
            const daysPastZero = daysLate - 10;
            const penalty = originalXP * 0.10 * daysPastZero;
            if (daysPastZero < 1) { 
                currentXP = 0; 
            } else {
                currentXP = Math.round(-penalty);
                status = 'negative';
            }
        }

        return { currentXP, daysLate, status };
    },

    render: function() {
        if (!this.container) return;
        this.container.innerHTML = '';
        const tasks = window.GlobalApp.data.tasks;

        // 1. Renderiza Barra de Filtros
        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar';
        const filters = [
            { id: 'today', label: 'Hoje' },
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mês' },
            { id: 'all', label: 'Todas' }
        ];

        filters.forEach(f => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${this.activeTimeFilter === f.id ? 'active' : ''}`;
            btn.textContent = f.label;
            btn.onclick = () => this.setTimeFilter(f.id);
            filterBar.appendChild(btn);
        });
        this.container.appendChild(filterBar);

        // 2. Filtra e Ordena Tarefas
        // Ordenação: Atrasadas primeiro -> Hoje -> Futuras -> Sem Data
        const visibleTasks = tasks.filter(t => this.checkTaskVisibility(t));
        
        visibleTasks.sort((a, b) => {
            const dateA = a.targetDate ? a.targetDate : '9999-99-99';
            const dateB = b.targetDate ? b.targetDate : '9999-99-99';
            return dateA.localeCompare(dateB);
        });

        if (visibleTasks.length === 0) {
            const msg = this.activeTimeFilter === 'all' 
                ? 'Nenhuma tarefa pendente.' 
                : 'Nada agendado para este período.';
            this.container.innerHTML += `<p style="color:#666; font-style:italic; padding:10px;">${msg}</p>`;
            return;
        }

        visibleTasks.forEach(task => {
            const calc = this.calculateTaskStatus(task);
            
            const el = document.createElement('div');
            // Se for scheduled (futuro), usamos um estilo neutro/normal
            const statusClass = calc.status === 'scheduled' ? 'normal' : calc.status;
            el.className = `task-card ${statusClass}`;
            
            let xpClass = 'positive';
            if (calc.status === 'decaying') xpClass = 'reduced';
            if (calc.status === 'negative') xpClass = 'penalty';

            const xpDisplay = calc.currentXP > 0 ? `+${calc.currentXP} XP` : `${calc.currentXP} XP`;
            
            let badgeText = '';
            if (calc.status === 'scheduled') {
                // Data futura
                const dateParts = task.targetDate.split('-');
                badgeText = `📅 ${dateParts[2]}/${dateParts[1]}`;
            } else if (calc.daysLate === 0) {
                badgeText = 'Hoje';
            } else if (calc.daysLate === 1) {
                badgeText = 'Ontem';
            } else {
                badgeText = `${calc.daysLate} dias atraso`;
            }

            const badgeStyle = calc.status === 'scheduled' 
                ? 'background-color:rgba(255,255,255,0.1); color:var(--text-secondary);'
                : ''; // Usa estilo padrão de atraso do CSS

            const badgeHtml = `<span class="days-late-badge" style="${badgeStyle}">${badgeText}</span>`;

            el.innerHTML = `
                <div class="task-info">
                    <span class="task-name">${task.name}</span>
                    <div class="task-meta">
                        <span class="task-xp-display ${xpClass}">${xpDisplay}</span>
                        ${badgeHtml}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-complete-task" title="Concluir" onclick="window.TaskManager.completeTask('${task.id}')">✔</button>
                    <button class="icon-btn delete btn-delete-task" title="Apagar" onclick="window.TaskManager.deleteTask('${task.id}')">🗑️</button>
                </div>
            `;
            
            this.container.appendChild(el);
        });
    },

    renderHistory: function() {
        if (!this.historyContainer) return;
        this.historyContainer.innerHTML = '';
        
        if (!window.GlobalApp.data.executedTasks) {
            window.GlobalApp.data.executedTasks = [];
        }

        const history = [...window.GlobalApp.data.executedTasks].reverse();

        history.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'task-history-item';
            
            const xpClass = item.xp >= 0 ? 'xp-positive' : 'xp-negative';
            const xpStr = item.xp >= 0 ? `+${item.xp}` : `${item.xp}`;
            const deleteBtn = `<button class="btn-delete-task-log" title="Desfazer" onclick="window.TaskManager.deleteTaskLog(${index})">✕</button>`;

            li.innerHTML = `
                <span>${item.name} <span style="opacity:0.5; font-size:0.8em">(${item.date})</span></span>
                <span class="task-history-xp ${xpClass}">${xpStr} XP ${deleteBtn}</span>
            `;
            this.historyContainer.appendChild(li);
        });
    },

    // --- AÇÕES ---

    createTask: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        
        const name = await prompt("Nome da Tarefa:");
        if (!name) return;
        
        const xpInput = await prompt("Valor de XP (ex: 100):", "100");
        const xp = parseInt(xpInput);
        if (isNaN(xp)) return;

        // Novo: Opção de Data
        const dateInput = await prompt("Data para realizar (YYYY-MM-DD)?\nDeixe vazio para 'Sem data' (Backlog).", "");
        
        // Validação simples de data
        let targetDate = null;
        if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            targetDate = dateInput;
        }

        const newTask = {
            id: window.GlobalApp.generateUUID(),
            name: name,
            originalXP: xp,
            targetDate: targetDate, // Novo campo
            createdAt: window.GlobalApp.formatDate(new Date())
        };

        window.GlobalApp.data.tasks.push(newTask);
        window.GlobalApp.saveData();
        this.render();
    },

    completeTask: function(id) {
        const taskIndex = window.GlobalApp.data.tasks.findIndex(t => t.id === id);
        if (taskIndex === -1) return;
        
        const task = window.GlobalApp.data.tasks[taskIndex];
        const calc = this.calculateTaskStatus(task);

        let logMsg = `Tarefa: ${task.name}`;
        if (calc.daysLate > 0 && calc.status !== 'scheduled') logMsg += ` (${calc.daysLate}d atraso)`;
        if (calc.status === 'scheduled') logMsg += ` (Agendada)`;

        window.XPManager.gainXP(calc.currentXP, logMsg, { 
            forceFlat: false, 
            isTask: true 
        });

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

    deleteTaskLog: async function(index) {
        if (window.SoundManager) window.SoundManager.play('click');
        const list = window.GlobalApp.data.executedTasks;
        const realIndex = list.length - 1 - index;
        const item = list[realIndex];

        if (!item) return;

        if (await confirm(`Remover registro de "${item.name}" e reverter XP?`)) {
            const xpState = window.GlobalApp.data.xp;
            
            xpState.current -= item.xp;
            xpState.total -= item.xp;

            if (window.XPManager) {
                window.XPManager.checkLevelChange();
                window.XPManager.updateUI();
            }

            list.splice(realIndex, 1);
            
            window.GlobalApp.saveData();
            this.renderHistory();
        }
    }
};

window.TaskManager.init();