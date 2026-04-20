/**
 * FINANCE-VIEW.JS
 * Camada de Visualização do Módulo Financeiro.
 * Renderiza o Dashboard (Tier), Dívidas a Repor e Histórico.
 */

window.FinanceView = {

    containerId: null,
    activeTab: 'finance-dashboard-section',
    currentFilter: 30, // Padrão: 30 dias

    init: function(containerId) {
        this.containerId = containerId;
        this._setupInternalNav();
        this._injectModals();
        console.log("[FinanceView] Interface Financeira inicializada.");
    },

    _setupInternalNav: function() {
        const btns = document.querySelectorAll('.finance-nav-btn');
        if (btns.length > 0) {
            btns.forEach(btn => {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-finance-target');
                    this.switchTab(target);
                };
            });
        }
    },

    switchTab: function(tabId) {
        this.activeTab = tabId;
        
        document.querySelectorAll('.finance-nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-finance-target') === tabId);
        });

        this.render();
    },

    render: function() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';

        if (this.activeTab === 'finance-dashboard-section') {
            this._renderDashboard(container);
        } else if (this.activeTab === 'finance-debts-section') {
            this._renderDebts(container);
        } else if (this.activeTab === 'finance-history-section') {
            this._renderHistory(container);
        }
    },

    _formatMoney: function(value) {
        return "R$ " + parseFloat(value).toFixed(2).replace('.', ',');
    },

    _renderDashboard: function(container) {
        const tier = window.FinanceModel.getTier();
        const balance = window.FinanceModel.getWalletBalance();
        const summary = window.FinanceModel.getCategorySummary(this.currentFilter);

        // Header com Filtro
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `
            <h2>Visão Geral</h2>
            <select id="finance-filter" class="gym-input" style="width: auto; padding: 5px; background:var(--bg-main); color:#fff; border:1px solid #333; border-radius:4px;" onchange="window.FinanceController.changeFilter(this.value)">
                <option value="1" ${this.currentFilter == 1 ? 'selected' : ''}>Hoje</option>
                <option value="7" ${this.currentFilter == 7 ? 'selected' : ''}>7 Dias</option>
                <option value="30" ${this.currentFilter == 30 ? 'selected' : ''}>1 Mês</option>
                <option value="60" ${this.currentFilter == 60 ? 'selected' : ''}>2 Meses</option>
                <option value="0" ${this.currentFilter == 0 ? 'selected' : ''}>Tudo</option>
            </select>
        `;
        container.appendChild(header);

        // Painel Principal (Carteira Livre)
        const balanceCard = document.createElement('div');
        balanceCard.className = 'finance-dashboard-card';
        balanceCard.innerHTML = `
            <div class="finance-balance-label">Carteira Livre</div>
            <div class="finance-balance-value" style="color: ${tier.color};">${this._formatMoney(balance)}</div>
            <div class="finance-tier-label" style="background: ${tier.color}22; color: ${tier.color};">${tier.label}</div>
        `;
        container.appendChild(balanceCard);

        // Botões Rápidos
        const actionsGrid = document.createElement('div');
        actionsGrid.className = 'finance-actions-grid';
        actionsGrid.innerHTML = `
            <button class="finance-action-btn btn-fin-gain" onclick="window.FinanceController.openAddModal('gain')">
                <span style="font-size: 1.5rem;">📈</span> Adicionar Ganho
            </button>
            <button class="finance-action-btn btn-fin-expense" onclick="window.FinanceController.openAddModal('expense')">
                <span style="font-size: 1.5rem;">📉</span> Adicionar Gasto
            </button>
            <button class="finance-action-btn" style="grid-column: 1 / -1; background: #222; border: 1px solid #444; color: #fff;" onclick="window.FinanceController.openUberModal()">
                <span style="font-size: 1.5rem;">🚗</span> Calc. Uber
            </button>
        `;
        container.appendChild(actionsGrid);

        // Resumo por Categorias (Ganhos)
        const gainsDiv = document.createElement('div');
        gainsDiv.style.marginBottom = '20px';
        gainsDiv.innerHTML = `<h3 style="color: var(--fin-tier-positivo); border-bottom: 1px solid #333; padding-bottom: 5px; font-size:1rem;">Ganhos no Período</h3>`;
        let totalGains = 0;
        if (Object.keys(summary.gains).length === 0) {
            gainsDiv.innerHTML += `<p style="opacity: 0.5; font-size: 0.9rem;">Nenhum ganho no período.</p>`;
        } else {
            for (let cat in summary.gains) {
                totalGains += summary.gains[cat];
                gainsDiv.innerHTML += `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #333; font-size: 0.9rem;">
                        <span>${cat}</span>
                        <span style="color: var(--fin-tier-positivo);">${this._formatMoney(summary.gains[cat])}</span>
                    </div>
                `;
            }
            gainsDiv.innerHTML += `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; font-weight: bold; margin-top: 5px;">
                    <span>TOTAL</span>
                    <span style="color: var(--fin-tier-positivo);">${this._formatMoney(totalGains)}</span>
                </div>
            `;
        }
        container.appendChild(gainsDiv);

        // Resumo por Categorias (Gastos)
        const expDiv = document.createElement('div');
        expDiv.style.marginBottom = '20px';
        expDiv.innerHTML = `<h3 style="color: var(--fin-tier-divida-media); border-bottom: 1px solid #333; padding-bottom: 5px; font-size:1rem;">Gastos no Período</h3>`;
        let totalExp = 0;
        if (Object.keys(summary.expenses).length === 0) {
            expDiv.innerHTML += `<p style="opacity: 0.5; font-size: 0.9rem;">Nenhum gasto no período.</p>`;
        } else {
            for (let cat in summary.expenses) {
                totalExp += summary.expenses[cat];
                expDiv.innerHTML += `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #333; font-size: 0.9rem;">
                        <span>${cat}</span>
                        <span style="color: var(--fin-tier-divida-media);">${this._formatMoney(summary.expenses[cat])}</span>
                    </div>
                `;
            }
            expDiv.innerHTML += `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; font-weight: bold; margin-top: 5px;">
                    <span>TOTAL</span>
                    <span style="color: var(--fin-tier-divida-media);">${this._formatMoney(totalExp)}</span>
                </div>
            `;
        }
        container.appendChild(expDiv);
    },

    _renderDebts: function(container) {
        const debts = window.FinanceModel.getPendingDebts();

        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<h2>Provisões / A Repor</h2>`;
        container.appendChild(header);

        if (debts.length === 0) {
            container.innerHTML += `
                <div style="text-align:center; padding:50px 20px; opacity:0.5;">
                    <div style="font-size:3rem; margin-bottom:15px;">🎉</div>
                    <p>Você não tem nenhuma dívida acumulada ou provisão pendente!</p>
                </div>
            `;
            return;
        }

        let totalPending = 0;

        debts.forEach(d => {
            totalPending += d.amount;
            const card = document.createElement('div');
            card.style.background = 'var(--bg-card)';
            card.style.border = '1px solid var(--fin-tier-divida-media)';
            card.style.borderRadius = '8px';
            card.style.padding = '15px';
            card.style.marginBottom = '15px';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="color:var(--text-primary); font-size:1.1rem;">${d.category}</strong>
                    <span style="color:var(--fin-tier-divida-media); font-weight:bold; font-size:1.2rem;">${this._formatMoney(d.amount)}</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="action-btn" style="background:var(--fin-tier-positivo); color:#000; flex:1;" onclick="window.FinanceController.promptPayDebt('${d.id}', '${d.category}', ${d.amount})">💸 Quitar / Abater</button>
                </div>
            `;
            container.appendChild(card);
        });

        // Rodapé de Total Acumulado
        const totalFooter = document.createElement('div');
        totalFooter.style.marginTop = '20px';
        totalFooter.style.padding = '15px';
        totalFooter.style.borderTop = '2px dashed #333';
        totalFooter.style.display = 'flex';
        totalFooter.style.justifyContent = 'space-between';
        totalFooter.style.fontWeight = 'bold';
        totalFooter.innerHTML = `
            <span>Total Comprometido:</span>
            <span style="color:var(--fin-tier-divida-profunda);">${this._formatMoney(totalPending)}</span>
        `;
        container.appendChild(totalFooter);
    },

    _renderHistory: function(container) {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `<h2>Histórico Recente</h2>`;
        container.appendChild(header);

        const txs = window.FinanceModel.getTransactions(30); // Mostra ultimos 30 dias na aba histórico
        
        if (txs.length === 0) {
            container.innerHTML += '<p style="text-align:center; opacity:0.5; padding:20px;">Nenhuma transação encontrada.</p>';
            return;
        }

        let rowsHTML = '';
        txs.forEach(t => {
            const dateStr = new Date(t.timestamp).toLocaleDateString('pt-BR');
            let color = '';
            let signal = '';
            
            if (t.type === 'gain') {
                color = 'var(--fin-tier-positivo)';
                signal = '+';
            } else if (t.type === 'expense') {
                color = 'var(--fin-tier-divida-media)';
                signal = '-';
            } else if (t.type === 'debt_payment') {
                color = 'var(--fin-tier-neutro)';
                signal = '↓';
            }

            const pendingBadge = t.isPending ? `<span style="font-size:0.65rem; background:var(--fin-tier-divida-leve); color:#000; padding:2px 4px; border-radius:4px; margin-left:5px;">A Repor</span>` : '';

            rowsHTML += `
                <tr>
                    <td style="font-size:0.75rem; color:var(--text-sub); padding:8px 5px; border-bottom:1px solid #333;">${dateStr}</td>
                    <td style="font-size:0.85rem; padding:8px 5px; border-bottom:1px solid #333;"><strong>${t.category}</strong>${pendingBadge}<br><span style="font-size:0.7rem; color:#888;">${t.note}</span></td>
                    <td style="color:${color}; font-weight:bold; text-align:right; padding:8px 5px; border-bottom:1px solid #333;">
                        ${signal}${this._formatMoney(t.amount)}
                        <div style="margin-top: 5px; display: flex; justify-content: flex-end; gap: 5px;">
                            <button onclick="window.FinanceController.openEditModal('${t.id}')" style="background:none; border:none; color:#888; font-size:1rem; cursor:pointer;">✏️</button>
                            <button onclick="window.FinanceController.deleteTransaction('${t.id}')" style="background:none; border:none; color:var(--danger-color); font-size:1rem; cursor:pointer;">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        const table = document.createElement('div');
        table.className = 'logs-container';
        table.style.marginTop = '10px';
        table.innerHTML = `
            <table id="finance-log-table" style="width:100%; border-collapse: collapse;">
                <tbody>${rowsHTML}</tbody>
            </table>
        `;
        container.appendChild(table);
    },

    toggleModal: function(id, show) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.toggle('hidden', !show);
    },

    _injectModals: function() {
        if (!document.getElementById('modal-finance-transaction')) {
            const div = document.createElement('div');
            div.id = 'modal-finance-transaction';
            div.className = 'modal-overlay hidden';
            div.innerHTML = `
                <div class="modal-content">
                    <h3 class="gym-modal-title" id="fin-modal-title" style="margin-bottom:15px;">Nova Transação</h3>
                    <form id="form-finance-transaction">
                        <input type="hidden" id="fin-modal-type" value="gain">
                        
                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Valor (R$)</label>
                            <input type="number" id="fin-input-amount" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" step="0.01" required placeholder="0,00">
                        </div>
                        
                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Categoria</label>
                            <input type="text" id="fin-input-category" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" required placeholder="Ex: Uber, Gasolina, Lanche...">
                        </div>

                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Observação (Opcional)</label>
                            <input type="text" id="fin-input-note" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" placeholder="Detalhes...">
                        </div>

                        <div id="fin-pending-group" style="display:none; background:rgba(255,171,0,0.1); padding:10px; border-radius:8px; border:1px dashed var(--fin-tier-divida-leve); margin-bottom:15px;">
                            <label class="checkbox-label" style="color:var(--fin-tier-divida-leve); display:flex; align-items:center; gap:10px;">
                                <input type="checkbox" id="fin-input-pending" style="transform:scale(1.2);"> 
                                Marcar como Provisão / A Repor
                            </label>
                            <p style="font-size:0.75rem; color:#aaa; margin-top:5px; margin-left: 20px;">
                                O valor será descontado da carteira agora e ficará salvo na aba "A Repor" para controle futuro (ex: gasolina gasta mas não reposta no tanque).
                            </p>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary-btn" onclick="window.FinanceView.toggleModal('modal-finance-transaction', false)">Cancelar</button>
                            <button type="submit" class="primary-btn">Salvar</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(div);

            // Binding do form para o Controller
            document.getElementById('form-finance-transaction').addEventListener('submit', (e) => {
                e.preventDefault();
                if (window.FinanceController) window.FinanceController.submitTransaction();
            });
        }

        // MODAL UBER
        if (!document.getElementById('modal-finance-uber')) {
            const uberDiv = document.createElement('div');
            uberDiv.id = 'modal-finance-uber';
            uberDiv.className = 'modal-overlay hidden';
            uberDiv.innerHTML = `
                <div class="modal-content">
                    <h3 class="gym-modal-title" style="margin-bottom:15px; color: #fff;">🚗 Calculadora Uber</h3>
                    <form id="form-finance-uber">
                        
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="document.getElementById('uber-config-area').classList.toggle('hidden')">
                                <span style="font-size:0.85rem; color:#aaa;">⚙️ Configurações do Veículo</span>
                                <span style="color:#aaa;">▼</span>
                            </div>
                            <div id="uber-config-area" class="hidden" style="margin-top: 10px; display:flex; gap:10px;">
                                <div style="flex:1;">
                                    <label style="display:block; color:#aaa; font-size:0.75rem; margin-bottom:3px;">Km/Litro</label>
                                    <input type="number" id="uber-km-liter" style="width:100%; padding:8px; border-radius:4px; border:1px solid #444; background:#000; color:#fff;" step="0.1" required>
                                </div>
                                <div style="flex:1;">
                                    <label style="display:block; color:#aaa; font-size:0.75rem; margin-bottom:3px;">Preço Gasolina (R$)</label>
                                    <input type="number" id="uber-fuel-price" style="width:100%; padding:8px; border-radius:4px; border:1px solid #444; background:#000; color:#fff;" step="0.01" required>
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <div style="flex:1;">
                                <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Odômetro Inicial</label>
                                <input type="number" id="uber-km-start" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" step="0.1" required>
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Odômetro Final</label>
                                <input type="number" id="uber-km-end" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" step="0.1" required>
                            </div>
                        </div>

                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Faturamento Bruto (R$)</label>
                            <input type="number" id="uber-gross-revenue" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" step="0.01" required placeholder="0,00">
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary-btn" onclick="window.FinanceView.toggleModal('modal-finance-uber', false)">Cancelar</button>
                            <button type="submit" class="primary-btn">Calcular & Salvar</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(uberDiv);

            document.getElementById('form-finance-uber').addEventListener('submit', (e) => {
                e.preventDefault();
                if (window.FinanceController) window.FinanceController.processUberSession();
            });
        }

        // MODAL EDITAR TRANSAÇÃO
        if (!document.getElementById('modal-finance-edit')) {
            const editDiv = document.createElement('div');
            editDiv.id = 'modal-finance-edit';
            editDiv.className = 'modal-overlay hidden';
            editDiv.innerHTML = `
                <div class="modal-content">
                    <h3 class="gym-modal-title" style="margin-bottom:15px; color:#fff;">✏️ Editar Transação</h3>
                    <form id="form-finance-edit">
                        <input type="hidden" id="fin-edit-id">
                        <input type="hidden" id="fin-edit-type">
                        
                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Valor (R$)</label>
                            <input type="number" id="fin-edit-amount" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" step="0.01" required>
                        </div>
                        
                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Categoria</label>
                            <input type="text" id="fin-edit-category" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;" required>
                        </div>

                        <div style="margin-bottom:15px;">
                            <label style="display:block; color:#aaa; font-size:0.8rem; margin-bottom:5px;">Observação</label>
                            <input type="text" id="fin-edit-note" style="width:100%; padding:10px; border-radius:6px; border:1px solid #444; background:#000; color:#fff;">
                        </div>

                        <div id="fin-edit-pending-group" style="display:none; background:rgba(255,171,0,0.1); padding:10px; border-radius:8px; border:1px dashed var(--fin-tier-divida-leve); margin-bottom:15px;">
                            <label class="checkbox-label" style="color:var(--fin-tier-divida-leve); display:flex; align-items:center; gap:10px;">
                                <input type="checkbox" id="fin-edit-pending" style="transform:scale(1.2);"> 
                                Marcar como Provisão / A Repor
                            </label>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary-btn" onclick="window.FinanceView.toggleModal('modal-finance-edit', false)">Cancelar</button>
                            <button type="submit" class="primary-btn">Atualizar</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(editDiv);

            document.getElementById('form-finance-edit').addEventListener('submit', (e) => {
                e.preventDefault();
                if (window.FinanceController) window.FinanceController.submitEditTransaction();
            });
        }
    }
};